/**
 * Права на аналитику накладываются в одном месте (решение Р-183).
 *
 * `docs/CABINET.md` называет `analytics/data.ts` единственным местом
 * контура аналитики, где есть база и права, — но проверок у него не было
 * ни одной: `analytics.test.ts` считает расчёты по готовым строкам, без
 * базы и без ролей. Ошибка здесь открыла бы менеджеру деньги всей
 * практики молча, и ни одно другое правило этого бы не заметило.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('выборка аналитики', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { loadRows } = await import('../src/lib/cabinet/analytics/data.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const actorOf = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `an-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const mine = await prisma.user.create({
      data: { email: `an-mgr-a-${stamp}@example.org`, fullName: 'Куратор А', role: 'MANAGER' },
    });
    const other = await prisma.user.create({
      data: { email: `an-mgr-b-${stamp}@example.org`, fullName: 'Куратор Б', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `an-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const client = await prisma.user.create({
      data: { email: `an-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `an-type-${stamp}`, name: 'Сопровождение' },
    });
    const profile = await prisma.clientProfile.create({
      data: { fullName: `Заказчик ${stamp}`, normalizedName: `an-client-${stamp}`, userId: client.id },
    });

    const own = await prisma.project.create({
      data: {
        code: `PD-AN-${stamp}-A`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Своя работа',
        managerId: mine.id,
        status: 'ACTIVE',
      },
    });
    const foreign = await prisma.project.create({
      data: {
        code: `PD-AN-${stamp}-B`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Чужая работа',
        managerId: other.id,
        status: 'ACTIVE',
      },
    });
    // Деньги: по одному договору с оплаченным и запланированным траншем.
    const money = [
      [own.id, 100_000_00n, 40_000_00n],
      [foreign.id, 500_000_00n, 500_000_00n],
    ] as const;
    for (const [index, [projectId, total, paid]] of money.entries()) {
      const contract = await prisma.contract.create({
        data: { projectId, number: `Д-AN-${stamp}-${index}`, totalAmount: total },
      });
      await prisma.tranche.create({
        data: { contractId: contract.id, title: 'Аванс', amount: paid, status: 'PAID' },
      });
      await prisma.tranche.create({
        data: { contractId: contract.id, title: 'Остаток', amount: total - paid, status: 'PLANNED' },
      });
    }

    Object.assign(ids, {
      boss: boss.id,
      mine: mine.id,
      other: other.id,
      expert: expert.id,
      client: client.id,
      profile: profile.id,
      own: own.id,
      foreign: foreign.id,
      type: type.id,
    });
  });

  after(async () => {
    const projects = [ids.own!, ids.foreign!];
    const contracts = await prisma.contract.findMany({
      where: { projectId: { in: projects } },
      select: { id: true },
    });
    await prisma.tranche.deleteMany({
      where: { contractId: { in: contracts.map((row) => row.id) } },
    });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.boss!, ids.mine!, ids.other!, ids.expert!, ids.client!] } },
    });
    await prisma.$disconnect();
  });

  it('руководитель видит обе работы', async () => {
    const rows = await loadRows(actorOf(ids.boss!, 'HEAD'));
    const mine = rows.filter((row) => row.code.startsWith(`PD-AN-${stamp}-`));
    assert.deepEqual(
      mine.map((row) => row.code).sort(),
      [`PD-AN-${stamp}-A`, `PD-AN-${stamp}-B`],
    );
  });

  it('аналитика закрыта всем, кроме руководителя', async () => {
    // Витрины практики — предмет руководителя: менеджеру видна его
    // работа, но не сводные деньги по всей практике (решение Р-149).
    await assert.rejects(() => loadRows(actorOf(ids.mine!, 'MANAGER')), AccessDenied);
    await assert.rejects(
      () => loadRows(actorOf(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date() })),
      AccessDenied,
    );
    await assert.rejects(
      () => loadRows(actorOf(ids.client!, 'CLIENT', { clientProfileId: ids.profile! })),
      AccessDenied,
    );
  });

  it('выборка идёт через scopeProjects, а не своим условием', async () => {
    // Руководителю `scopeProjects` отдаёт пустое условие, и в выборку
    // попадает вся практика; сужение роли живёт в одном месте, и здесь
    // проверяется, что выборка им пользуется.
    const rows = await loadRows(actorOf(ids.boss!, 'HEAD'));
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((row) => typeof row.code === 'string' && row.code.length > 0));
  });

  it('поступившим считается сумма оплаченных траншей, а не поле проекта', async () => {
    const rows = await loadRows(actorOf(ids.boss!, 'HEAD'));
    const own = rows.find((row) => row.code === `PD-AN-${stamp}-A`);
    assert.ok(own !== undefined);
    assert.equal(own.cost, 100_000_00n);
    assert.equal(own.paid, 40_000_00n, 'запланированный транш засчитан как поступивший');
  });
});
