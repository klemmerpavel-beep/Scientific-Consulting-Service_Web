/**
 * Разбор полей обезличенного профиля куратора с формы руководителя (П-1,
 * решение Р-764): стаж и публикации — целыми числами, день сверки — датой
 * не позже сегодняшнего дня по Москве.
 *
 * Модуль чистый: ни базы, ни часов — «сегодня» передаёт вызывающий.
 */

/** Верхние пределы чисел профиля: опечатку «230» вместо «23» форма не пропустит. */
export const EXPERIENCE_YEARS_MAX = 70;
export const PUBLICATIONS_MAX = 500;

/**
 * Число профиля с формы: пусто — `null`, иначе целое от 0 до предела.
 * Без поля в запросе — `undefined`: значение не трогается.
 */
export function profileCount(value: string | undefined, max: number, what: string): number | null | undefined {
  if (value === undefined) return undefined;
  const text = value.trim().replace(/\s+/gu, '');
  if (text === '') return null;
  if (!/^\d{1,4}$/u.test(text) || Number(text) > max) throw new Error(`${what} — целым числом от 0 до ${max}`);
  return Number(text);
}

/**
 * День сверки публикаций с формы: «ГГГГ-ММ-ДД» → полночь UTC, как прочие
 * даты без времени. Не позже сегодняшнего дня по Москве (Р-257, Р-470):
 * `today` — `moscowToday()` вызывающего.
 */
export function profileCheckedOn(value: string | undefined, today: Date): Date | null | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (text === '') return null;
  const day = /^\d{4}-\d{2}-\d{2}$/u.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (day === null || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) {
    throw new Error('Дата сверки публикаций распознана неверно');
  }
  if (day.getTime() > today.getTime()) throw new Error('Дата сверки публикаций — не позже сегодняшнего дня');
  return day;
}
