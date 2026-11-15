/**
 * Дата из поля формы — строго день, который существует (решение Р-908).
 *
 * Прежде строка уходила в `new Date(...)` как есть: «2026-02-31»
 * становилось 3 марта, год «0026» (в поле набрано «26») принимался, а
 * нечитаемое значение молча превращалось в «без срока». Срок этапа,
 * работы и транша сохранялся таким, и клиент получал письмо с датой,
 * которой никто не выбирал; заказ с годом 0026 получал код `PD-26-…`
 * (аудит 15.11.2026, находка Ф-10).
 *
 * Пустое значение — отсутствие даты, а не «сегодня». День — полночь UTC,
 * как у остальных сроков кабинета. Модуль чистый: проверяется встроенным
 * `node --test` без базы.
 */

/** Отказ: значение не читается как дата или такого дня нет. */
export const DATE_WRONG = 'Дата указана неверно: выберите день в календаре поля';

/** Отказ: год вне разумных пределов — обычно набран двумя цифрами. */
export const DATE_YEAR_WRONG = 'Проверьте год даты: он набран не целиком или вне пределов 2000—2100';

export function formDate(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
  if (parts === null) throw new Error(DATE_WRONG);
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Обратная сверка: 31 февраля дало бы 3 марта.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(DATE_WRONG);
  if (year < 2000 || year > 2100) throw new Error(DATE_YEAR_WRONG);
  return date;
}
