import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { resolveSession } from './auth.ts';
import type { Actor } from './access.ts';
import { OPEN_COOKIE, OPEN_COOKIE_SECONDS, openPath, packOpen, unpackOpen } from './next-path.ts';
import { SESSION_COOKIE, SESSION_MAX_DAYS } from './token.ts';

/**
 * Действующее лицо текущего запроса. Единственный источник: серверная
 * сессия по значению cookie. Ни роль, ни идентификатор не приходят
 * с клиента — иначе их можно было бы подменить заголовком.
 */
export async function currentActor(): Promise<Actor | null> {
  return resolveSession(await currentSessionValue());
}

/**
 * Действующее лицо экрана `path`. Без сессии человек идёт через
 * `/cabinet/open` и после входа возвращается на этот экран (требование
 * Т-06, решение Р-309). Прежде каждый экран вёл на общий `/cabinet`, и
 * после входа человек оказывался на начальном экране, а не там, куда шёл.
 */
export async function requireActor(path: string): Promise<Actor> {
  const actor = await currentActor();
  if (actor === null) redirect(openPath(path));
  return actor;
}

/** Куда человек шёл и с каким адресом — из cookie обработчика открытия. */
export async function openIntent(): Promise<{ to: string; email: string | null } | null> {
  const jar = await cookies();
  return unpackOpen(jar.get(OPEN_COOKIE)?.value);
}

/** Стереть намерение: после входа оно исполнено. */
export async function clearOpenIntent(): Promise<void> {
  const jar = await cookies();
  jar.set(OPEN_COOKIE, '', shortCookie(0));
}

/** Свойства коротких cookie раздела: намерение и устаревшая ссылка. */
function shortCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/cabinet',
    maxAge,
  };
}

/**
 * Запомнить адрес, на который просили ссылку: страница «письмо отправлено»
 * предлагает «Прислать ещё раз» с тем же адресом (требование Т-07, решение
 * Р-313). Адрес — набранный самим человеком в этом браузере; путь возврата
 * сохраняется.
 */
export async function rememberEmail(email: string, next: string | null): Promise<void> {
  const intent = await openIntent();
  const jar = await cookies();
  jar.set(OPEN_COOKIE, packOpen(next ?? intent?.to ?? '/cabinet', email), shortCookie(OPEN_COOKIE_SECONDS));
}

/** Cookie устаревшей ссылки входа: для «Прислать новую ссылку» (Т-07, Р-313). */
const STALE_COOKIE = 'pd_stale';

export async function rememberStaleLink(value: string): Promise<void> {
  if (value.length === 0 || value.length > 200) return;
  const jar = await cookies();
  jar.set(STALE_COOKIE, value, shortCookie(OPEN_COOKIE_SECONDS));
}

export async function staleLink(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(STALE_COOKIE)?.value || null;
}

export async function clearStaleLink(): Promise<void> {
  const jar = await cookies();
  jar.set(STALE_COOKIE, '', shortCookie(0));
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
 * Дольше абсолютного предела сессии хранить значение незачем: после него
 * запись в базе недействительна при любых обращениях (решение Р-251).
 */
const COOKIE_MAX_DAYS = SESSION_MAX_DAYS;

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
