/**
 * Вознаграждение без тупиков (требование Э-13, решение Р-332): после
 * передачи работы другому куратору строка начисления остаётся, но
 * помечена «работа передана» и ссылкой не служит; чей теперь куратор — не
 * отдаётся; начисление с этапом подписано этапом; на карточке — своё
 * начисленное и выплаченное по этой работе.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('вознаграждение без тупиков (Э-13)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const curator = () => who(ids.curator!, 'EXPERT');
  const head = () => who(ids.head!, 'HEAD');
  const myRow = async () => (await finance.ownPayouts(curator())).rows.find((row) => row.id === ids.payout);

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `pl-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [headUser, managerUser, curatorUser, nextUser] = await Promise.all([
      make('head', 'HEAD'),
      make('mgr', 'MANAGER'),
      make('cur', 'EXPERT'),
      make('next', 'EXPERT'),
    ]);
    await prisma.expertProfile.createMany({
      data: [
        { userId: curatorUser.id, ndaSignedAt: NDA },
        { userId: nextUser.id, ndaSignedAt: NDA },
      ],
    });
    const profile = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `pl клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `pl-${stamp}`, name: 'Проверка вознаграждения' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-PL-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки вознаграждения',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Обзор источников', state: 'DONE' },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      next: nextUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!, ids.next!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: ids.project }, { userId: { in: users } }] } });
    await prisma.expertPayout.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('начисление по своей работе — со ссылкой и этапом', async () => {
    const payout = await finance.addPayout(head(), { projectId: ids.project!, stageId: ids.stage!, amount: 1_500_000n });
    ids.payout = payout.id;
    const row = await myRow();
    assert.equal(row?.handedOff, false);
    assert.equal(row?.stage?.title, 'Обзор источников');
    assert.deepEqual(Object.keys(row!.project!).sort(), ['code', 'title'], 'куратору отдан лишний реквизит работы');
  });

  it('на карточке — начислено и выплачено по этой работе', async () => {
    assert.deepEqual(await finance.ownPayoutTotals(curator(), ids.project!), { accrued: 1_500_000n, paid: 0n });
    await finance.markPayoutPaid(head(), ids.payout!, moscowToday());
    await finance.addPayout(head(), { projectId: ids.project!, amount: 500_000n });
    assert.deepEqual(await finance.ownPayoutTotals(curator(), ids.project!), { accrued: 2_000_000n, paid: 1_500_000n });
    assert.equal(await finance.ownPayoutTotals(who(ids.manager!, 'MANAGER'), ids.project!), null);
    assert.equal(await finance.ownPayoutTotals(who(ids.next!, 'EXPERT'), ids.project!), null);
  });

  it('после передачи работы — пометка вместо ссылки, без сведений о новом кураторе', async () => {
    await projects.assignExpert(head(), ids.project!, ids.next!);
    const row = await myRow();
    assert.equal(row?.handedOff, true);
    assert.equal(row?.project?.title, 'Работа для проверки вознаграждения');
    assert.ok(!JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(ids.next!));
    // Начисления нового куратора по этой работе прежнему не видны.
    const mine = await finance.ownPayouts(curator());
    assert.equal(mine.rows.filter((r) => r.project?.title === 'Работа для проверки вознаграждения').length, 2);
  });
});
