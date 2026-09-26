import { prisma } from '../db.ts';
import type { Actor } from './access.ts';
import { record } from './audit.ts';
import { now } from './clock.ts';
import {
  createRawToken,
  createSessionValue,
  digest,
  escapeHtml,
  loginLink,
  loginRateExceeded,
  maskEmail,
  normalizeEmail,
  RATE_WINDOW_MS,
  sameDigest,
  SELECTOR_LENGTH,
  SESSION_MAX_DAYS,
  SESSION_TTL_DAYS,
  splitToken,
  TOKEN_TTL_MINUTES,
} from './token.ts';

/**
 * Вход в кабинет по одноразовой ссылке. Пароля нет ни в каком виде.
 *
 * Здесь собрана та часть входа, которая работает с базой и почтой: выдача
 * ссылки, её погашение, открытие и отзыв сессии. Форма токена, свёртки и
 * сверка живут в `token.ts` и проверяются тестами отдельно.
 */

export { SESSION_COOKIE, SESSION_TTL_DAYS, TOKEN_TTL_MINUTES } from './token.ts';

/**
 * Исход запроса ссылки. Наружу он не раскрывается: форма отвечает одинаково
 * и тому, чей адрес зарегистрирован, и тому, чей нет. Иначе форма входа
 * превращается в средство проверки, кто является клиентом практики.
 *
 * Исключение — `channel_off`: почта либо настроена, либо нет, и от адреса
 * это не зависит. Молчать о нём хуже: человек ждал бы письма, которого не
 * существует, и считал бы, что не помнит свой адрес (решение Р-163).
 */
export type LoginRequestOutcome =
  | 'sent'
  | 'rate_limited'
  | 'unknown_email'
  | 'not_active'
  | 'channel_off';

export async function requestLoginLink(
  rawEmail: string,
  ip: string,
  options: {
    /**
     * Куда отложить отправку письма. Форма входа передаёт сюда `after` из
     * `next/server`: письмо уходит после ответа, и время ответа не зависит
     * от того, есть ли такой адрес (решение Р-239). Без параметра письмо
     * отправляется сразу — так проверяют исход отправки.
     */
    readonly defer?: (task: () => Promise<void>) => void;
  } = {},
): Promise<LoginRequestOutcome> {
  const email = normalizeEmail(rawEmail);

  // Состояние канала спрашивается первым и до поиска человека в базе: так
  // ответ одинаков для любого адреса и о существовании учётной записи не
  // говорит ничего.
  const { mailConfigured } = await import('./mail.ts');
  if (!mailConfigured()) {
    await prisma.loginAttempt.create({
      data: { emailNormalized: email, ip, outcome: 'channel_off' },
    });
    return 'channel_off';
  }

  // Решение о частоте и запись попытки идут под замком адреса и замком IP
  // в одной транзакции (решение Р-251). Прежде строка попытки ложилась в
  // отложенной отправке, уже после ответа: двадцать параллельных запросов
  // на один адрес видели пустой счётчик и получали двадцать ссылок. Теперь
  // попытка пишется до отправки с исходом «выдано», а итог отправки
  // дописывается в ту же строку потом. Замок транзакционный, снимается сам
  // вместе с ней; ключи — пара чисел с классом, чтобы адрес не мог
  // совпасть с IP или с замком переноса книги (одно число, иное
  // пространство). Порядок один — сначала адрес, потом IP — и взаимной
  // блокировки нет: никто не ждёт замка адреса, держа замок IP. Схема
  // пределов (пара «адрес + IP», потолок адреса, свой узел владельца) —
  // в `token.ts`, у `loginRateExceeded`.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const decision = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_EMAIL}::int, hashtext(${email}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_IP}::int, hashtext(${ip}))`;

      const user = await tx.user.findUnique({ where: { email } });
      const [byPair, byEmail, byIp, knownIp] = await Promise.all([
        // Отказы по частоте в счёт адреса не идут: иначе пять запросов с
        // любых узлов запирали человека, а каждая его попытка продлевала
        // запор ещё на час (решение Р-232).
        tx.loginAttempt.count({
          where: { emailNormalized: email, ip, occurredAt: { gte: since }, outcome: { not: 'rate_limited' } },
        }),
        tx.loginAttempt.count({
          where: { emailNormalized: email, occurredAt: { gte: since }, outcome: { not: 'rate_limited' } },
        }),
        tx.loginAttempt.count({ where: { ip, occurredAt: { gte: since } } }),
        // Узел, с которого владелец уже входил: сессию на его имя чужой узел
        // получить не может, поэтому потолок адреса его не касается.
        // Безымянный узел («unknown» — прокси не передал адрес) своим не
        // считается: под ним сливаются все, и обход потолка был бы общим.
        user === null || ip === 'unknown'
          ? Promise.resolve(false)
          : tx.session
              .count({
                where: {
                  userId: user.id,
                  ip,
                  createdAt: { gte: new Date(Date.now() - SESSION_MAX_DAYS * 24 * 60 * 60 * 1000) },
                },
              })
              .then((n) => n > 0),
      ]);

      const attempt = (outcome: string) =>
        tx.loginAttempt.create({ data: { emailNormalized: email, ip, outcome }, select: { id: true } });

      if (loginRateExceeded({ byPair, byEmail, byIp, knownIp })) {
        await attempt('rate_limited');
        return { outcome: 'rate_limited' as const };
      }
      if (user === null) {
        await attempt('unknown_email');
        return { outcome: 'unknown_email' as const };
      }
      if (user.status !== 'ACTIVE') {
        await attempt('not_active');
        return { outcome: 'not_active' as const };
      }

      const token = createRawToken();
      await tx.loginToken.create({
        data: {
          selector: token.selector,
          verifierHash: digest(token.verifier),
          userId: user.id,
          purpose: 'LOGIN',
          expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
          requestIp: ip,
        },
      });
      const { id } = await attempt('issued');
      return { outcome: 'issued' as const, attemptId: id, user, token };
    },
    // Параллельные запросы на один адрес ждут замка друг за другом; каждый
    // держит его миллисекунды, но очередь из двадцати не должна упираться
    // в предел ожидания по умолчанию.
    { maxWait: 15_000, timeout: 15_000 },
  );

  if (decision.outcome !== 'issued') return decision.outcome;
  const { attemptId, user, token } = decision;

  // Исход отправки дописывается по факту, а не до неё. Прежде в журнал
  // всегда ложилось «отправлено», и разобрать по нему, дошло ли письмо,
  // было нельзя. Сама строка уже есть — её исход «выдано» меняется на
  // итог; в счёте частоты она участвует с момента выдачи.
  const send = async () => {
    const delivered = await deliverLoginLink(user.email, user.fullName, token.value);
    await prisma.loginAttempt.update({
      where: { id: attemptId },
      data: { outcome: delivered ? 'sent' : 'send_failed' },
    });
  };
  if (options.defer === undefined) await send();
  else options.defer(send);

  // Наружу отказ отправки не выносится: письмо не уходит только по
  // существующему адресу, и отдельный ответ выдал бы, что такой адрес есть.
  // Разбирается это по журналу попыток входа.
  return 'sent';
}

/** Классы транзакционных замков запроса ссылки: адрес и IP (Р-251). */
const LOCK_EMAIL = 251_001;
const LOCK_IP = 251_002;

async function deliverLoginLink(
  email: string,
  fullName: string,
  tokenValue: string,
): Promise<boolean> {
  // Импорт отложен: модуль почты тянет nodemailer, а разбор токена и
  // ограничение частоты должны проверяться без него.
  const { sendMailTo } = await import('./mail.ts');
  const link = loginLink(tokenValue);
  const html =
    `<div style="font:15px/1.6 'Helvetica Neue',Arial,sans-serif;color:#14161C">` +
    `<p style="margin:0 0 16px">${escapeHtml(fullName)}, здравствуйте.</p>` +
    `<p style="margin:0 0 16px">Ссылка для входа в личный кабинет ProDisser:</p>` +
    `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" ` +
    `style="color:#14417A">Войти в кабинет</a></p>` +
    `<p style="margin:0 0 16px;color:#5C6474;font-size:13px">Ссылка действует ` +
    `${TOKEN_TTL_MINUTES} минут и срабатывает один раз. Если вход запрашивали не вы, ` +
    `письмо можно не открывать: без перехода по ссылке ничего не произойдёт.</p>` +
    `</div>`;
  const text =
    `${fullName}, здравствуйте.\n\n` +
    `Ссылка для входа в личный кабинет ProDisser:\n${link}\n\n` +
    `Ссылка действует ${TOKEN_TTL_MINUTES} минут и срабатывает один раз.\n`;
  const result = await sendMailTo(email, 'Вход в личный кабинет ProDisser', html, text);
  return result.ok;
}

/**
 * Погасить ссылку и открыть сессию. Возвращает значение cookie либо `null`,
 * если ссылка недействительна: просрочена, уже использована или подделана.
 * Причина наружу не сообщается — разные сообщения дали бы подсказку.
 */
export async function consumeLoginToken(
  value: string,
  ip: string,
  userAgent: string | null,
): Promise<string | null> {
  const parsed = splitToken(value);
  if (parsed === null) return null;

  const token = await prisma.loginToken.findUnique({ where: { selector: parsed.selector } });
  if (token === null) return null;
  if (token.purpose !== 'LOGIN') return null;
  if (token.usedAt !== null) return null;
  if (token.expiresAt.getTime() < Date.now()) return null;
  if (!sameDigest(token.verifierHash, digest(parsed.verifier))) return null;

  // Погашение атомарно на стороне базы: два одновременных перехода по одной
  // ссылке не откроют две сессии.
  const consumed = await prisma.loginToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return null;

  return createSession(token.userId, ip, userAgent);
}

/**
 * Чей адрес у ссылки входа — замаскированным, для страницы с кнопкой
 * (решение Р-251).
 *
 * Подмена входа: злоумышленник запрашивает ссылку на свой адрес и
 * подсовывает её жертве; та нажимает «Войти» и работает в чужой записи,
 * загружая туда свои файлы. Страница теперь показывает, в чью запись
 * ведёт ссылка, и чужой адрес видно до нажатия.
 *
 * Ключ сверяется целиком — селектор, верификатор за постоянное время,
 * срок и одноразовость, — но не гасится. Подсказки о существовании ключей
 * это не даёт: адрес виден только тому, у кого в руках действующая
 * ссылка целиком, а он и так может войти по ней.
 */
export async function loginLinkOwner(value: string): Promise<string | null> {
  const parsed = splitToken(value);
  if (parsed === null) return null;
  const token = await prisma.loginToken.findUnique({
    where: { selector: parsed.selector },
    select: {
      purpose: true,
      usedAt: true,
      expiresAt: true,
      verifierHash: true,
      user: { select: { email: true, status: true } },
    },
  });
  if (token === null) return null;
  if (token.purpose !== 'LOGIN' || token.usedAt !== null) return null;
  if (token.expiresAt.getTime() < Date.now()) return null;
  if (!sameDigest(token.verifierHash, digest(parsed.verifier))) return null;
  if (token.user.status !== 'ACTIVE') return null;
  return maskEmail(token.user.email);
}

export async function createSession(
  userId: string,
  ip: string,
  userAgent: string | null,
): Promise<string> {
  const raw = createSessionValue();
  await prisma.$transaction([
    prisma.session.create({
      data: {
        tokenHash: digest(raw),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
        ip,
        userAgent,
      },
    }),
    // Отметка последнего входа — подпись на экранах учётных записей и
    // реестра, ни одна проверка на неё не опирается. Поэтому она идёт по
    // часам кабинета: в бою это настоящее время, а снимок не несёт дня
    // съёмки (решение Р-217). Срок сессии выше — по настоящим часам.
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now() } }),
  ]);
  return raw;
}

/**
 * Восстановить действующее лицо по значению cookie. Сессии серверные:
 * отозвать их нужно мгновенно при обезличивании субъекта и при смене роли,
 * а подписанный токен отозвать нельзя.
 */
export async function resolveSession(raw: string | undefined): Promise<Actor | null> {
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: digest(raw) },
    include: {
      user: {
        include: {
          clientProfile: { select: { id: true } },
          expertProfile: { select: { ndaSignedAt: true } },
        },
      },
    },
  });
  if (session === null) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  // Абсолютный предел от открытия сессии (решение Р-251). Проверяется и
  // сам по себе, а не только через срок: строки, продлённые до этого
  // решения, могли уйти за предел.
  const hardLimit = session.createdAt.getTime() + SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
  if (hardLimit < Date.now()) return null;

  const { user } = session;
  if (user.status !== 'ACTIVE') return null;

  // Скользящее продление: отметка последнего обращения обновляется не чаще
  // раза в час, чтобы каждый просмотр страницы не порождал запись. Новый
  // срок не выходит за абсолютный предел: через девяносто дней от входа
  // нужна новая ссылка, как бы часто человек ни заходил.
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(),
        expiresAt: new Date(Math.min(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000, hardLimit)),
      },
    });
  }

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    clientProfileId: user.clientProfile?.id ?? null,
    expertNdaSignedAt: user.expertProfile?.ndaSignedAt ?? null,
  };
}

export async function revokeSession(raw: string | undefined): Promise<void> {
  if (!raw) return;
  await prisma.session.updateMany({
    where: { tokenHash: digest(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Отзыв всех сессий пользователя: смена роли, обезличивание, выход отовсюду. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.loginToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
}

/**
 * Ссылка привязки Telegram. Устроена как ссылка входа, но с другим
 * назначением: перейдя по ней в браузере, войти нельзя, а погасив её в боте,
 * нельзя получить сессию. Разделение здесь не формальность — ссылка уходит
 * в мессенджер, где её видит и пересылает кто угодно.
 */
export async function createTelegramBindLink(userId: string): Promise<string | null> {
  if (!telegramBindAvailable()) return null;
  const bot = process.env.TELEGRAM_BOT_USERNAME!;
  const token = createRawToken();
  await prisma.loginToken.create({
    data: {
      selector: token.selector,
      verifierHash: digest(token.verifier),
      userId,
      purpose: 'BIND_TELEGRAM',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      requestIp: 'cabinet',
    },
  });
  // Параметр запуска бота допускает только латиницу, цифры, `_` и `-`:
  // точка между частями ключа в него не проходит, и бот получал голый
  // /start. Части склеиваются без разделителя — селектор всегда
  // шестнадцать знаков (решение Р-238).
  return `https://t.me/${bot}?start=${token.selector}${token.verifier}`;
}

/**
 * Привязка возможна, только когда бот настроен целиком: имя бота и секрет
 * вебхука. Без секрета маршрут бота отвечает 404 на всё, и ссылка вела в
 * тишину — человек отправлял /start, и ничего не происходило (решение
 * Р-246).
 */
export function telegramBindAvailable(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_USERNAME) && Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
}

/** Ключ из параметра бота: без точки части разделяются по длине селектора. */
function bindValue(value: string): string {
  if (value.includes('.') || value.length <= SELECTOR_LENGTH) return value;
  return `${value.slice(0, SELECTOR_LENGTH)}.${value.slice(SELECTOR_LENGTH)}`;
}

/**
 * Погашение метки привязки. Возвращает признак успеха, но наружу он не
 * уходит: бот на неизвестную метку не отвечает ничем.
 */
export async function bindTelegram(value: string, chatId: string): Promise<boolean> {
  const parsed = splitToken(bindValue(value));
  if (parsed === null) return false;

  const token = await prisma.loginToken.findUnique({ where: { selector: parsed.selector } });
  if (token === null) return false;
  if (token.purpose !== 'BIND_TELEGRAM') return false;
  if (token.usedAt !== null) return false;
  if (token.expiresAt.getTime() < Date.now()) return false;
  if (!sameDigest(token.verifierHash, digest(parsed.verifier))) return false;

  const consumed = await prisma.loginToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return false;

  // Один аккаунт Telegram — одна учётная запись: привязка у прежнего
  // владельца снимается, иначе уведомления уходили бы двоим.
  const [, bound] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: token.userId } },
      data: { telegramChatId: null, notifyTelegram: false },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: { telegramChatId: chatId, notifyTelegram: true },
      select: { id: true, role: true, status: true },
    }),
  ]);
  // Привязка — новый адрес доставки уведомлений о работе; в журнал идёт
  // факт без номера чата (решение Р-242).
  await record(
    { id: bound.id, role: bound.role, status: bound.status, clientProfileId: null, expertNdaSignedAt: null },
    { action: 'TELEGRAM_BOUND', objectType: 'User', objectId: bound.id },
  );
  return true;
}

/** Снять привязку по требованию пользователя. */
export async function unbindTelegram(actor: Actor): Promise<void> {
  await prisma.user.update({
    where: { id: actor.id },
    data: { telegramChatId: null, notifyTelegram: false },
  });
  await record(actor, { action: 'TELEGRAM_UNBOUND', objectType: 'User', objectId: actor.id });
}
