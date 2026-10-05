/**
 * «Деньги → Поступления» (требование РК-20, решение Р-348): сумма месяцев,
 * «Далее» и трёх строк — просрочено, без даты, не разнесено — равна «К
 * получению»; транш раскладывается по своему месяцу; позже полугода — в
 * «Далее»; транш сверх остатка договора в итог не входит; отменённая работа
 * денег не ждёт; менеджеру экран не отдаётся.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'x'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('«Поступления» (РК-20)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { moneyBrief } = await import('../src/lib/cabinet/summary.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  // Полдень по Москве 15 октября 2026: месяцы ряда — октябрь…март.
  const AT = new Date('2026-10-15T09:00:00Z');
  const on = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const mine = (plan: Awaited<ReturnType<typeof finance.receiptsPlan>>) =>
    plan.lines.filter((line) => line.code.startsWith(`PD-RC-${String(stamp).slice(-6)}`));

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `rc-head-${stamp}@example.org`, fullName: 'Руководитель Поступлений', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `rc-mgr-${stamp}@example.org`, fullName: 'Менеджер Поступлений', role: 'MANAGER' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Поступлений', normalizedName: `rc клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `rc-${stamp}`, name: 'Проверка поступлений' } });
    const base = { clientId: profile.id, serviceTypeId: type.id, managerId: managerUser.id };
    const code = (suffix: string) => `PD-RC-${String(stamp).slice(-6)}-${suffix}`;
    const [live, over, dead] = await Promise.all([
      prisma.project.create({ data: { ...base, code: code('L'), title: 'Работа с траншами', status: 'ACTIVE' } }),
      prisma.project.create({ data: { ...base, code: code('O'), title: 'Транши сверх договора', status: 'PAUSED' } }),
      prisma.project.create({ data: { ...base, code: code('C'), title: 'Отменённая', status: 'CANCELLED' } }),
    ]);
    const [contract, overContract, deadContract] = await Promise.all([
      prisma.contract.create({ data: { projectId: live.id, number: `RC-${stamp}`, totalAmount: 100_000_00n } }),
      prisma.contract.create({ data: { projectId: over.id, number: `RCO-${stamp}`, totalAmount: 10_000_00n } }),
      prisma.contract.create({ data: { projectId: dead.id, number: `RCC-${stamp}`, totalAmount: 5_000_00n } }),
    ]);
    const tranche = (contractId: string, title: string, amount: bigint, plannedDate: Date | null, status = 'PLANNED') =>
      prisma.tranche.create({ data: { contractId, title, amount, plannedDate, status: status as never } });
    const rows = await Promise.all([
      tranche(contract.id, 'Оплачено', 20_000_00n, on('2026-09-01'), 'PAID'),
      tranche(contract.id, 'Просрочен', 10_000_00n, on('2026-10-01'), 'INVOICED'),
      tranche(contract.id, 'Октябрь', 15_000_00n, on('2026-10-20')),
      tranche(contract.id, 'Декабрь', 12_000_00n, on('2026-12-10')),
      tranche(contract.id, 'Апрель', 8_000_00n, on('2027-04-02')),
      tranche(contract.id, 'Без даты', 5_000_00n, null),
      tranche(overContract.id, 'Ноябрь сверх', 15_000_00n, on('2026-11-05')),
      tranche(deadContract.id, 'Отменённой', 5_000_00n, on('2026-11-01')),
    ]);
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      client: profile.id,
      type: type.id,
      live: live.id,
      over: over.id,
      dead: dead.id,
      contracts: [contract.id, overContract.id, deadContract.id].join(','),
      october: rows[2]!.id,
      april: rows[4]!.id,
    });
  });

  after(async () => {
    const contracts = ids.contracts!.split(',');
    await prisma.tranche.deleteMany({ where: { contractId: { in: contracts } } });
    await prisma.contract.deleteMany({ where: { id: { in: contracts } } });
    await prisma.project.deleteMany({ where: { id: { in: [ids.live!, ids.over!, ids.dead!] } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  it('сумма месяцев, «Далее» и трёх строк равна «К получению»', async () => {
    const [plan, brief] = await Promise.all([finance.receiptsPlan(head(), AT), moneyBrief(head())]);
    const columns = plan.months.reduce((acc, month) => acc + month.amount, 0n) + plan.later.amount;
    const rows = plan.overdue.amount + plan.undated.amount + plan.unallocated.amount;
    assert.equal(columns + rows, plan.total);
    assert.equal(plan.total, brief.awaiting);
  });

  it('транш — в своём месяце; позже полугода — «Далее»; просроченный и без даты — отдельно', async () => {
    const plan = await finance.receiptsPlan(head(), AT);
    assert.deepEqual(
      plan.months.map((month) => month.key),
      ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'],
    );
    assert.equal(plan.months[0]!.label, 'октябрь 2026');
    const own = mine(plan);
    const bucketOf = (title: string) => own.find((line) => line.title === title);
    assert.equal(bucketOf('Октябрь')?.month, '2026-10');
    assert.equal(bucketOf('Декабрь')?.month, '2026-12');
    assert.equal(bucketOf('Апрель')?.bucket, 'later');
    assert.equal(bucketOf('Просрочен')?.bucket, 'overdue');
    assert.equal(bucketOf('Без даты')?.bucket, 'undated');
    assert.equal(bucketOf('Оплачено'), undefined, 'оплаченный транш в поступлениях');
  });

  it('транш сверх остатка договора учтён в пределах остатка; отменённая работа денег не ждёт', async () => {
    const own = mine(await finance.receiptsPlan(head(), AT));
    assert.equal(own.find((line) => line.title === 'Ноябрь сверх')?.amount, 10_000_00n);
    assert.equal(own.find((line) => line.title === 'Отменённой'), undefined);
  });

  it('остаток без траншей — «не разнесено по траншам»', async () => {
    // У рабочей работы остаток 80 000 ₽, траншей на 50 000 ₽: 30 000 ₽ не разнесено.
    const before = await finance.receiptsPlan(head(), AT);
    await prisma.tranche.delete({ where: { id: ids.april } });
    const after = await finance.receiptsPlan(head(), AT);
    assert.equal(after.unallocated.amount - before.unallocated.amount, 8_000_00n);
    assert.equal(after.total, before.total);
  });

  it('менеджеру «Поступления» не отдаются', async () => {
    await assert.rejects(finance.receiptsPlan(who(ids.manager!, 'MANAGER'), AT), AccessDenied);
  });
});
