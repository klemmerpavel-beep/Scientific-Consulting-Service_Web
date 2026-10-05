/**
 * Смена состояния работы на настоящей базе (решение Р-223): куратор
 * закрывает работу, она уходит в «Завершённые» с датой закрытия и строкой
 * в ленте; возвращается в действие; чужой менеджер и клиент — отказ.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('состояние работы', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { setProjectStatus } = await import('../src/lib/cabinet/projects.ts');
  const { listProjects } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `ps-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER', status: 'SUSPENDED' },
    });
    const type = await prisma.serviceType.create({ data: { code: `ps-${stamp}`, name: 'Проверка состояния' } });
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Клиент', normalizedName: `ps клиент ${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-PS-${String(stamp).slice(-6)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа для смены состояния',
        managerId: manager.id,
      },
    });
    Object.assign(ids, { manager: manager.id, type: type.id, client: client.id, project: project.id });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.manager } });
    await prisma.user.deleteMany({ where: { id: ids.manager } });
    await prisma.$disconnect();
  });

  const curator = () => who(ids.manager!, 'MANAGER');

  it('куратор завершает работу: дата закрытия, строка в ленте, «Завершённые»', async () => {
    const saved = await setProjectStatus(curator(), ids.project!, 'COMPLETED');
    assert.equal(saved.status, 'COMPLETED');
    assert.ok(saved.closedOn !== null, 'дата закрытия не поставлена');
    assert.equal(saved.closedOn!.getUTCHours(), 0, 'дата закрытия — не день');

    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId: ids.project!, kind: 'PROJECT_STATUS_CHANGED' },
    });
    assert.deepEqual(event.payload, { from: 'ACTIVE', to: 'COMPLETED' });

    const done = await listProjects(who(ids.manager!, 'MANAGER'), { filter: 'done' });
    assert.ok(done.rows.some((row) => row.id === ids.project), 'работа не попала в «Завершённые»');
  });

  it('из завершённой — только обратно в действие, и дата закрытия снимается', async () => {
    await assert.rejects(
      () => setProjectStatus(curator(), ids.project!, 'CANCELLED'),
      /не переводится/u,
    );
    const back = await setProjectStatus(curator(), ids.project!, 'ACTIVE');
    assert.equal(back.status, 'ACTIVE');
    assert.equal(back.closedOn, null);
  });

  it('приостановка — только с причиной; причина в истории и в письме клиенту (Т-21, М-09, Р-299)', async () => {
    await assert.rejects(() => setProjectStatus(curator(), ids.project!, 'PAUSED'), /только с причиной/u);
    await assert.rejects(() => setProjectStatus(curator(), ids.project!, 'PAUSED', '   '), /только с причиной/u);
    await setProjectStatus(curator(), ids.project!, 'PAUSED', 'Ждём решения диссовета');
    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId: ids.project!, kind: 'PROJECT_STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.deepEqual(event.payload, { from: 'ACTIVE', to: 'PAUSED', reason: 'Ждём решения диссовета' });
    const clientUser = (await prisma.clientProfile.findUniqueOrThrow({ where: { id: ids.client! } })).userId;
    if (clientUser !== null) {
      const letter = await prisma.notificationOutbox.findFirstOrThrow({
        where: { projectId: ids.project!, userId: clientUser, eventKind: 'PROJECT_STATUS_CHANGED', channel: 'EMAIL' },
        orderBy: { createdAt: 'desc' },
      });
      assert.match(letter.subject, /приостановлена/u);
      assert.match(letter.body, /Причина: Ждём решения диссовета/u);
      // Клиенту — название работы без кода (УК-06, Р-362).
      assert.match(letter.body, /^Работа «/u);
      assert.doesNotMatch(letter.body, /PD-\d/u);
    }
    await setProjectStatus(curator(), ids.project!, 'ACTIVE');
  });

  it('УМ-10: перед завершением названы незавершённые этапы (Р-378)', async () => {
    const { pendingReview } = await import('../src/lib/cabinet/queries.ts');
    const before = (await pendingReview(curator(), ids.project!)).openStages;
    const stage = await prisma.stage.create({
      data: { projectId: ids.project!, position: 90, title: 'Незавершённый этап', state: 'IN_PROGRESS' },
    });
    const done = await prisma.stage.create({
      data: { projectId: ids.project!, position: 91, title: 'Завершённый этап', state: 'DONE' },
    });
    try {
      assert.equal((await pendingReview(curator(), ids.project!)).openStages, before + 1);
    } finally {
      await prisma.stage.deleteMany({ where: { id: { in: [stage.id, done.id] } } });
    }
  });

  it('УМ-13: повторное закрытие не сдвигает первую дату закрытия (Р-392)', async () => {
    const first = new Date('2026-01-15T00:00:00Z');
    await prisma.project.update({
      where: { id: ids.project! },
      data: { status: 'COMPLETED', closedOn: first, firstClosedOn: first },
    });
    try {
      await setProjectStatus(curator(), ids.project!, 'ACTIVE');
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: ids.project! } })).firstClosedOn?.getTime(), first.getTime());
      await setProjectStatus(curator(), ids.project!, 'COMPLETED');
      const closed = await prisma.project.findUniqueOrThrow({ where: { id: ids.project! } });
      assert.equal(closed.firstClosedOn?.getTime(), first.getTime(), 'первая дата сдвинулась');
      assert.notEqual(closed.closedOn?.getTime(), first.getTime(), 'дата закрытия — сегодняшняя');
    } finally {
      await prisma.project.update({
        where: { id: ids.project! },
        data: { status: 'ACTIVE', closedOn: null, firstClosedOn: null },
      });
    }
  });

  it('неизвестное состояние не принимается', async () => {
    await assert.rejects(
      () => setProjectStatus(curator(), ids.project!, 'ARCHIVED' as never),
      /Неизвестное состояние/u,
    );
  });

  it('менеджер чужой работы и клиент состояния не меняют', async () => {
    await assert.rejects(
      () => setProjectStatus(who(`ps-other-${stamp}`, 'MANAGER'), ids.project!, 'PAUSED'),
      AccessDenied,
    );
    await assert.rejects(
      () => setProjectStatus(who(`ps-cli-${stamp}`, 'CLIENT', { clientProfileId: ids.client! }), ids.project!, 'PAUSED'),
      AccessDenied,
    );
  });
});
