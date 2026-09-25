import { prisma } from '../db.ts';
import type { Actor } from './access.ts';
import { now } from './clock.ts';
import {
  createRawToken,
  createSessionValue,
  digest,
  escapeHtml,
  loginLink,
  normalizeEmail,
  RATE_PER_EMAIL,
  RATE_PER_IP,
  RATE_WINDOW_MS,
  sameDigest,
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

  const since = new Date(Date.now() - RATE_WINDOW_MS);

  const [byEmail, byIp] = await Promise.all([
    // Отказы по частоте в счёт адреса не идут: иначе пять запросов с
    // любых узлов запирали человека, а каждая его попытка продлевала запор
    // ещё на час (решение Р-232).
    prisma.loginAttempt.count({
      where: { emailNormalized: email, occurredAt: { gte: since }, outcome: { not: 'rate_limited' } },
    }),
    prisma.loginAttempt.count({ where: { ip, occurredAt: { gte: since } } }),
  ]);

  if (byEmail >= RATE_PER_EMAIL || byIp >= RATE_PER_IP) {
    await prisma.loginAttempt.create({
      data: { emailNormalized: email, ip, outcome: 'rate_limited' },
    });
    return 'rate_limited';
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user === null) {
    await prisma.loginAttempt.create({
      data: { emailNormalized: email, ip, outcome: 'unknown_email' },
    });
    return 'unknown_email';
  }
  if (user.status !== 'ACTIVE') {
    await prisma.loginAttempt.create({
      data: { emailNormalized: email, ip, outcome: 'not_active' },
    });
    return 'not_active';
  }

  const token = createRawToken();
  await prisma.loginToken.create({
    data: {
      selector: token.selector,
      verifierHash: digest(token.verifier),
      userId: user.id,
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
      requestIp: ip,
    },
  });

  // Исход записывается по факту отправки, а не до неё. Прежде в журнал
  // всегда ложилось «отправлено», и разобрать по нему, дошло ли письмо,
  // было нельзя.
  const delivered = await deliverLoginLink(user.email, user.fullName, token.value);
  await prisma.loginAttempt.create({
    data: { emailNormalized: email, ip, outcome: delivered ? 'sent' : 'send_failed' },
  });

  // Наружу отказ отправки не выносится: письмо не уходит только по
  // существующему адресу, и отдельный ответ выдал бы, что такой адрес есть.
  // Разбирается это по журналу попыток входа.
  return 'sent';
}

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

  const { user } = session;
  if (user.status !== 'ACTIVE') return null;

  // Скользящее продление: отметка последнего обращения обновляется не чаще
  // раза в час, чтобы каждый просмотр страницы не порождал запись.
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
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
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return null;
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
  return `https://t.me/${bot}?start=${token.value}`;
}

/**
 * Погашение метки привязки. Возвращает признак успеха, но наружу он не
 * уходит: бот на неизвестную метку не отвечает ничем.
 */
export async function bindTelegram(value: string, chatId: string): Promise<boolean> {
  const parsed = splitToken(value);
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
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: token.userId } },
      data: { telegramChatId: null, notifyTelegram: false },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: { telegramChatId: chatId, notifyTelegram: true },
    }),
  ]);
  return true;
}

/** Снять привязку по требованию пользователя. */
export async function unbindTelegram(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, notifyTelegram: false },
  });
}
