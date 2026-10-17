/**
 * «Пульс практики» на «Сводке» руководителя (план владельца по образцу,
 * пункт К-1, решение Р-585): период — 7 дней, 28 дней, текущий месяц или
 * 90 дней; четыре показателя — получено, новые заявки, принято в работу,
 * закрыто — с изменением к предыдущему такому же периоду и рядом по дням
 * или неделям для мини-графика.
 *
 * Расчёт без базы: на входе строки работ (`loadRows`) и заявки
 * (`leadRows`). Дни — московские, как у «Получено за 90 дней» (Р-448):
 * даты работ и поступлений хранятся полуночью московского дня, время
 * заявки приводится к её московскому дню.
 */

import { moscowToday } from '../clock.ts';
import type { LeadRow } from './leads.ts';
import { periodBounds, type ProjectRow } from './metrics.ts';

const DAY = 86_400_000;

export type PulsePeriod = '7' | '28' | 'month' | '90';

export const PULSE_PERIODS: readonly { readonly key: PulsePeriod; readonly label: string }[] = [
  { key: '7', label: '7 дней' },
  { key: '28', label: '28 дней' },
  { key: 'month', label: 'Текущий месяц' },
  { key: '90', label: '90 дней' },
];

/** По умолчанию — 90 дней: окно прежних плиток «Сводки» (Р-342, Р-472). */
export const PULSE_DEFAULT: PulsePeriod = '90';

export function pulsePeriod(value: string | undefined): PulsePeriod {
  return PULSE_PERIODS.some((item) => item.key === value) ? (value as PulsePeriod) : PULSE_DEFAULT;
}

/** Отрезок московских дней, оба конца включительно. */
export interface Span {
  readonly from: Date;
  readonly to: Date;
}

export interface PulseWindow {
  readonly current: Span;
  readonly previous: Span;
  /** Отрезки мини-графика внутри текущего периода, по порядку. */
  readonly buckets: readonly Span[];
  /** «за 7 дней», «с 1 октября». */
  readonly caption: string;
  /** С чем сравнивается: «к прежним 7 дням», «к 1–14 сентября». */
  readonly against: string;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const shift = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

/** Дни подряд — отрезками по одному дню. */
function daily(span: Span): Span[] {
  const out: Span[] = [];
  for (let at = span.from.getTime(); at <= span.to.getTime(); at += DAY) out.push({ from: new Date(at), to: new Date(at) });
  return out;
}

/**
 * Окно периода на сегодняшний московский день.
 *
 * Текущий месяц сравнивается с теми же днями прошлого: с 1-го по
 * сегодняшнее число. В коротком месяце хвост обрезается его последним
 * днём — 31 марта сравнивается с 1–28 февраля, а не с 3 марта.
 */
export function pulseWindow(period: PulsePeriod, today: Date): PulseWindow {
  if (period === 'month') {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const day = today.getUTCDate();
    const current = { from: new Date(Date.UTC(year, month, 1)), to: today };
    const prevLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const previous = {
      from: new Date(Date.UTC(year, month - 1, 1)),
      to: new Date(Date.UTC(year, month - 1, Math.min(day, prevLast))),
    };
    const prevMonth = MONTHS_GEN[previous.from.getUTCMonth()]!;
    const prevDays = previous.to.getUTCDate();
    return {
      current,
      previous,
      buckets: daily(current),
      caption: `с 1 ${MONTHS_GEN[month]}`,
      against: prevDays === 1 ? `к 1 ${prevMonth}` : `к 1–${prevDays} ${prevMonth}`,
    };
  }
  const days = Number(period);
  const current = periodBounds(today, days);
  const previous = { from: shift(current.from, -days), to: shift(current.from, -1) };
  // 90 дней — неделями с конца: последняя неделя кончается сегодня, первая
  // берёт то, что осталось от периода (90 = 12 недель и 6 дней).
  let buckets: Span[];
  if (days <= 28) {
    buckets = daily(current);
  } else {
    buckets = [];
    for (let to = today; to.getTime() >= current.from.getTime(); to = shift(to, -7)) {
      const from = shift(to, -6);
      buckets.unshift({ from: from.getTime() < current.from.getTime() ? current.from : from, to });
    }
  }
  return { current, previous, buckets, caption: `за ${days} дней`, against: `к прежним ${days} дням` };
}

export interface PulseMetric {
  readonly key: 'received' | 'leads' | 'started' | 'closed';
  readonly label: string;
  readonly now: bigint;
  readonly before: bigint;
  /** Ряд мини-графика: по отрезку окна; деньги — в рублях. */
  readonly series: readonly number[];
  /** Пояснение под числом, кроме сравнения. */
  readonly detail: string | null;
}

/** Московский день даты — полночь UTC этого дня, в миллисекундах. */
const dayOf = (on: Date) => moscowToday(on).getTime();

/**
 * Четыре показателя «Пульса» за окно. Деньги — в копейках, как хранятся.
 *
 * Каждая дата один раз приводится к московскому дню, и итог периода, и ряд
 * считаются одним правилом: сумма ряда всегда равна числу в плитке. Прежде
 * итог брал «не позже полуночи сегодня», а дневные отрезки — «не позже
 * полуночи своего дня», и дата со временем внутри дня попадала в итог, но
 * ни в один отрезок: «получено 130 000 ₽» при пустом графике.
 */
export function pulseMetrics(rows: readonly ProjectRow[], leads: readonly LeadRow[], window: PulseWindow): PulseMetric[] {
  const payments = rows.flatMap((row) =>
    row.payments.filter((payment) => payment.on !== null).map((payment) => ({ day: dayOf(payment.on!), amount: payment.amount })),
  );
  const leadDays = leads.map((lead) => dayOf(lead.createdAt));
  const startDays = rows.filter((row) => row.startedOn !== null).map((row) => dayOf(row.startedOn!));
  // Закрыто — по первой дате закрытия, как «Закрыто за 90 дней» (Р-392).
  const closings = rows
    .filter((row) => row.closedOn !== null && row.firstClosedOn !== null)
    .map((row) => ({ day: dayOf(row.firstClosedOn!), status: row.status }));

  const within = (day: number, span: Span) => day >= span.from.getTime() && day <= span.to.getTime();
  const receivedIn = (span: Span) =>
    payments.reduce((acc, payment) => (within(payment.day, span) ? acc + payment.amount : acc), 0n);
  const count = (days: readonly number[], span: Span) => days.filter((day) => within(day, span)).length;
  const closedIn = (span: Span) => closings.filter((item) => within(item.day, span));

  const closedNow = closedIn(window.current);
  const completed = closedNow.filter((item) => item.status === 'COMPLETED').length;
  const cancelled = closedNow.filter((item) => item.status === 'CANCELLED').length;
  return [
    {
      key: 'received',
      label: 'Получено',
      now: receivedIn(window.current),
      before: receivedIn(window.previous),
      series: window.buckets.map((span) => Number(receivedIn(span)) / 100),
      detail: null,
    },
    {
      key: 'leads',
      label: 'Новые заявки',
      now: BigInt(count(leadDays, window.current)),
      before: BigInt(count(leadDays, window.previous)),
      series: window.buckets.map((span) => count(leadDays, span)),
      detail: null,
    },
    {
      key: 'started',
      label: 'Принято в работу',
      now: BigInt(count(startDays, window.current)),
      before: BigInt(count(startDays, window.previous)),
      series: window.buckets.map((span) => count(startDays, span)),
      detail: null,
    },
    {
      key: 'closed',
      label: 'Закрыто',
      now: BigInt(closedNow.length),
      before: BigInt(closedIn(window.previous).length),
      series: window.buckets.map((span) => closedIn(span).length),
      detail: closedNow.length === 0 ? null : `завершено ${completed} · отменено ${cancelled}`,
    },
  ];
}

/**
 * Изменение к прошлому периоду словами: «+3 (+42 %) к прежним 7 дням».
 * Деньги — через переданный формат. Ноль в прошлом периоде процента не
 * даёт: деление на ноль — не рост.
 */
export function pulseChange(now: bigint, before: bigint, against: string, format: (value: bigint) => string): string {
  if (before === 0n) return now === 0n ? `${against}: тоже 0` : `${against}: было 0`;
  const change = now - before;
  if (change === 0n) return `столько же, ${against}`;
  const percent = Math.round((Number(change) / Number(before)) * 100);
  const sign = change > 0n ? '+' : '−';
  const abs = change > 0n ? change : -change;
  // Изменение меньше половины процента округлялось в «+0 %» рядом с
  // ненулевой суммой: «+1 000 ₽ (+0 %)» читалось противоречием.
  const share = percent === 0 ? 'менее 1 %' : `${sign}${Math.abs(percent)} %`;
  return `${sign}${format(abs)} (${share}) ${against}`;
}
