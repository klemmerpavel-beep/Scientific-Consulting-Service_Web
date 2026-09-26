/**
 * Определения величин руководителя на настоящей базе (решение Р-256).
 *
 * Отменённая работа с неполученным остатком и просроченным траншем не
 * входит ни в «к получению» и «просрочено по траншам» главной, ни в «К
 * получению» и отбор «С остатком» экрана денег, ни в задолженность
 * аналитики — и входит в потери. Маржа практики вычитает начисления по
 * работе без договора. Работа без договора в перечне «Ведутся сейчас» —
 * без договора, а не «оплачено полностью». Договор старой работы,
 * закрытой вчера, не попадает в «законтрактовано за период».
 *
 * Итоги главной и экрана денег сквозные по практике, поэтому проверка
 * меряет прирост: читает величины до и после заведения своих записей.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'h'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('определения величин руководителя', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { activeWorks, moneyBrief } = await import('../src/lib/cabinet/summary.ts');
  const { loadRows } = await import('../src/lib/cabinet/analytics/data.ts');
  const metrics = await import('../src/lib/cabinet/analytics/metrics.ts');
  const { workMoneyNote } = await import('../src/lib/cabinet/money.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const DAY = 86_400_000;
  const ids: Record<string, string> = {};
  const projects: string[] = [];

  const head = (): Actor => ({
    id: ids.head!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  let brief0: { received: bigint; awaiting: bigint; overdue: bigint };
  let orphan0: bigint;

  const newProject = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-HM-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix} ${stamp}`,
        managerId: ids.head!,
        expertId: ids.expert!,
        ...extra,
      },
    });
    projects.push(project.id);
    return project.id;
  };

  before(async () => {
    const headUser = await prisma.user.create({
      data: { email: `hm-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const expert = await prisma.user.create({
      data: { email: `hm-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `hm клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `hm-${stamp}`, name: 'Проверка величин' } });
    Object.assign(ids, { head: headUser.id, expert: expert.id, client: client.id, type: type.id });

    // Замер до своих записей: итоги сквозные по практике.
    brief0 = await moneyBrief(head());
    orphan0 = (await finance.financeSummary(head())).totals.accruedWithoutContract;

    const today = moscowToday();
    // Отменённая работа: получено 50 000 из 200 000, выставленный транш на
    // 150 000 со сроком десять дней назад.
    ids.cancelled = await newProject('X', {
      status: 'CANCELLED',
      startedOn: new Date(today.getTime() - 120 * DAY),
      dueOn: new Date(today.getTime() - 20 * DAY),
      closedOn: new Date(today.getTime() - 5 * DAY),
    });
    const cancelledContract = await prisma.contract.create({
      data: { projectId: ids.cancelled, number: `HM-${tail}-X`, totalAmount: 200_000_00n },
    });
    await prisma.tranche.createMany({
      data: [
        {
          contractId: cancelledContract.id,
          title: 'Аванс',
          amount: 50_000_00n,
          status: 'PAID',
          plannedDate: new Date(today.getTime() - 100 * DAY),
          paidOn: new Date(today.getTime() - 100 * DAY),
        },
        {
          contractId: cancelledContract.id,
          title: 'Остаток',
          amount: 150_000_00n,
          status: 'INVOICED',
          plannedDate: new Date(today.getTime() - 10 * DAY),
        },
      ],
    });

    // Идущая работа без договора, но с начислением эксперту.
    ids.bare = await newProject('B', { status: 'ACTIVE', startedOn: new Date(today.getTime() - 10 * DAY) });
    await prisma.expertPayout.create({
      data: { projectId: ids.bare, expertId: ids.expert!, amount: 30_000_00n },
    });

    // Старая работа: начата и подписана два года назад, закрыта вчера.
    ids.old = await newProject('O', {
      status: 'COMPLETED',
      startedOn: new Date(today.getTime() - 730 * DAY),
      closedOn: new Date(today.getTime() - DAY),
    });
    // Оплачена полностью два года назад: в остатках и поступлениях за
    // период её нет, проверяется только отнесение договора к периоду.
    const oldContract = await prisma.contract.create({
      data: {
        projectId: ids.old,
        number: `HM-${tail}-O`,
        totalAmount: 500_000_00n,
        signedOn: new Date(today.getTime() - 728 * DAY),
      },
    });
    await prisma.tranche.create({
      data: {
        contractId: oldContract.id,
        title: 'Полная оплата',
        amount: 500_000_00n,
        status: 'PAID',
        plannedDate: new Date(today.getTime() - 700 * DAY),
        paidOn: new Date(today.getTime() - 700 * DAY),
      },
    });
  });

  after(async () => {
    await prisma.expertPayout.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projects } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.head!, ids.expert!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('главная: отменённая работа не входит в «к получению» и «просрочено по траншам»', async () => {
    const now = await moneyBrief(head());
    // Полученное по отменённой работе — получено: деньги пришли. Ещё
    // 500 000 — полная оплата старой работы.
    assert.equal(now.received - brief0.received, 550_000_00n);
    assert.equal(now.awaiting - brief0.awaiting, 0n, 'остаток отменённой работы ждут к получению');
    assert.equal(now.overdue - brief0.overdue, 0n, 'транш отменённой работы числится просроченным');
  });

  it('экран денег: у отменённой работы к получению ноль, в «С остатком» её нет', async () => {
    const { rows, totals } = await finance.financeSummary(head());
    const row = rows.find((item) => item.projectId === ids.cancelled);
    assert.ok(row !== undefined);
    assert.equal(row.awaiting, 0n);
    assert.equal(row.received, 50_000_00n);
    assert.ok(!rows.filter((item) => item.awaiting > 0n).some((item) => item.projectId === ids.cancelled));
    assert.equal(totals.awaiting, rows.reduce((acc, item) => acc + item.awaiting, 0n));
  });

  it('маржа практики вычитает начисления по работе без договора', async () => {
    const { rows, totals } = await finance.financeSummary(head());
    assert.ok(!rows.some((item) => item.projectId === ids.bare), 'у работы без договора появилась строка');
    assert.equal(totals.accruedWithoutContract - orphan0, 30_000_00n);
    assert.equal(
      totals.margin,
      rows.reduce((acc, item) => acc + item.margin, 0n) - totals.accruedWithoutContract,
    );
  });

  it('экран оплат отменённой работы: осталось оплатить ноль, работа помечена отменённой', async () => {
    const money = await finance.projectMoney(head(), ids.cancelled!);
    assert.ok(money !== null);
    assert.equal(money.awaiting, 0n);
    assert.equal(money.cancelled, true);
    // Выставленный транш остаётся в учёте — его можно отметить оплаченным.
    assert.equal(money.scheduled, 150_000_00n);
  });

  it('аналитика: отменённая — в потерях, но не в задолженности', async () => {
    const rows = (await loadRows(head())).filter((row) => projects.includes(row.id));
    const cancelled = rows.find((row) => row.id === ids.cancelled);
    assert.ok(cancelled !== undefined);
    assert.equal(metrics.openBalance(cancelled), 0n);
    assert.equal(metrics.overview(rows).outstanding, 0n);
    assert.ok(!metrics.receivables(rows, new Date()).some((debt) => debt.code === cancelled.code));
    const report = metrics.losses(rows);
    assert.deepEqual(
      report.rows.map((loss) => [loss.code, loss.lost]),
      [[cancelled.code, 150_000_00n]],
    );
  });

  it('отчёт за период: договор старой работы, закрытой в периоде, не законтрактован за период', async () => {
    const rows = (await loadRows(head())).filter((row) => projects.includes(row.id));
    const old = rows.find((row) => row.id === ids.old);
    assert.ok(old !== undefined);
    assert.ok(old.signedOn !== null, 'выборка аналитики потеряла дату договора');
    const today = new Date();
    const from = new Date(today.getTime() - 30 * DAY);
    assert.ok(old.closedOn !== null && old.closedOn >= from, 'работа не закрыта в периоде');
    const period = metrics.contractedBetween([old], from, today);
    assert.equal(period.total, 0n);
    assert.equal(period.averageCheck, null);
  });

  it('«Ведутся сейчас»: работа без договора — «договор не заведён»', async () => {
    const works = await activeWorks(head());
    const bare = works.find((work) => work.code === `PD-HM-${tail}-B`);
    assert.ok(bare !== undefined);
    assert.equal(bare.hasContract, false);
    assert.equal(
      workMoneyNote(
        bare.hasContract
          ? { contracted: bare.contracted ?? 0n, outstanding: bare.outstanding ?? 0n, writtenOff: bare.writtenOff ?? 0n }
          : null,
      ),
      'договор не заведён',
    );
  });
});
