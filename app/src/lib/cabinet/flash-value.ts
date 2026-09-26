/**
 * Значение одноразового сообщения об отказе (решение Р-243). Отдельно от
 * `lib/cabinet/flash.ts`: здесь нет обращения к cookie запроса, и
 * упаковка проверяется тестами без сервера.
 */

const MAX_TEXT = 300;

/** Метка в адресе — только двенадцать шестнадцатеричных знаков. */
export const FLASH_ID = /^[0-9a-f]{12}$/u;

/** Значение cookie: метка и текст, base64url — кириллица в cookie не кладётся как есть. */
export function packFlash(id: string, text: string): string {
  return Buffer.from(JSON.stringify({ id, text: text.slice(0, MAX_TEXT) }), 'utf8').toString(
    'base64url',
  );
}

/** Текст из значения cookie, если метка совпала; иначе ничего. */
export function unpackFlash(raw: string | undefined, id: string): string | undefined {
  if (raw === undefined || !FLASH_ID.test(id)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      id?: unknown;
      text?: unknown;
    };
    if (parsed.id !== id || typeof parsed.text !== 'string') return undefined;
    return parsed.text.slice(0, MAX_TEXT);
  } catch {
    return undefined;
  }
}
