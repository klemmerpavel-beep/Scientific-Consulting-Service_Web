/**
 * Деньги коротко для главной руководителя (решение Р-201).
 *
 * Карточка «Ближайшие сроки и деньги» несёт три величины, и третья
 * заведена ради второй: «к получению» складывает завтрашний транш и
 * годовалый долг, и без отделения просроченного они выглядят одинаково.
 * Проверяется именно это разделение — по дню платежа, а не по состоянию.
 *
 * Итоги считаются по всей практике, поэтому проверка меряет прирост:
 * читает величины до и после заведения траншей. Прямое равенство зависело
 * бы от того, что оставили в базе соседние наборы.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('деньги коротко', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { moneyBrief } = await import('../src/lib/cabinet/summary.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const day = 86_400_000;

  const actorOf = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  let before0: { received: bigint; awaiting: bigint; overdue: bigint };

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `mb-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `mb-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `mb-type-${stamp}`, name: 'Сопровождение' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `mb-client-${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-MB-${stamp}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа',
        managerId: boss.id,
        status: 'ACTIVE',
      },
    });
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `MB-${stamp}`, totalAmount: 100_000_00n },
    });
    Object.assign(ids, {
      boss: boss.id,
      manager: manager.id,
      type: type.id,
      client: client.id,
      project: project.id,
      contract: contract.id,
    });

    before0 = await moneyBrief(actorOf(boss.id, 'HEAD'));

    const now = Date.now();
    await prisma.tranche.createMany({
      data: [
        // Получено.
        {
          contractId: contract.id,
          title: 'Аванс',
          amount: 30_000_00n,
          status: 'PAID',
          plannedDate: new Date(now - 30 * day),
          paidOn: new Date(now - 30 * day),
        },
        // Ждёт: день платежа ещё не наступил.
        {
          contractId: contract.id,
          title: 'Второй платёж',
          amount: 20_000_00n,
          status: 'PLANNED',
          plannedDate: new Date(now + 20 * day),
        },
        // Просрочено: выставлен, день прошёл, денег нет.
        {
          contractId: contract.id,
          title: 'Третий платёж',
          amount: 50_000_00n,
          status: 'INVOICED',
          plannedDate: new Date(now - 10 * day),
        },
        // Списанное не считается ни к получению, ни просроченным.
        {
          contractId: contract.id,
          title: 'Списано',
          amount: 70_000_00n,
          status: 'WRITTEN_OFF',
          plannedDate: new Date(now - 90 * day),
        },
      ],
    });
  });

  after(async () => {
    await prisma.tranche.deleteMany({ where: { contractId: ids.contract } });
    await prisma.contract.deleteMany({ where: { id: ids.contract } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.boss!, ids.manager!] } } });
    await prisma.$disconnect();
  });

  it('получено, к получению и просроченное считаются по дню платежа', async () => {
    const now = await moneyBrief(actorOf(ids.boss!, 'HEAD'));
    assert.equal(now.received - before0.received, 30_000_00n);
    // К получению — оба неоплаченных транша: и завтрашний, и просроченный.
    assert.equal(now.awaiting - before0.awaiting, 70_000_00n);
    // Просроченное — только тот, у которого день платежа прошёл.
    assert.equal(now.overdue - before0.overdue, 50_000_00n);
  });

  it('списанный транш не считается ни к получению, ни просроченным', async () => {
    const now = await moneyBrief(actorOf(ids.boss!, 'HEAD'));
    // 70 000 ₽ списания в приросте нигде не появились: 20 000 + 50 000.
    assert.equal(now.awaiting - before0.awaiting, 70_000_00n);
    assert.ok(now.overdue - before0.overdue < 70_000_00n);
  });

  it('деньги практики целиком видит только руководитель', async () => {
    await assert.rejects(() => moneyBrief(actorOf(ids.manager!, 'MANAGER')), AccessDenied);
  });
});
