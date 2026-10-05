/**
 * Плановые даты в аналитике (требование РК-23, решение Р-355): ручной
 * заказ, заведённый завершённым, закрыт плановым сроком — пометка в базе и
 * в выборке аналитики, в долю «в срок» он не входит, а число таких работ
 * названо; перевод в «Завершена» ставит фактическую дату и снимает пометку.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('плановые даты в аналитике (РК-23)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { createManualOrder } = await import('../src/lib/cabinet/manual-order.ts');
  const { setProjectStatus } = await import('../src/lib/cabinet/projects.ts');
  const { loadRows } = await import('../src/lib/cabinet/analytics/data.ts');
  const { cycles, plannedClosures } = await import('../src/lib/cabinet/analytics/metrics.ts');

  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const head = (): Actor => ({
    id: ids.head!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const order = (suffix: string, status: 'ACTIVE' | 'COMPLETED') =>
    createManualOrder(head(), {
      customer: `Плановый Заказчик ${suffix} ${stamp}`,
      serviceTypeId: ids.type!,
      title: `Работа ${suffix}`,
      orderedOn: new Date('2026-03-01T00:00:00Z'),
      dueOn: new Date('2026-06-01T00:00:00Z'),
      cost: 0n,
      paid: 0n,
      managerId: ids.manager!,
      status,
    });

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `cop-head-${stamp}@example.org`, fullName: 'Руководитель Сроков', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `cop-mgr-${stamp}@example.org`, fullName: 'Менеджер Сроков', role: 'MANAGER' } }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `cop-${stamp}`, name: `Проверка сроков ${stamp}` } });
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, type: type.id, typeCode: type.code });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: ids.head }] } });
    const clients = await prisma.project.findMany({ where: { id: { in: projects } }, select: { clientId: true } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients.map((row) => row.clientId) } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  it('ручной заказ, заведённый завершённым, закрыт плановым сроком; в долю «в срок» не входит', async () => {
    const planned = await order('book', 'COMPLETED');
    projects.push(planned.projectId);
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: planned.projectId } });
    assert.equal(saved.closedOnPlanned, true);
    assert.equal(saved.closedOn?.toISOString().slice(0, 10), '2026-06-01');

    const rows = (await loadRows(head())).filter((row) => row.typeCode === ids.typeCode);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.closedOnPlanned, true);
    const report = cycles(rows, new Date());
    assert.equal(report.withDue, 0, 'по плановым датам доля «в срок» — «мало данных»');
    assert.equal(report.planned, 1);
    assert.equal(plannedClosures(rows), 1);
  });

  it('перевод в «Завершена» ставит фактическую дату и снимает пометку', async () => {
    const live = await order('live', 'ACTIVE');
    projects.push(live.projectId);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: live.projectId } })).closedOnPlanned, false);
    await setProjectStatus(head(), live.projectId, 'COMPLETED');
    const closed = await prisma.project.findUniqueOrThrow({ where: { id: live.projectId } });
    assert.equal(closed.status, 'COMPLETED');
    assert.equal(closed.closedOnPlanned, false);

    const rows = (await loadRows(head())).filter((row) => row.typeCode === ids.typeCode);
    const report = cycles(rows, new Date());
    // Срок 01.06.2026 прошёл: фактическое закрытие — не «в срок».
    assert.equal(report.withDue, 1);
    assert.equal(report.onTime, 0);
    assert.equal(report.planned, 1);
  });
});
