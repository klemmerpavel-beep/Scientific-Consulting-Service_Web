/**
 * Сводка практики для главного экрана руководителя.
 *
 * Три величины, которые руководитель хочет видеть, открыв кабинет:
 * сколько заказов, сколько денег получено, сколько из этого прибыль.
 * Ничего нового здесь не считается — берутся уже проверенные выборки
 * финансового контура; новое только сведение и ставка издержек.
 */

import { ensure, type Actor } from './access.ts';
import { financeSummary } from './finance.ts';
import { prisma } from '../db.ts';
import { scopeProjects } from './access.ts';

/**
 * Доля издержек, вычитаемая из поступлений при расчёте прибыли.
 *
 * Практику до сих пор вёл сам руководитель: исполнителем по работам
 * выступал он, и вознаграждение сторонним экспертам при переносе книги
 * заказов не восстанавливалось. Поэтому честная себестоимость сводится к
 * накладным расходам — их доля принята заказчиком равной десяти процентам.
 *
 * Это допущение, а не расчёт, и подпись плитки говорит об этом прямо.
 * Как только начисления экспертам появятся в системе, они вычитаются
 * дополнительно и прибыль станет считаться по факту.
 */
export const OVERHEAD_PERCENT = 10n;

export interface PracticeSummary {
  /** Сколько работ всего и сколько из них в работе. */
  readonly orders: number;
  readonly active: number;
  /** Законтрактовано по договорам. */
  readonly contracted: bigint;
  /** Поступило — это и есть выручка. */
  readonly received: bigint;
  /** Ожидается по выставленным и запланированным траншам. */
  readonly outstanding: bigint;
  /** Начислено экспертам; пока начислений нет — ноль. */
  readonly payouts: bigint;
  /** Поступления за вычетом начислений и накладных расходов. */
  readonly profit: bigint;
}

export async function practiceSummary(actor: Actor): Promise<PracticeSummary> {
  ensure(actor, 'MARGIN_VIEW');

  const scope = scopeProjects(actor);
  const [orders, active, finance] = await Promise.all([
    prisma.project.count({ where: scope ?? undefined }),
    prisma.project.count({ where: { ...(scope ?? {}), status: 'ACTIVE' } }),
    financeSummary(actor),
  ]);

  const received = finance.totals.received;
  const payouts = finance.rows.reduce((acc, row) => acc + row.accrued, 0n);
  // Деление целых: копейка округления в меньшую сторону безразлична, а
  // плавающая точка к деньгам не применяется.
  const overhead = (received * OVERHEAD_PERCENT) / 100n;

  return {
    orders,
    active,
    contracted: finance.totals.contracted,
    received,
    outstanding: finance.totals.awaiting,
    payouts,
    profit: received - payouts - overhead,
  };
}
