import { cookies, headers } from 'next/headers';

import { resolveSession } from './auth.ts';
import type { Actor } from './access.ts';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from './token.ts';

/**
 * Действующее лицо текущего запроса. Единственный источник: серверная
 * сессия по значению cookie. Ни роль, ни идентификатор не приходят
 * с клиента — иначе их можно было бы подменить заголовком.
 */
export async function currentActor(): Promise<Actor | null> {
  return resolveSession(await currentSessionValue());
}

/** Значение cookie сессии, с которым пришёл браузер. */
export async function currentSessionValue(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

/** Адрес обратившегося. nginx кладёт настоящий адрес в X-Real-IP. */
export async function requestIp(): Promise<string> {
  const h = await headers();
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    // Последний элемент списка добавлен ближайшим доверенным узлом;
    // первый может быть подставлен клиентом.
    const parts = forwarded.split(',');
    return (parts[parts.length - 1] ?? '').trim() || 'unknown';
  }
  return 'unknown';
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get('user-agent')?.slice(0, 400) ?? null;
}

/** Свойства cookie сессии: одни и те же при выдаче и при стирании. */
function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/**
 * Срок жизни cookie в браузере — с запасом над сроком сессии.
 *
 * Сессия скользящая: запись в базе продлевается при обращениях
 * (`resolveSession`), а cookie выдаётся один раз, при входе. Пока браузер
 * хранил её ровно тридцать дней, человек, заходящий каждый день, всё равно
 * терял вход через тридцать дней после входа (решение Р-238). Теперь
 * браузер хранит значение дольше, а действительность решает запись в
 * базе: тридцать дней без обращений — и сессии нет, отзыв — сразу.
 */
const COOKIE_MAX_DAYS = SESSION_TTL_DAYS * 6;

export async function setSessionCookie(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, sessionCookieOptions(COOKIE_MAX_DAYS * 24 * 60 * 60));
}

/**
 * Стирание cookie сессии. Прежде шло через `delete`, а тот отправляет
 * cookie без признака Secure; браузер отвергает такую запись для имени с
 * приставкой `__Host-`, и отозванное значение оставалось в браузере.
 * Стирается тем же набором свойств, с каким выдаётся (решение Р-232).
 */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', sessionCookieOptions(0));
}
