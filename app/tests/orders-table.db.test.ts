/**
 * «Заказы» на настоящей базе (решение Р-874): руководитель видит все
 * работы, менеджер — свои, клиент и куратор — ничего; отбор по состоянию
 * и долгу, числа вкладок, стоимость, оплачено, остаток и переплата —
 * теми же правилами, что «Деньги по заказу».
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('«Заказы»', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { ordersTable } = await import('../src/lib/cabinet/orders.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const works: string[] = [];
  const users: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-01T00:00:00Z') : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const mine = () => who(ids.manager!, 'MANAGER');
  const theirs = () => who(ids.other!, 'MANAGER');
  const all = { status: 'all', debt: 'all' } as const;
  const own = (rows: readonly { code: string }[]) => rows.filter((row) => row.code.includes(`-${tail}-`)).map((row) => row.code);

  before(async () => {
    const make = async (suffix: string, role: Actor['role']) => {
      const user = await prisma.user.create({ data: { email: `ot-${suffix}-${stamp}@example.org`, fullName: `Сотрудник ${suffix}`, role } });
      users.push(user.id);
      return user.id;
    };
    ids.head = await make('head', 'HEAD');
    ids.manager = await make('mgr', 'MANAGER');
    ids.other = await make('other', 'MANAGER');
    ids.expert = await make('exp', 'EXPERT');
    ids.clientUser = await make('cli', 'CLIENT');
    const card = await prisma.clientProfile.create({
      data: { userId: ids.clientUser, fullName: 'Заказчик Таблицы', normalizedName: `ot заказчик ${stamp}` },
    });
    ids.client = card.id;
    const type = await prisma.serviceType.create({ data: { code: `ot-${stamp}`, name: 'Вид таблицы' } });
    ids.type = type.id;
    const work = async (suffix: string, managerId: string, startedOn: string, status: string, total: bigint | null, paid: bigint) => {
      const project = await prisma.project.create({
        data: {
          code: `PD-OT-${tail}-${suffix}`,
          clientId: card.id,
          serviceTypeId: type.id,
          title: `Работа ${suffix}`,
          managerId,
          expertId: ids.expert,
          status: status as never,
          startedOn: new Date(`${startedOn}T00:00:00Z`),
        },
      });
      works.push(project.id);
      if (total !== null) {
        const contract = await prisma.contract.create({ data: { projectId: project.id, number: `ОТ-${tail}-${suffix}`, totalAmount: total } });
        if (paid > 0n) {
          await prisma.tranche.create({ data: { contractId: contract.id, title: 'Поступление', amount: paid, status: 'PAID', paidOn: new Date() } });
        }
      }
    };
    await work('A', ids.manager, '2026-10-05', 'ACTIVE', 10_000_000n, 4_000_000n);
    await work('B', ids.manager, '2026-10-01', 'COMPLETED', 5_000_000n, 6_000_000n);
    await work('C', ids.manager, '2026-09-20', 'ACTIVE', null, 0n);
    await work('D', ids.other, '2026-10-03', 'CANCELLED', 8_000_000n, 1_000_000n);
  });

  after(async () => {
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: works } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: works } } });
    await prisma.project.deleteMany({ where: { id: { in: works } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('руководитель видит все работы, менеджер — свои; клиент и куратор — отказ', async () => {
    assert.deepEqual(own((await ordersTable(head(), all)).rows), [`PD-OT-${tail}-A`, `PD-OT-${tail}-D`, `PD-OT-${tail}-B`, `PD-OT-${tail}-C`]);
    assert.deepEqual(own((await ordersTable(mine(), all)).rows), [`PD-OT-${tail}-A`, `PD-OT-${tail}-B`, `PD-OT-${tail}-C`]);
    assert.deepEqual(own((await ordersTable(theirs(), all)).rows), [`PD-OT-${tail}-D`]);
    await assert.rejects(ordersTable(who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), all), AccessDenied);
    await assert.rejects(ordersTable(who(ids.expert!, 'EXPERT'), all), AccessDenied);
  });

  it('стоимость, оплачено, остаток и переплата — по правилам денег заказа', async () => {
    const rows = (await ordersTable(mine(), all)).rows.filter((row) => row.code.includes(`-${tail}-`));
    const byCode = Object.fromEntries(rows.map((row) => [row.code.slice(-1), row]));
    assert.deepEqual([byCode.A!.contract, byCode.A!.received, byCode.A!.rest, byCode.A!.overpaid], [10_000_000n, 4_000_000n, 6_000_000n, 0n]);
    assert.deepEqual([byCode.B!.contract, byCode.B!.received, byCode.B!.rest, byCode.B!.overpaid], [5_000_000n, 6_000_000n, 0n, 1_000_000n]);
    assert.deepEqual([byCode.C!.contract, byCode.C!.received, byCode.C!.rest], [null, 0n, null]);
    const cancelled = (await ordersTable(head(), all)).rows.find((row) => row.code === `PD-OT-${tail}-D`)!;
    assert.equal(cancelled.rest, 0n, 'у отменённой работы остаток ждут');
  });

  it('отбор по состоянию и долгу; числа вкладок — по другому отбору', async () => {
    const owing = await ordersTable(mine(), { status: 'all', debt: 'owing' });
    assert.deepEqual(own(owing.rows), [`PD-OT-${tail}-A`]);
    const active = await ordersTable(mine(), { status: 'ACTIVE', debt: 'all' });
    assert.deepEqual(own(active.rows), [`PD-OT-${tail}-A`, `PD-OT-${tail}-C`]);
    const settled = await ordersTable(mine(), { status: 'ACTIVE', debt: 'settled' });
    assert.deepEqual(own(settled.rows), [`PD-OT-${tail}-C`]);
    assert.equal(active.byDebt.all, active.rows.length);
    assert.equal(active.byDebt.owing + active.byDebt.settled, active.byDebt.all);
  });
});
