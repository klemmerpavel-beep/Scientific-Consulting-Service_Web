import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { siteUrl } from '../site-url.ts';

/**
 * Одноразовые токены входа: форма, свёртка, сверка. Модуль намеренно не
 * знает ни о базе, ни о почте — только о значениях. Это делает его
 * проверяемым без поднятой базы и оставляет в `auth.ts` ровно ту часть,
 * которая работает с хранилищем.
 *
 * Токен состоит из двух частей — селектора и верификатора, — и в ссылку
 * уходят обе: `/cabinet/enter/<селектор>.<верификатор>`. Селектор даёт поиск
 * по индексу, верификатор сравнивается за постоянное время. Сам верификатор
 * в базе не хранится никогда: лежит только его свёртка вместе с серверным
 * секретом, поэтому копия базы сама по себе войти не позволяет.
 *
 * Разделение на две части заменяет два негодных варианта: искать по самому
 * токену — сравнение в индексе приоткрывает его посимвольно; перебирать все
 * непогашенные строки ради сравнения за постоянное время — работа растёт
 * вместе с таблицей.
 */

/** Срок жизни ссылки. Пятнадцати минут хватает дойти до почты и вернуться. */
export const TOKEN_TTL_MINUTES = 15;
/** Скользящий срок сессии. */
export const SESSION_TTL_DAYS = 30;

/** Не более пяти ссылок на один адрес и двадцати с одного адреса IP в час. */
export const RATE_PER_EMAIL = 5;
export const RATE_PER_IP = 20;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Имя cookie. Приставка `__Host-` требует защищённого соединения и потому
 * невозможна на `http://localhost`: в разработке имя без приставки.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-pd-session' : 'pd-session';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'SESSION_SECRET не задан или короче 32 символов. Без него свёртки токенов ' +
        'входа и сессий защищены только длиной случайной части — кабинет не поднимается.',
    );
  }
  return value;
}

/** Адрес в нижнем регистре без краевых пробелов. Единственная форма хранения. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Свёртка секретной части. Секрет процесса входит в неё, а не хранится рядом. */
export function digest(value: string): string {
  return createHash('sha256').update(`${value}:${secret()}`).digest('hex');
}

export interface RawToken {
  readonly selector: string;
  readonly verifier: string;
  /** То, что попадает в ссылку. */
  readonly value: string;
}

export function createRawToken(): RawToken {
  const selector = randomBytes(12).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  return { selector, verifier, value: `${selector}.${verifier}` };
}

/** Случайное значение сессии. */
export function createSessionValue(): string {
  return randomBytes(32).toString('base64url');
}

/** Разбор значения из ссылки. Любая неожиданная форма — это не токен. */
export function splitToken(value: string): RawToken | null {
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [selector, verifier] = parts;
  if (!selector || !verifier) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(selector) || !/^[A-Za-z0-9_-]+$/.test(verifier)) return null;
  return { selector, verifier, value };
}

/** Сравнение свёрток за постоянное время. */
export function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Адрес ссылки входа. Базовый адрес берётся из общего для сайта источника. */
export function loginLink(tokenValue: string): string {
  const base = siteUrl() ?? '';
  return `${base}/cabinet/enter/${tokenValue}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
