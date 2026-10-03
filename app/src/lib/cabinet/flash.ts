import { randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

import {
  FLASH_ID,
  packDraft,
  packFlash,
  unpackDraft,
  unpackFlash,
  unpackFlashEntry,
  type FlashEntry,
} from './flash-value';

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

/** Черновик формы: та же метка, тот же срок, отдельная cookie (решение Р-279). */
const DRAFT = 'pd_form';

const OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/cabinet',
  maxAge: 300,
};

/**
 * Положить причину и вернуть метку для адреса. Вызывается из серверного действия.
 *
 * `slot` называет форму, рядом с которой экран покажет причину; `draft` —
 * введённые значения, чтобы человек не набирал их заново. Черновик лежит
 * только у автора действия и живёт пять минут: в нём бывают название и тема
 * работы. Не поместившийся черновик не сохраняется, а причина говорит об
 * этом.
 */
export async function flash(
  text: string,
  options: { slot?: string; draft?: Readonly<Record<string, string>> } = {},
): Promise<string> {
  const id = randomBytes(6).toString('hex');
  const jar = await cookies();
  let reason = text;
  if (options.draft !== undefined) {
    const packed = packDraft(id, options.draft);
    if (packed === null) reason = `${text}. Введённый текст слишком длинный и не сохранён — наберите его заново.`;
    else jar.set(DRAFT, packed, OPTIONS);
  }
  jar.set(NAME, packFlash(id, reason, options.slot), OPTIONS);
  return id;
}

/** Текст причины по метке из адреса; чужая или устаревшая метка — ничего. */
export async function flashText(id: string | undefined): Promise<string | undefined> {
  if (id === undefined || !FLASH_ID.test(id)) return undefined;
  return unpackFlash((await cookies()).get(NAME)?.value, id);
}

/** Причина с местом вывода по метке из адреса. */
export async function flashEntry(id: string | undefined): Promise<FlashEntry | undefined> {
  if (id === undefined || !FLASH_ID.test(id)) return undefined;
  return unpackFlashEntry((await cookies()).get(NAME)?.value, id);
}

/** Черновик формы по метке из адреса. */
export async function formDraft(
  id: string | undefined,
): Promise<Readonly<Record<string, string>> | undefined> {
  if (id === undefined || !FLASH_ID.test(id)) return undefined;
  return unpackDraft((await cookies()).get(DRAFT)?.value, id);
}

/**
 * Адрес возврата на экран с меткой отказа. `anchor` — якорь формы: экран
 * открывается там, где отказало действие, а не в начале страницы.
 */
export async function withError(
  path: string,
  reason: string,
  options: { slot?: string; draft?: Readonly<Record<string, string>>; anchor?: string } = {},
): Promise<string> {
  const id = await flash(reason, options);
  return `${path}?error=${id}${options.anchor === undefined ? '' : `#${options.anchor}`}`;
}
