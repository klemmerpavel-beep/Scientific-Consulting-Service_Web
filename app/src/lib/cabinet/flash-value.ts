/**
 * Значение одноразового сообщения об отказе (решение Р-243). Отдельно от
 * `lib/cabinet/flash.ts`: здесь нет обращения к cookie запроса, и
 * упаковка проверяется тестами без сервера.
 */

const MAX_TEXT = 300;

/** Метка в адресе — только двенадцать шестнадцатеричных знаков. */
export const FLASH_ID = /^[0-9a-f]{12}$/u;

/** Значение cookie: метка и текст, base64url — кириллица в cookie не кладётся как есть. */
export function packFlash(id: string, text: string, slot?: string): string {
  return Buffer.from(
    JSON.stringify({ id, text: text.slice(0, MAX_TEXT), ...(slot === undefined ? {} : { slot }) }),
    'utf8',
  ).toString('base64url');
}

/** Отказ с местом вывода: экран показывает причину рядом с формой `slot` (Р-279). */
export interface FlashEntry {
  readonly text: string;
  readonly slot?: string;
}

/** Причина и место её вывода, если метка совпала; иначе ничего. */
export function unpackFlashEntry(raw: string | undefined, id: string): FlashEntry | undefined {
  if (raw === undefined || !FLASH_ID.test(id)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      id?: unknown;
      text?: unknown;
      slot?: unknown;
    };
    if (parsed.id !== id || typeof parsed.text !== 'string') return undefined;
    const text = parsed.text.slice(0, MAX_TEXT);
    return typeof parsed.slot === 'string' && SLOT.test(parsed.slot) ? { text, slot: parsed.slot } : { text };
  } catch {
    return undefined;
  }
}

/** Имя места вывода — короткое слово латиницей. */
const SLOT = /^[a-z-]{1,24}$/u;

/**
 * Предел черновика формы в байтах JSON. Cookie держит около 4 КБ, base64url
 * раздувает значение на треть: 2 800 байт — около полутора тысяч знаков
 * кириллицы. Черновик длиннее не сохраняется, и причина об этом говорит.
 */
export const MAX_DRAFT_BYTES = 2800;

/**
 * Черновик формы — значения полей, введённые до отказа (решение Р-279).
 * `null`, если черновик не помещается в cookie.
 */
export function packDraft(id: string, fields: Readonly<Record<string, string>>): string | null {
  const json = JSON.stringify({ id, fields });
  if (Buffer.byteLength(json, 'utf8') > MAX_DRAFT_BYTES) return null;
  return Buffer.from(json, 'utf8').toString('base64url');
}

/** Значения полей черновика, если метка совпала; иначе ничего. */
export function unpackDraft(
  raw: string | undefined,
  id: string,
): Readonly<Record<string, string>> | undefined {
  if (raw === undefined || !FLASH_ID.test(id)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      id?: unknown;
      fields?: unknown;
    };
    if (parsed.id !== id || typeof parsed.fields !== 'object' || parsed.fields === null) return undefined;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.fields)) {
      if (typeof value === 'string') fields[key] = value;
    }
    return fields;
  } catch {
    return undefined;
  }
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
