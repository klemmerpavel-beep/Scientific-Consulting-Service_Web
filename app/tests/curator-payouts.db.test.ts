/**
 * «Вознаграждение кураторов» (требование РК-11, решение Р-339) — шаг H.13:
 * «к выплате» по куратору равно сумме невыплаченных начислений; выплата
 * его уменьшает; начисление с этапом подписано этапом у куратора; этап
 * начисления — только из той же работы; свод — только руководителю.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('вознаграждение кураторов (РК-11)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
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
  const head = () => who(ids.head!, 'HEAD');
  const row = async () => (await finance.payoutsByCurator(head())).find((item) => item.expertId === ids.curator);

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `cp2-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Выплат'),
      make('mgr', 'MANAGER', 'Менеджер Выплат'),
      make('cur', 'EXPERT', 'Куратор Выплат'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({ data: { fullName: `Клиент ${stamp}`, normalizedName: `cp2 клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `cp2-${stamp}`, name: 'Проверка выплат' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CQ-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки выплат',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const stage = await prisma.stage.create({ data: { projectId: project.id, position: 1, title: 'Обзор литературы', state: 'DONE' } });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.expertPayout.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.13: начисление с этапом — у куратора подписано этапом; «к выплате» — сумма невыплаченных', async () => {
    const first = await finance.addPayout(head(), { projectId: ids.project!, stageId: ids.stage!, amount: 3_000_000n });
    await finance.addPayout(head(), { projectId: ids.project!, amount: 1_000_000n });
    const own = await finance.ownPayouts(who(ids.curator!, 'EXPERT'));
    assert.equal(own.rows.find((line) => line.id === first.id)?.stage?.title, 'Обзор литературы');
    assert.deepEqual(
      { accrued: (await row())?.accrued, paid: (await row())?.paid, toPay: (await row())?.toPay, works: (await row())?.works },
      { accrued: 4_000_000n, paid: 0n, toPay: 4_000_000n, works: 1 },
    );
    await finance.markPayoutPaid(head(), first.id, moscowToday());
    assert.equal((await row())?.toPay, 1_000_000n);
    const lines = await finance.curatorPayoutLines(head(), ids.curator!);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((line) => !line.handedOff), 'работа куратора помечена переданной');
    // Работа ушла другому куратору — у руководителя пометка, как у куратора (УЭ-06, Р-383).
    await prisma.project.update({ where: { id: ids.project! }, data: { expertId: null } });
    try {
      assert.ok((await finance.curatorPayoutLines(head(), ids.curator!)).every((line) => line.handedOff));
    } finally {
      await prisma.project.update({ where: { id: ids.project! }, data: { expertId: ids.curator! } });
    }
  });

  it('этап начисления — только из этой работы; свод — только руководителю', async () => {
    const foreign = await prisma.stage.findFirst({ where: { projectId: { not: ids.project } }, select: { id: true } });
    if (foreign !== null) {
      await assert.rejects(finance.addPayout(head(), { projectId: ids.project!, stageId: foreign.id, amount: 100n }), /не из этой работы/u);
    }
    await assert.rejects(finance.payoutsByCurator(who(ids.manager!, 'MANAGER')), /не разрешено/u);
  });
});
