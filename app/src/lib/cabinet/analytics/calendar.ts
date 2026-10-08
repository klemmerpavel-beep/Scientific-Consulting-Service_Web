/**
 * Календарь продвижения (требование РК-16, решение Р-349; решения
 * владельца В-17, ОР-5, ОР-6; ДР-4…ДР-6).
 *
 * Когда продвигать каждый вид работ, считается от сроков сдачи, а не от
 * пика заказов: клиент заказывает сопровождение за медиану выполнения до
 * своего срока. По виду работ:
 * - месяц сдачи — месяц с наибольшим числом сроков среди наблюдавшихся
 *   месяцев окна нормы; при равенстве — все такие (ДР-6). Сроки будущих
 *   месяцев не входят: месяц ещё не наблюдался;
 * - медиана выполнения — простая медиана плановых длительностей «срок
 *   минус дата заказа» (ОР-5); половина дня округляется к чётному;
 * - расчётная дата заказа — 15-е число ближайшего месяца сдачи минус
 *   медиана; ближайшего — с датой заказа не раньше сегодняшнего дня;
 * - окно — шесть недель до даты заказа, последние четыре главные;
 * - пик заказов — справочно: норма месяца и значения по годам;
 * - вес — норма заказов вида в окне по долям дней месяцев (ДР-4) ×
 *   средний чек вида;
 * - уверенность — по числу наблюдений; при числе сезонов месяца сдачи
 *   меньше трёх — не выше «вероятно» (ДР-5). При «мало данных» окно не
 *   считается.
 * Наблюдения — работы вида с датой заказа не раньше начала учёта и со
 * сроком. Модуль чистый: проверяется без базы.
 */

import { moscowToday } from '../clock.ts';
import { normWindow, seasonalNorm, type ProjectRow } from './metrics.ts';

const DAY = 86_400_000;

export type Confidence = 'SURE' | 'LIKELY' | 'MAYBE' | 'FEW';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  SURE: 'уверенно',
  LIKELY: 'вероятно',
  MAYBE: 'предположительно',
  FEW: 'мало данных',
};

export const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

/** Где сегодняшний день относительно окна. */
export type WindowState = 'main' | 'open' | 'soon' | 'later';

export interface CalendarRow {
  readonly typeCode: string;
  readonly typeName: string;
  readonly observations: number;
  /** Месяцы сдачи, 1–12. */
  readonly deliveryMonths: readonly number[];
  /** Сроков в месяце сдачи и сезонов, в которых он наблюдался. */
  readonly deliveryCount: number;
  readonly deliverySeasons: number;
  readonly medianDays: number | null;
  readonly orderOn: Date | null;
  readonly windowStart: Date | null;
  readonly mainStart: Date | null;
  readonly peak: { readonly month: number; readonly norm: number; readonly years: readonly { year: number; orders: number }[] } | null;
  readonly normInWindow: number | null;
  readonly averageCheck: bigint | null;
  readonly weight: bigint | null;
  readonly confidence: Confidence;
  readonly state: WindowState | null;
  /** Заказы вида по месяцам и годам — «На чём основано». */
  readonly orders: readonly { readonly month: number; readonly norm: number; readonly years: readonly { year: number; orders: number }[] }[];
}

export interface CalendarOptions {
  readonly since: Date;
  readonly thresholds: { readonly sure: number; readonly likely: number; readonly maybe: number };
}

/** Медиана; половина — как есть, округление делает вызывающий. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Округление к ближайшему, половина — к чётному: 34,5 → 34, 13,5 → 14. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Норма заказов в окне: сумма месячных норм по долям дней (ДР-4). */
function normBetween(start: Date, end: Date, norms: readonly number[]): number {
  let total = 0;
  for (let day = start.getTime(); day <= end.getTime(); day += DAY) {
    const date = new Date(day);
    const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    total += norms[date.getUTCMonth()]! / daysInMonth;
  }
  return total;
}

function confidenceOf(observations: number, seasons: number, thresholds: CalendarOptions['thresholds']): Confidence {
  const byCount: Confidence =
    observations >= thresholds.sure
      ? 'SURE'
      : observations >= thresholds.likely
        ? 'LIKELY'
        : observations >= thresholds.maybe
          ? 'MAYBE'
          : 'FEW';
  return byCount === 'SURE' && seasons < 3 ? 'LIKELY' : byCount;
}

/** Календарь продвижения по видам работ; крупные по весу сверху. */
export function promoCalendar(rows: readonly ProjectRow[], controlDate: Date, options: CalendarOptions): CalendarRow[] {
  const today = moscowToday(controlDate);
  const window = normWindow(rows, controlDate, options.since);
  const types = [...new Map(rows.map((row) => [row.typeCode, row.typeName])).entries()];

  const out = types.map(([typeCode, typeName]): CalendarRow => {
    const own = rows.filter(
      (row) => row.typeCode === typeCode && row.startedOn !== null && row.startedOn.getTime() >= options.since.getTime(),
    );
    const observed = own.filter((row) => row.dueOn !== null);
    const season = seasonalNorm(
      rows.filter((row) => row.typeCode === typeCode),
      controlDate,
      options.since,
    );

    // Месяц сдачи — среди наблюдавшихся месяцев окна нормы.
    const counts = new Map<number, number>();
    for (const row of observed) {
      const key = row.dueOn!.getUTCFullYear() * 12 + row.dueOn!.getUTCMonth();
      if (window !== null && key >= window.startKey && key <= window.endKey) {
        const month = row.dueOn!.getUTCMonth() + 1;
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
    }
    const top = Math.max(0, ...counts.values());
    const deliveryMonths = top === 0 ? [] : [...counts.entries()].filter(([, count]) => count === top).map(([month]) => month).sort((a, b) => a - b);
    const deliverySeasons =
      deliveryMonths.length === 0 || window === null
        ? 0
        : Math.min(
            ...deliveryMonths.map((month) => {
              let seasons = 0;
              for (let key = window.startKey; key <= window.endKey; key += 1) if (key % 12 === month - 1) seasons += 1;
              return seasons;
            }),
          );

    const durations = observed.map((row) => (row.dueOn!.getTime() - row.startedOn!.getTime()) / DAY).filter((days) => days >= 0);
    const medianDays = median(durations);
    const confidence = confidenceOf(observed.length, deliverySeasons, options.thresholds);
    const costs = own.filter((row) => row.cost > 0n).map((row) => row.cost);
    const averageCheck = costs.length === 0 ? null : costs.reduce((acc, cost) => acc + cost, 0n) / BigInt(costs.length);
    const peakMonth = season.reduce<(typeof season)[number] | null>(
      (best, month) => (month.norm > 0 && (best === null || month.norm > best.norm) ? month : best),
      null,
    );

    let orderOn: Date | null = null;
    if (confidence !== 'FEW' && medianDays !== null && deliveryMonths.length > 0) {
      const shift = roundHalfEven(medianDays) * DAY;
      const candidates: Date[] = [];
      for (const month of deliveryMonths) {
        for (let year = today.getUTCFullYear(); year <= today.getUTCFullYear() + 3; year += 1) {
          const order = new Date(Date.UTC(year, month - 1, 15) - shift);
          if (order.getTime() >= today.getTime()) {
            candidates.push(order);
            break;
          }
        }
      }
      orderOn = candidates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    }
    const windowStart = orderOn === null ? null : new Date(orderOn.getTime() - 42 * DAY);
    const mainStart = orderOn === null ? null : new Date(orderOn.getTime() - 28 * DAY);
    const norms = season.map((month) => month.norm);
    const normInWindow = windowStart === null || orderOn === null ? null : normBetween(windowStart, orderOn, norms);
    const weight =
      normInWindow === null || averageCheck === null ? null : BigInt(Math.round(normInWindow * Number(averageCheck)));
    const state: WindowState | null =
      orderOn === null || windowStart === null || mainStart === null
        ? null
        : today.getTime() >= mainStart.getTime()
          ? 'main'
          : today.getTime() >= windowStart.getTime()
            ? 'open'
            : windowStart.getTime() - today.getTime() <= 14 * DAY
              ? 'soon'
              : 'later';

    return {
      typeCode,
      typeName,
      observations: observed.length,
      deliveryMonths,
      deliveryCount: top,
      deliverySeasons,
      medianDays,
      orderOn,
      windowStart,
      mainStart,
      peak: peakMonth === null ? null : { month: peakMonth.month, norm: peakMonth.norm, years: peakMonth.years },
      normInWindow,
      averageCheck,
      weight,
      confidence,
      state,
      orders: season.map((month) => ({ month: month.month, norm: month.norm, years: month.years })),
    };
  });

  return out.sort((a, b) => {
    if (a.weight === null) return b.weight === null ? a.typeName.localeCompare(b.typeName) : 1;
    if (b.weight === null) return -1;
    return Number(b.weight - a.weight) || a.typeName.localeCompare(b.typeName);
  });
}

/** Ключ отметки окна: вид и дата заказа — у следующего сезона своя отметка. */
export function calendarKey(row: Pick<CalendarRow, 'typeCode' | 'orderOn'>): string | null {
  return row.orderOn === null ? null : `calendar:${row.typeCode}:${row.orderOn.toISOString().slice(0, 10)}`;
}

/**
 * «Сейчас: …» — одно–три действия: главное окно открыто — запускать,
 * окно открыто или откроется в две недели — готовить. Отмеченное
 * (принятое, отклонённое, сделанное, отложенное) не повторяется.
 */
export function calendarNow(rows: readonly CalendarRow[], marked: ReadonlySet<string>): CalendarRow[] {
  const rank: Record<WindowState, number> = { main: 0, open: 1, soon: 2, later: 3 };
  return rows
    .filter((row) => row.state !== null && row.state !== 'later')
    .filter((row) => {
      const key = calendarKey(row);
      return key === null || !marked.has(key);
    })
    .sort((a, b) => rank[a.state!] - rank[b.state!] || Number((b.weight ?? 0n) - (a.weight ?? 0n)))
    .slice(0, 3);
}

/**
 * Ближайший пик сдачи — для загрузки кураторов на «Команде» (требование
 * РК-22, решение Р-354; ДР-3): ближайший, начиная с текущего, из месяцев
 * сдачи видов с уверенностью не ниже «предположительно». Нет таких видов —
 * `null`.
 */
export function nearestPeak(rows: readonly CalendarRow[], controlDate: Date): { key: string; year: number; month: number } | null {
  const today = moscowToday(controlDate);
  const current = today.getUTCFullYear() * 12 + today.getUTCMonth();
  let best: number | null = null;
  for (const row of rows) {
    if (row.confidence === 'FEW') continue;
    for (const month of row.deliveryMonths) {
      let key = today.getUTCFullYear() * 12 + (month - 1);
      if (key < current) key += 12;
      if (best === null || key < best) best = key;
    }
  }
  if (best === null) return null;
  const year = Math.floor(best / 12);
  const month = (best % 12) + 1;
  return { key: `${year}-${String(month).padStart(2, '0')}`, year, month };
}
