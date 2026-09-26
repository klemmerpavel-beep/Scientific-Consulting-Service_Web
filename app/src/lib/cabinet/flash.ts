import { randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

import { FLASH_ID, packFlash, unpackFlash } from './flash-value';

/**
 * Причина отказа действия — одноразовым сообщением, а не текстом в адресе.
 *
 * Прежде причина уходила экрану параметром `?error=<текст>`, и экран
 * печатал его как есть. Ссылку с любой фразой — «позвоните по номеру…»,
 * «ваш доступ приостановлен» — мог собрать кто угодно, и кабинет показал
 * бы её красной плашкой от своего имени (решение Р-243). Теперь текст
 * лежит в cookie только у того, чьё действие отказало, а в адресе — метка
 * без смысла. Экран показывает текст, только если метка совпала с cookie:
 * чужая ссылка ничего не выводит.
 */

const NAME = 'pd_flash';

/** Положить причину и вернуть метку для адреса. Вызывается из серверного действия. */
export async function flash(text: string): Promise<string> {
  const id = randomBytes(6).toString('hex');
  (await cookies()).set(NAME, packFlash(id, text), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/cabinet',
    maxAge: 300,
  });
  return id;
}

/** Текст причины по метке из адреса; чужая или устаревшая метка — ничего. */
export async function flashText(id: string | undefined): Promise<string | undefined> {
  if (id === undefined || !FLASH_ID.test(id)) return undefined;
  return unpackFlash((await cookies()).get(NAME)?.value, id);
}

/** Адрес возврата на экран с меткой отказа. */
export async function withError(path: string, reason: string): Promise<string> {
  return `${path}?error=${await flash(reason)}`;
}
