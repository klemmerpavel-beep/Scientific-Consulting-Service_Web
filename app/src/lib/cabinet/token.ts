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
/**
 * Абсолютный предел сессии от её открытия. Скользящее продление за него не
 * выходит: иначе похищенная cookie, которой пользуются хоть раз в месяц,
 * жила бы вечно (решение Р-251).
 */
export const SESSION_MAX_DAYS = 90;

/**
 * Частота ссылок входа за час (решение Р-251). Счёт двухъярусный:
 * - не более пяти ссылок на пару «адрес + IP» — обычный предел для человека;
 * - не более десяти на адрес со всех IP вместе — потолок, чтобы ящик нельзя
 *   было засыпать письмами, меняя узлы;
 * - не более двадцати запросов с одного IP на любые адреса.
 * Потолок адреса не действует на IP, с которого владелец адреса уже входил
 * в кабинет: иначе чужие узлы, исчерпав потолок, запирали бы человека, и
 * его собственный запрос из дома не проходил бы. Предел пары действует и
 * там — пять ссылок в час с одного узла хватает с запасом.
 */
export const RATE_PER_EMAIL_IP = 5;
export const RATE_PER_EMAIL = 10;
export const RATE_PER_IP = 20;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Счётчики попыток за окно, по которым решается, выдавать ли ссылку. */
export type LoginRateCounts = {
  /** Попытки на этот адрес с этого IP, кроме отказов по частоте. */
  readonly byPair: number;
  /** Попытки на этот адрес со всех IP, кроме отказов по частоте. */
  readonly byEmail: number;
  /** Все попытки с этого IP на любые адреса. */
  readonly byIp: number;
  /** С этого IP владелец адреса уже входил в кабинет. */
  readonly knownIp: boolean;
};

/** Превышен ли предел частоты. Чистая функция: схема проверяется без базы. */
export function loginRateExceeded(counts: LoginRateCounts): boolean {
  if (counts.byIp >= RATE_PER_IP) return true;
  if (counts.byPair >= RATE_PER_EMAIL_IP) return true;
  if (!counts.knownIp && counts.byEmail >= RATE_PER_EMAIL) return true;
  return false;
}

/**
 * Адрес владельца ссылки в виде, который можно показать на странице входа:
 * первая буква имени, звёздочки и домен — `i***@mail.ru`. Человек видит, в
 * чью запись входит, и чужую ссылку, подсунутую ему для входа под чужим
 * именем, узнаёт до нажатия (решение Р-251). Полный адрес на странице не
 * показывается: ссылку мог открыть и посторонний, пересланную или из
 * предпросмотра.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = Array.from(local)[0] ?? '';
  return `${first}***@${domain}`;
}

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

/** Длина селектора: двенадцать случайных байт в base64url — шестнадцать знаков. */
export const SELECTOR_LENGTH = 16;

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
/**
 * Сравнение общего секрета за постоянное время (решение Р-246). Обе строки
 * сводятся к свёрткам одной длины: иначе длина секрета выдавала бы себя
 * временем отказа, а прямое сравнение — совпавшим началом.
 */
export function sameSecret(given: string | null | undefined, expected: string): boolean {
  if (given === null || given === undefined) return false;
  const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
  return sameDigest(hash(given), hash(expected));
}

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
