/**
 * Заявки с рекламных посадочных за период теста (решение Р-550).
 *
 * Метка кампании с заявкой не хранится (Р-496), поэтому заявки
 * направления — это заявки с его страницы сайта за период теста, а
 * сравнение идёт с базовым уровнем той же страницы до запуска. Состояния —
 * те, что ставит менеджер по регламенту обработки заявок: целевой заявка
 * считается с «Консультация проведена». Модуль чистый: выборка из базы —
 * в `funnel-rows.ts`, чтобы расчёт проверялся без базы.
 */

import type { LeadStatus } from '../../../generated/prisma/client.js';

export interface FunnelRow {
  readonly source: string;
  readonly status: LeadStatus | string;
  readonly createdAt: Date;
}

export interface Funnel {
  /** Обращения без спама. */
  readonly total: number;
  /** В разборе: новые, в работе, ждут ответа. */
  readonly open: number;
  /** Консультация проведена или договор заключён. */
  readonly targeted: number;
  readonly contracted: number;
  readonly declined: number;
  readonly spam: number;
}

const OPEN = new Set(['NEW', 'IN_PROGRESS', 'AWAITING_REPLY']);

/** Воронка по строкам одной страницы. */
export function funnelOf(rows: readonly Pick<FunnelRow, 'status'>[]): Funnel {
  let open = 0;
  let targeted = 0;
  let contracted = 0;
  let declined = 0;
  let spam = 0;
  for (const row of rows) {
    if (row.status === 'SPAM') spam += 1;
    else if (OPEN.has(row.status)) open += 1;
    else if (row.status === 'CONSULTED') targeted += 1;
    else if (row.status === 'CONTRACTED') {
      targeted += 1;
      contracted += 1;
    } else if (row.status === 'DECLINED') declined += 1;
  }
  return { total: rows.length - spam, open, targeted, contracted, declined, spam };
}

export interface SourceFunnel {
  readonly source: string;
  readonly test: Funnel;
  /** Обращений без спама в неделю до запуска; `null` — периода нет. */
  readonly baselineWeekly: number | null;
}

/** Воронка по страницам: период теста и базовый уровень до него. */
export function sourceFunnels(
  rows: readonly FunnelRow[],
  sources: readonly string[],
  window: { from: Date; to: Date; baselineFrom: Date },
): SourceFunnel[] {
  const weeks = (window.from.getTime() - window.baselineFrom.getTime()) / (7 * 86_400_000);
  return sources.map((source) => {
    const own = rows.filter((row) => row.source === source);
    const inTest = own.filter((row) => row.createdAt >= window.from && row.createdAt < window.to);
    const before = own.filter(
      (row) => row.createdAt >= window.baselineFrom && row.createdAt < window.from && row.status !== 'SPAM',
    );
    return {
      source,
      test: funnelOf(inTest),
      baselineWeekly: weeks > 0 ? before.length / weeks : null,
    };
  });
}
