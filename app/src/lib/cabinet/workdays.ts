/**
 * Рабочие дни для срока согласования этапа (требование Т-15, решение Р-290).
 *
 * Модуль чистый: ни базы, ни часов. День — московский, в том виде, в
 * каком кабинет хранит даты без времени: полночь UTC (`moscowToday` в
 * `clock.ts`).
 *
 * Правило по умолчанию — понедельник–пятница без нерабочих праздничных
 * дней ст. 112 ТК РФ. Переносы выходных по постановлению Правительства и
 * рабочие субботы приходят из производственного календаря (`CalendarDay`):
 * запись календаря сильнее правила в обе стороны. Без переносов срок по
 * п. 7.2 оферты разошёлся бы с производственным календарём на день.
 */

const DAY_MS = 86_400_000;

/** Рабочий ли день по календарю: ключ — `YYYY-MM-DD`. */
export type CalendarOverrides = ReadonlyMap<string, boolean>;

/** Нерабочие праздничные дни, ст. 112 ТК РФ: месяц и число. */
export const STATUTORY_HOLIDAYS: readonly string[] = [
  '01-01',
  '01-02',
  '01-03',
  '01-04',
  '01-05',
  '01-06',
  '01-07',
  '01-08',
  '02-23',
  '03-08',
  '05-01',
  '05-09',
  '06-12',
  '11-04',
];

/** Предел перебора: срок согласования — не больше 20 рабочих дней. */
const MAX_SCAN_DAYS = 400;

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function shift(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

export function isWorkday(day: Date, calendar: CalendarOverrides): boolean {
  const key = dayKey(day);
  const listed = calendar.get(key);
  if (listed !== undefined) return listed;
  const weekday = day.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !STATUTORY_HOLIDAYS.includes(key.slice(5));
}

/**
 * `count`-й рабочий день после `from`: сам `from` не считается — срок идёт
 * со дня, следующего за сдачей этапа. При `count` 0 — сам `from`.
 */
export function addWorkdays(from: Date, count: number, calendar: CalendarOverrides): Date {
  let day = from;
  let left = count;
  for (let step = 0; left > 0 && step < MAX_SCAN_DAYS; step += 1) {
    day = shift(day, 1);
    if (isWorkday(day, calendar)) left -= 1;
  }
  return day;
}

/** Рабочих дней в отрезке от `from` до `to` включительно; 0, если `to` раньше. */
export function workdaysBetween(from: Date, to: Date, calendar: CalendarOverrides): number {
  let count = 0;
  for (let day = from, step = 0; day.getTime() <= to.getTime() && step < MAX_SCAN_DAYS; step += 1) {
    if (isWorkday(day, calendar)) count += 1;
    day = shift(day, 1);
  }
  return count;
}

/** Ближайший рабочий день перед `day`. */
export function previousWorkday(day: Date, calendar: CalendarOverrides): Date {
  let back = shift(day, -1);
  for (let step = 0; !isWorkday(back, calendar) && step < MAX_SCAN_DAYS; step += 1) {
    back = shift(back, -1);
  }
  return back;
}
