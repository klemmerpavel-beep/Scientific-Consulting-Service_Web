/**
 * Тексты рекомендации «Цена и пакеты» — ориентир, а не цена (решение
 * владельца П-9 от 01.11.2026, решение Р-765; дополняет Р-350).
 *
 * Условие и расчёт Р-350 прежние: разброс чека вида выше 40 % при трёх и
 * более заказах; ключи и отметки по сезону — Р-656. Меняется смысл.
 * Стоимость не унифицируется: темы и сложность работ одного вида
 * различаются, сумму всей работы определяет Задание по оценке темы и
 * сложности и выносит клиенту на рассмотрение (П-8). Поэтому разброс —
 * повод проверить, объясняется ли он темой и сложностью, а медиана и
 * диапазон — внутренний ориентир для Задания, а не цена вида работ.
 *
 * Одна формулировка на четыре места: карточка в «Рекомендациях»,
 * «Рекомендация месяца» на «Сводке», письмо `HEAD_MONTHLY` (без сумм, как
 * прежде) и «Что делать» отчёта за период. Клиенту ни рекомендация, ни
 * медиана, ни диапазон не показываются (Р-03).
 *
 * Модуль чистый: проверяется без базы (`tests/advice.test.ts`).
 */

import { formatAmount } from '../money.ts';

/** Чем служат медиана и диапазон вида (П-9). */
export const PRICE_GUIDE = 'ориентир для Задания, а не цена';

/** Без сумм — для «Рекомендации месяца» и письма `HEAD_MONTHLY` (Р-350). */
export const PRICE_GUIDE_NO_SUMS = `Медиана и диапазон — ${PRICE_GUIDE}`;

/** Что сделать с разбросом: проверить, а не выровнять (П-9). */
export const PRICE_CHECK = 'проверьте, объясняется ли он темой и сложностью работ';

/** Разброс чека в процентах: доля 0,45 — 45. */
export function spreadPercent(variation: number): number {
  return Math.round(variation * 100);
}

/** «по 4 заказам», «по 21 заказу» — дательный падеж после «по». */
export function byOrders(count: number): string {
  const one = count % 10 === 1 && count % 100 !== 11;
  return `по ${count} ${one ? 'заказу' : 'заказам'}`;
}

export interface PriceSpread {
  readonly typeName: string;
  /** Разброс чека, доля: 0,45 — 45 %. */
  readonly variation: number;
  readonly orders: number;
}

export interface PriceSpot {
  readonly medianCheck: bigint;
  readonly min: bigint | null;
  readonly max: bigint | null;
}

/** «Разброс чека «{вид}» — {N} % по {M} заказам: проверьте, объясняется ли он темой и сложностью работ». */
export function priceSpread(item: PriceSpread): string {
  return `Разброс чека «${item.typeName}» — ${spreadPercent(item.variation)} % ${byOrders(item.orders)}: ${PRICE_CHECK}`;
}

/**
 * «Медиана {сумма}, диапазон {от} — {до} — ориентир для Задания, а не
 * цена». Без диапазона — одна медиана. `money` — запись суммы экрана:
 * карточка пишет копейки (`formatAmount`), выводы отчёта — целые рубли.
 */
export function priceGuide(item: PriceSpot, money: (amount: bigint) => string = formatAmount): string {
  const range = item.min === null || item.max === null ? '' : `, диапазон ${money(item.min)} — ${money(item.max)}`;
  return `Медиана ${money(item.medianCheck)}${range} — ${PRICE_GUIDE}`;
}

/**
 * Числа вида для «Что делать» отчёта, где видов может быть несколько:
 * «Разброс чека «{вид}» — {N} % по {M} заказам, медиана {сумма}, диапазон
 * {от} — {до}». Что проверить и чем служат медиана и диапазон, вывод
 * говорит один раз на все виды.
 */
export function priceFacts(item: PriceSpread & PriceSpot, money: (amount: bigint) => string = formatAmount): string {
  const range = item.min === null || item.max === null ? '' : `, диапазон ${money(item.min)} — ${money(item.max)}`;
  return `Разброс чека «${item.typeName}» — ${spreadPercent(item.variation)} % ${byOrders(item.orders)}, медиана ${money(item.medianCheck)}${range}`;
}

/**
 * «Рекомендация месяца» по цене — та же формулировка без сумм: строка на
 * «Сводке» и в письме `HEAD_MONTHLY`, вторая фраза — пометкой (Р-350).
 */
export function priceMonth(item: PriceSpread): { readonly title: string; readonly note: string } {
  return { title: priceSpread(item), note: PRICE_GUIDE_NO_SUMS };
}
