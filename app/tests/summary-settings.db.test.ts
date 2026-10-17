/**
 * Хранение раскладки «Сводки» на настоящей базе (план по образцу, К-5,
 * решение Р-595): раскладка своя у руководителя, раскладка по умолчанию
 * не хранится, каждое сохранение пишется в журнал, менеджеру настройка
 * закрыта.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('раскладка «Сводки» в базе', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { saveSummaryLayout, summaryLayoutOf } = await import('../src/lib/cabinet/summary-settings.ts');
  const { DEFAULT_LAYOUT } = await import('../src/lib/cabinet/summary-layout.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const head = await prisma.user.create({ data: { email: `layout-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' } });
    const other = await prisma.user.create({ data: { email: `layout-head2-${stamp}@example.org`, fullName: 'Второй руководитель', role: 'HEAD' } });
    const manager = await prisma.user.create({ data: { email: `layout-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' } });
    Object.assign(ids, { head: head.id, other: other.id, manager: manager.id });
  });

  after(async () => {
    const users = [ids.head!, ids.other!, ids.manager!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('не настроена — раскладка по умолчанию', async () => {
    assert.deepEqual(await summaryLayoutOf(actor(ids.head!, 'HEAD')), DEFAULT_LAYOUT);
  });

  it('сохранённая раскладка читается обратно и своя у каждого руководителя', async () => {
    const layout = { order: ['money', 'team', 'load', 'months', 'demand', 'deadlines', 'works', 'leads'] as const, hidden: ['pulse', 'leads'] as const };
    await saveSummaryLayout(actor(ids.head!, 'HEAD'), { order: [...layout.order], hidden: [...layout.hidden] });
    const back = await summaryLayoutOf(actor(ids.head!, 'HEAD'));
    assert.deepEqual(back.order, layout.order);
    assert.deepEqual(back.hidden, layout.hidden);
    assert.deepEqual(await summaryLayoutOf(actor(ids.other!, 'HEAD')), DEFAULT_LAYOUT);

    const event = await prisma.auditEvent.findFirst({
      where: { actorId: ids.head, action: 'SUMMARY_LAYOUT_SAVED' },
      orderBy: { occurredAt: 'desc' },
    });
    assert.ok(event);
    assert.deepEqual((event.payload as { hidden: string[] }).hidden, ['pulse', 'leads']);
  });

  it('«Вернуть как было» и раскладка по умолчанию в базе не хранятся', async () => {
    await saveSummaryLayout(actor(ids.head!, 'HEAD'), null);
    let row = await prisma.user.findUniqueOrThrow({ where: { id: ids.head }, select: { summaryLayout: true } });
    assert.equal(row.summaryLayout, null);
    await saveSummaryLayout(actor(ids.head!, 'HEAD'), DEFAULT_LAYOUT);
    row = await prisma.user.findUniqueOrThrow({ where: { id: ids.head }, select: { summaryLayout: true } });
    assert.equal(row.summaryLayout, null);
    const reset = await prisma.auditEvent.findFirst({
      where: { actorId: ids.head, action: 'SUMMARY_LAYOUT_SAVED' },
      orderBy: { occurredAt: 'desc' },
    });
    assert.deepEqual(reset?.payload, { reset: true });
  });

  it('менеджеру настройка «Сводки» закрыта', async () => {
    await assert.rejects(summaryLayoutOf(actor(ids.manager!, 'MANAGER')), AccessDenied);
    await assert.rejects(saveSummaryLayout(actor(ids.manager!, 'MANAGER'), DEFAULT_LAYOUT), AccessDenied);
  });
});
