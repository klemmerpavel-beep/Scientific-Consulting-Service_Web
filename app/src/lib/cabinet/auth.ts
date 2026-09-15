import { prisma } from '../db.ts';
import type { Actor } from './access.ts';
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
 */
export type LoginRequestOutcome = 'sent' | 'rate_limited' | 'unknown_email' | 'not_active';

export async function requestLoginLink(
  rawEmail: string,
  ip: string,
): Promise<LoginRequestOutcome> {
  const email = normalizeEmail(rawEmail);
  const since = new Date(Date.now() - RATE_WINDOW_MS);

  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { emailNormalized: email, occurredAt: { gte: since } } }),
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
  await prisma.$transaction([
    prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId: user.id,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
        requestIp: ip,
      },
    }),
    prisma.loginAttempt.create({
      data: { emailNormalized: email, ip, outcome: 'sent' },
    }),
  ]);

  await deliverLoginLink(user.email, user.fullName, token.value);
  return 'sent';
}

async function deliverLoginLink(email: string, fullName: string, tokenValue: string) {
  // Импорт отложен: модуль почты тянет nodemailer, а разбор токена и
  // ограничение частоты должны проверяться без него.
  const { sendMailTo } = await import('./mail');
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
  await sendMailTo(email, 'Вход в личный кабинет ProDisser', html, text);
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
    prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
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
