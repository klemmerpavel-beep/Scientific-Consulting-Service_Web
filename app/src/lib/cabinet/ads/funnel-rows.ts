/**
 * Выборка заявок для воронки раздела «Реклама» (решение Р-550). Отдельно от
 * расчёта (`funnel.ts`): тот проверяется без базы.
 */

import { prisma } from '../../db.ts';
import { ensure, type Actor } from '../access.ts';
import type { FunnelRow } from './funnel.ts';

/** Заявки с указанных страниц от начала базового периода до конца теста. Только тем, кому открыта аналитика. */
export async function funnelRows(actor: Actor, sources: readonly string[], from: Date, to: Date): Promise<FunnelRow[]> {
  ensure(actor, 'ANALYTICS_VIEW');
  return prisma.lead.findMany({
    where: { source: { in: [...sources] }, form: { not: 'review' }, createdAt: { gte: from, lt: to } },
    select: { source: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}
