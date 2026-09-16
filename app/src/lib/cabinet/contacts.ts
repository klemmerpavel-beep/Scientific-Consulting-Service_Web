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
