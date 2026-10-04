/**
 * Рекомендации «Цена и пакеты» и «Возврат клиентов» (требование РК-17,
 * решение Р-350; ответы владельца ОР-4, ОР-10).
 *
 * Описательные правила, а не прогноз: каждое называет, на чём основано.
 * - Цена: разброс чека вида выше 40 % при трёх и более заказах —
 *   зафиксировать цену по медиане до начала окна продвижения вида (РК-16).
 * - Возврат: клиент молчит дольше полугода — нет действующих работ, а
 *   последний заказ старше 180 дней. «Следующая работа» — самый частый
 *   переход от вида его последней работы к следующему заказу у клиентов
 *   практики; меньше пяти переходов от вида — подсказки нет.
 * Модуль чистый: проверяется без базы.
 */

import type { CalendarRow } from './calendar.ts';
import { products, type ProjectRow } from './metrics.ts';

const DAY = 86_400_000;
/** Клиент «молчит» дольше полугода. */
export const SILENCE_DAYS = 180;
/** Меньше пяти переходов от вида — «следующей работы» нет. */
export const MIN_TRANSITIONS = 5;

const iso = (date: Date) => date.toISOString().slice(0, 10);

export interface PriceAdvice {
  readonly key: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly orders: number;
  /** Разброс чека, доля: 0,45 — 45 %. */
  readonly variation: number;
  readonly medianCheck: bigint;
  readonly averageCheck: bigint;
  readonly min: bigint | null;
  readonly max: bigint | null;
  /** Зафиксировать до начала окна продвижения вида; без окна — `null`. */
  readonly before: Date | null;
}

/** Цена и пакеты: где цена «гуляет» — зафиксировать по медиане до окна вида. */
export function priceAdvice(rows: readonly ProjectRow[], calendar: readonly CalendarRow[], controlDate: Date): PriceAdvice[] {
  return products(rows)
    .filter((product) => product.needsPriceList && product.orders >= 3 && product.medianCheck !== null && product.averageCheck !== null)
    .map((product) => {
      const window = calendar.find((row) => row.typeCode === product.typeCode)?.windowStart ?? null;
      return {
        key: `price:${product.typeCode}:${window === null ? String(controlDate.getUTCFullYear()) : iso(window)}`,
        typeCode: product.typeCode,
        typeName: product.typeName,
        orders: product.orders,
        variation: product.variation ?? 0,
        medianCheck: product.medianCheck!,
        averageCheck: product.averageCheck!,
        min: product.min,
        max: product.max,
        before: window,
      };
    })
    .sort((a, b) => {
      if (a.before === null) return b.before === null ? b.variation - a.variation : 1;
      if (b.before === null) return -1;
      return a.before.getTime() - b.before.getTime();
    });
}

export interface Transition {
  readonly from: string;
  readonly to: string;
  readonly toName: string;
  readonly count: number;
  /** Всего переходов от вида `from`. */
  readonly total: number;
}

/** Переходы между видами у клиентов: заказ → следующий заказ того же клиента. */
export function transitions(rows: readonly ProjectRow[]): Map<string, Transition[]> {
  const byClient = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    if (row.startedOn === null) continue;
    const list = byClient.get(row.clientId) ?? [];
    list.push(row);
    byClient.set(row.clientId, list);
  }
  const counts = new Map<string, Map<string, { name: string; count: number }>>();
  for (const list of byClient.values()) {
    const ordered = [...list].sort((a, b) => a.startedOn!.getTime() - b.startedOn!.getTime() || a.code.localeCompare(b.code));
    for (let index = 1; index < ordered.length; index += 1) {
      const from = ordered[index - 1]!;
      const to = ordered[index]!;
      const inner = counts.get(from.typeCode) ?? new Map<string, { name: string; count: number }>();
      const cell = inner.get(to.typeCode) ?? { name: to.typeName, count: 0 };
      cell.count += 1;
      inner.set(to.typeCode, cell);
      counts.set(from.typeCode, inner);
    }
  }
  const out = new Map<string, Transition[]>();
  for (const [from, inner] of counts) {
    const total = [...inner.values()].reduce((acc, cell) => acc + cell.count, 0);
    out.set(
      from,
      [...inner.entries()]
        .map(([to, cell]) => ({ from, to, toName: cell.name, count: cell.count, total }))
        .sort((a, b) => b.count - a.count || a.toName.localeCompare(b.toName)),
    );
  }
  return out;
}

export interface ReturnAdvice {
  readonly key: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly works: number;
  readonly lastOrder: Date;
  readonly silentDays: number;
  readonly lastType: string;
  readonly lastTypeName: string;
  /** Самый частый следующий вид; меньше пяти переходов — `null`. */
  readonly next: Transition | null;
}

/** Возврат клиентов: молчат дольше полугода; давние — ниже. */
export function returnAdvice(rows: readonly ProjectRow[], controlDate: Date): ReturnAdvice[] {
  const paths = transitions(rows);
  const byClient = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    const list = byClient.get(row.clientId) ?? [];
    list.push(row);
    byClient.set(row.clientId, list);
  }
  const out: ReturnAdvice[] = [];
  for (const [clientId, list] of byClient) {
    if (list.some((row) => row.status === 'ACTIVE' || row.status === 'PAUSED')) continue;
    const dated = list.filter((row) => row.startedOn !== null).sort((a, b) => b.startedOn!.getTime() - a.startedOn!.getTime());
    const last = dated[0];
    if (last === undefined) continue;
    const silentDays = Math.floor((controlDate.getTime() - last.startedOn!.getTime()) / DAY);
    if (silentDays <= SILENCE_DAYS) continue;
    const best = paths.get(last.typeCode)?.[0] ?? null;
    out.push({
      key: `return:${clientId}:${iso(last.startedOn!)}`,
      clientId,
      clientName: last.clientName,
      works: list.length,
      lastOrder: last.startedOn!,
      silentDays,
      lastType: last.typeCode,
      lastTypeName: last.typeName,
      next: best !== null && best.total >= MIN_TRANSITIONS ? best : null,
    });
  }
  // Повторные клиенты и недавно замолчавшие — сверху: у них спрос проверен.
  return out.sort((a, b) => b.works - a.works || a.silentDays - b.silentDays || a.clientName.localeCompare(b.clientName));
}
