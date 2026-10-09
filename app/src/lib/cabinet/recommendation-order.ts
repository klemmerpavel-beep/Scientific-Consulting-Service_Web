/**
 * Порядок карточек в лентах рекомендаций (решение Р-499).
 *
 * Сначала — ждущие решения, за ними — принятые, в конце — закрытые
 * отметкой («отклонено», «сделано», «отложено»). Принятая рекомендация
 * ждёт следующего шага — поручения и «Сделано» (Р-491), — и прятать её в
 * хвост вместе с закрытыми нельзя: в «Возврате клиентов» с пределом в
 * десять карточек она уходила за предел, и по ней не было ни «Поручить»,
 * ни «Сделано», пока не отмечены остальные.
 *
 * Модуль чистый: без базы и без React, проверяется напрямую.
 */

type MarkLike = { readonly status: string } | undefined;

/** 0 — ждёт решения, 1 — принято, 2 — закрыто отметкой. */
export function markStage(mark: MarkLike): 0 | 1 | 2 {
  if (mark === undefined) return 0;
  return mark.status === 'ACCEPTED' ? 1 : 2;
}

/** Лента без предела: ждущие, принятые, закрытые; внутри — прежний порядок. */
export function laneOrder<T>(rows: readonly T[], markOf: (row: T) => MarkLike): T[] {
  return rows
    .map((row, index) => ({ row, index, stage: markStage(markOf(row)) }))
    .sort((a, b) => a.stage - b.stage || a.index - b.index)
    .map((item) => item.row);
}

/**
 * Лента с пределом: ждущие решения — до предела, принятые — все,
 * закрытые — на оставшееся место. `hiddenOpen` — сколько ждущих решения
 * не поместилось: только они и встанут в ленту по мере отметок.
 */
export function limitedLane<T>(
  rows: readonly T[],
  markOf: (row: T) => MarkLike,
  limit: number,
): { shown: T[]; hiddenOpen: number } {
  const ordered = laneOrder(rows, markOf);
  const open = ordered.filter((row) => markStage(markOf(row)) === 0);
  const accepted = ordered.filter((row) => markStage(markOf(row)) === 1);
  const closed = ordered.filter((row) => markStage(markOf(row)) === 2);
  const openShown = open.slice(0, limit);
  const room = Math.max(0, limit - openShown.length - accepted.length);
  return {
    shown: [...openShown, ...accepted, ...closed.slice(0, room)],
    hiddenOpen: open.length - openShown.length,
  };
}
