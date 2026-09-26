/**
 * Обнаружение контактных данных в тексте сообщения.
 *
 * Закрытие контактов в карточках теряет смысл, если контакт можно передать
 * первой же строкой переписки. Поэтому сообщения с телефоном, адресом почты
 * или именем в мессенджере помечаются — но не блокируются: запрет породил бы
 * обход через «пишите мне в тот же чат, где обсуждали», а пометка даёт
 * менеджеру повод вмешаться.
 *
 * Модуль без зависимостей и без обращений к базе: проверяется тестами
 * построчно, на настоящих формулировках.
 */

/** Адрес электронной почты. */
const EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/u;

/**
 * Имя в мессенджере: собака и латиница. Отделяется от адреса почты тем,
 * что перед собакой нет знака.
 */
const HANDLE = /(^|[\s(,;:—-])@[A-Za-z][A-Za-z0-9_]{3,}/;

/** Ссылка на мессенджер. */
const MESSENGER_LINK = /\b(?:t\.me|telegram\.me|wa\.me|whatsapp\.com|vk\.com)\b/i;

/**
 * Телефон. Считаем цифры в последовательности, допускающей пробелы, скобки,
 * дефисы и точки: одиннадцать цифр подряд в таком виде — это номер, а не
 * номер ГОСТа и не сумма.
 */
const PHONE_CANDIDATE = /(?:\+?\d[\d\s().-]{8,}\d)/g;

export interface ContactHit {
  readonly kind: 'email' | 'phone' | 'handle' | 'link';
  readonly sample: string;
}

export function findContacts(text: string): ContactHit[] {
  const hits: ContactHit[] = [];

  const email = text.match(EMAIL);
  if (email !== null) hits.push({ kind: 'email', sample: email[0] });

  const handle = text.match(HANDLE);
  if (handle !== null) hits.push({ kind: 'handle', sample: handle[0].trim() });

  const link = text.match(MESSENGER_LINK);
  if (link !== null) hits.push({ kind: 'link', sample: link[0] });

  for (const candidate of text.match(PHONE_CANDIDATE) ?? []) {
    const digits = candidate.replace(/\D/g, '');
    // Российский номер — десять цифр без кода страны, одиннадцать с ним.
    // Более длинные последовательности — это уже не телефон.
    if (digits.length >= 10 && digits.length <= 12) {
      hits.push({ kind: 'phone', sample: candidate.trim() });
      break;
    }
  }

  return hits;
}

export function hasContacts(text: string): boolean {
  return findContacts(text).length > 0;
}

// ───────────────── Сверка контактов при обезличивании ──────────────────────

/**
 * Адрес почты в виде для сверки: без пробелов и без учёта регистра.
 * `null` — значение адресом почты не является.
 *
 * Прежде заявки субъекта искались точным совпадением контакта, и
 * «Ivanov@Mail.ru » в заявке не находилось по «ivanov@mail.ru» в карточке:
 * заявка переживала обезличивание со всеми полями (решение Р-252).
 */
export function emailKey(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const compact = value.replace(/\s+/gu, '').toLowerCase();
  return /^[^@]+@[^@]+$/u.test(compact) ? compact : null;
}

/**
 * Телефон в виде для сверки: последние десять цифр. Так сходятся
 * «+7 900 000-00-00», «8 (900) 000 00 00» и «9000000000». Меньше десяти
 * цифр — не телефон, а обрывок: по нему сверять нельзя.
 */
export function phoneKey(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = value.replace(/\D/gu, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Контакты субъекта, сведённые к виду сверки. */
export interface ContactKeys {
  readonly emails: ReadonlySet<string>;
  readonly phones: ReadonlySet<string>;
}

export function contactKeys(values: readonly (string | null | undefined)[]): ContactKeys {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const value of values) {
    const email = emailKey(value);
    if (email !== null) {
      emails.add(email);
      continue;
    }
    const phone = phoneKey(value);
    if (phone !== null) phones.add(phone);
  }
  return { emails, phones };
}

/**
 * Оставил ли заявку этот субъект: контакт заявки — его почта или телефон,
 * либо телефон из заявки кабинета (`Lead.phone`) — его телефон.
 *
 * Цифры адреса почты за телефон не принимаются: «ivan9001234567@mail.ru»
 * не должен совпасть с номером 900 123-45-67.
 */
export function leadMatchesContacts(
  lead: { readonly contact: string; readonly phone: string | null },
  keys: ContactKeys,
): boolean {
  const email = emailKey(lead.contact);
  if (email !== null) {
    if (keys.emails.has(email)) return true;
  } else {
    const phone = phoneKey(lead.contact);
    if (phone !== null && keys.phones.has(phone)) return true;
  }
  const extra = phoneKey(lead.phone);
  return extra !== null && keys.phones.has(extra);
}
