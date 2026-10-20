/**
 * Окно переписки (решение Р-636).
 *
 * Экран переписки открывается на последних сообщениях окном по сто. Прежде
 * ветка уходила в разметку целиком: у работы, которая идёт год, это сотни
 * пузырей при каждом открытии, а карточка работы читала всю ветку ради
 * восьми последних строк. Ранние сообщения — ссылкой «Показать ранние» над
 * лентой: каждое нажатие добавляет ещё одно окно.
 *
 * Модуль без обращений к базе: окно считают экраны, выборку делают функции
 * `messages.ts` с пределом `last`.
 */

/** Сколько последних сообщений показывает экран переписки. */
export const THREAD_WINDOW = 100;

/** Больше двадцати окон за раз экран не показывает. */
export const THREAD_WINDOW_MAX = 20 * THREAD_WINDOW;

/**
 * Окно из параметра адреса `show`: целое число окон, от одного до предела.
 * Неразборчивое значение — одно окно, а не ошибка: адрес правят руками.
 */
export function threadWindow(show: string | undefined): number {
  const asked = Number.parseInt(show ?? '', 10);
  if (!Number.isFinite(asked) || asked <= THREAD_WINDOW) return THREAD_WINDOW;
  return Math.min(THREAD_WINDOW_MAX, Math.ceil(asked / THREAD_WINDOW) * THREAD_WINDOW);
}

/** Последние сообщения ветки и признак того, что раньше есть ещё. */
export interface ThreadSlice<T> {
  readonly messages: readonly T[];
  readonly earlier: boolean;
}

/**
 * Окно ленты. Выборка читает на одно сообщение больше окна: лишнее
 * сообщение говорит, что ранние есть, и на экран не попадает. Отдельный
 * подсчёт ветки для этого не нужен.
 */
export function sliceWindow<T>(rows: readonly T[], window: number): ThreadSlice<T> {
  return rows.length > window
    ? { messages: rows.slice(rows.length - window), earlier: true }
    : { messages: rows, earlier: false };
}
