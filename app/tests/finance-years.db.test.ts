/**
 * Итоги по годам на настоящей базе (решение Р-184).
 *
 * Сводка по годам — то, чем руководитель сверяет перенесённую историю с
 * тем, что видит кабинет, и у неё не было ни одной проверки. Главное
 * здесь — запасная дата: у поступлений, перенесённых из книги заказов,
 * даты оплаты нет, и без запасной вся историческая выручка выпала бы из
 * сводки, а расхождение равнялось бы ей целиком (Р-133, Р-156).
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('итоги по годам', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { yearlyRows, saveYear, removeYear } = await import('../src/lib/cabinet/finance-years.ts');

  const stamp = Date.now();
  // Годы берутся давними: в базе стенда лежит перенесённая книга за
  // 2024–2026, и своими годами набор не пересекается с ней. Будущий год
  // не годится — ввод ограничен текущим.
  const YEAR_PAID = 2001;
  const YEAR_CONTRACT = 2002;
  const ids: Record<string, string> = {};

  /** Руководитель: идентификатор появляется после создания записи. */
  const head = (): Actor => ({
    id: ids.boss!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `fy-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `fy-type-${stamp}`, name: 'Сопровождение' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Заказчик ${stamp}`, normalizedName: `fy-client-${stamp}` },
    });

    // Первая работа: оплата с проставленной датой.
    const dated = await prisma.project.create({
      data: {
        code: `PD-FY-${stamp}-A`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Оплата с датой',
        managerId: boss.id,
        status: 'COMPLETED',
        startedOn: new Date(`${YEAR_PAID}-02-01T00:00:00Z`),
      },
    });
    const datedContract = await prisma.contract.create({
      data: { projectId: dated.id, number: `Д-FY-${stamp}-A`, totalAmount: 100_000_00n },
    });
    await prisma.tranche.create({
      data: {
        contractId: datedContract.id,
        title: 'Оплата',
        amount: 100_000_00n,
        status: 'PAID',
        paidOn: new Date(`${YEAR_PAID}-03-15T00:00:00Z`),
      },
    });

    // Вторая: оплата без даты — как у перенесённых из книги заказов.
    const undated = await prisma.project.create({
      data: {
        code: `PD-FY-${stamp}-B`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Оплата без даты',
        managerId: boss.id,
        status: 'COMPLETED',
        startedOn: new Date(`${YEAR_CONTRACT}-01-10T00:00:00Z`),
      },
    });
    const undatedContract = await prisma.contract.create({
      data: {
        projectId: undated.id,
        number: `Д-FY-${stamp}-B`,
        totalAmount: 50_000_00n,
        signedOn: new Date(`${YEAR_CONTRACT}-04-20T00:00:00Z`),
      },
    });
    await prisma.tranche.create({
      data: { contractId: undatedContract.id, title: 'Оплата', amount: 50_000_00n, status: 'PAID' },
    });

    Object.assign(ids, {
      boss: boss.id,
      type: type.id,
      client: client.id,
      dated: dated.id,
      undated: undated.id,
    });
  });

  after(async () => {
    const projects = [ids.dated!, ids.undated!];
    const contracts = await prisma.contract.findMany({
      where: { projectId: { in: projects } },
      select: { id: true },
    });
    await prisma.tranche.deleteMany({
      where: { contractId: { in: contracts.map((row) => row.id) } },
    });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.yearlyFinance.deleteMany({ where: { year: { in: [YEAR_PAID, YEAR_CONTRACT] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.boss } });
    await prisma.user.deleteMany({ where: { id: ids.boss } });
    await prisma.$disconnect();
  });

  it('оплата с датой попадает в год оплаты', async () => {
    const { rows } = await yearlyRows(head());
    const row = rows.find((item) => item.year === YEAR_PAID);
    assert.ok(row !== undefined, 'год оплаты не попал в сводку');
    assert.equal(row.counted.revenue, 100_000_00n);
  });

  it('оплата без даты относится к году договора и отмечается счётчиком', async () => {
    const { rows, datedByContract } = await yearlyRows(head());
    const row = rows.find((item) => item.year === YEAR_CONTRACT);
    assert.ok(row !== undefined, 'год договора не попал в сводку');
    assert.equal(row.counted.revenue, 50_000_00n);
    assert.ok(datedByContract >= 1, 'поступление без даты оплаты не сосчитано');
  });

  it('введённая величина встаёт рядом с посчитанной, и видно расхождение', async () => {
    await saveYear(head(), { year: YEAR_PAID, revenue: 120_000_00n, costs: 20_000_00n, note: null });
    const { rows } = await yearlyRows(head());
    const row = rows.find((item) => item.year === YEAR_PAID);
    assert.ok(row?.entered != null, 'введённая величина не сохранилась');
    assert.equal(row.entered.revenue, 120_000_00n);
    assert.equal(row.entered.profit, 100_000_00n, 'прибыль не равна выручке за вычетом расходов');
    // Введено больше, чем посчитано: расхождение положительное.
    assert.equal(row.revenueGap, 20_000_00n);
  });

  it('повторный ввод года заменяет прежние величины, а не множит строки', async () => {
    await saveYear(head(), { year: YEAR_PAID, revenue: 130_000_00n, costs: 30_000_00n, note: 'правка' });
    const { rows } = await yearlyRows(head());
    const mine = rows.filter((item) => item.year === YEAR_PAID);
    assert.equal(mine.length, 1, 'строка года задвоилась');
    assert.equal(mine[0]?.entered?.revenue, 130_000_00n);
  });

  it('снятие года убирает введённые величины, посчитанные остаются', async () => {
    await removeYear(head(), YEAR_PAID);
    const { rows } = await yearlyRows(head());
    const row = rows.find((item) => item.year === YEAR_PAID);
    assert.ok(row !== undefined, 'год исчез вместе с посчитанными величинами');
    assert.equal(row.entered, null);
    assert.equal(row.counted.revenue, 100_000_00n);
  });

  it('сводка закрыта всем, кроме руководителя', async () => {
    const manager: Actor = { ...head(), role: 'MANAGER' };
    await assert.rejects(() => yearlyRows(manager), AccessDenied);
    await assert.rejects(() => saveYear(manager, { year: 2003, revenue: 1n, costs: 0n, note: null }), AccessDenied);
  });
});
