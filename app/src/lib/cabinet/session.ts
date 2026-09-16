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
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
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

export async function setSessionCookie(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
