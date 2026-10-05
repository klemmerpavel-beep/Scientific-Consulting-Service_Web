/**
 * Расходы и «Прибыль по месяцам» (требование РК-21, решение Р-353):
 * расход вносит руководитель — будущий месяц, ноль и чужая статья
 * отклоняются; расход месяца уменьшает прибыль месяца; расход без вида —
 * «общие», с видом — в своём виде; сумма месяцев текущего года сходится с
 * «Итогами по годам», которые включают расходы (ОР-9); удаление — в
 * журнал; менеджеру закрыто.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('расходы и прибыль по месяцам (РК-21)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const profit = await import('../src/lib/cabinet/profit.ts');
  const { yearlyRows } = await import('../src/lib/cabinet/finance-years.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');
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
  const today = moscowToday();
  const thisMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const nextMonth = (() => {
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `pf-head-${stamp}@example.org`, fullName: 'Руководитель Прибыли', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `pf-mgr-${stamp}@example.org`, fullName: 'Менеджер Прибыли', role: 'MANAGER' } }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `pf-${stamp}`, name: `Проверка прибыли ${stamp}` } });
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, type: type.id, typeCode: type.code });
  });

  after(async () => {
    await prisma.expense.deleteMany({ where: { createdById: { in: [ids.head!, ids.manager!] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.head!, ids.manager!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  it('четыре статьи справочника; ошибочный ввод отклоняется; менеджеру закрыто', async () => {
    assert.deepEqual(
      (await profit.expenseCategories(head())).map((row) => row.id),
      ['promotion', 'services', 'contractors', 'other'],
    );
    const base = { month: thisMonth, categoryId: 'promotion', amount: 1_000_000n };
    await assert.rejects(profit.addExpense(who(ids.manager!, 'MANAGER'), base), AccessDenied);
    await assert.rejects(profit.addExpense(head(), { ...base, month: nextMonth }), /будущего месяца/u);
    await assert.rejects(profit.addExpense(head(), { ...base, amount: 0n }), /больше нуля/u);
    await assert.rejects(profit.addExpense(head(), { ...base, categoryId: 'нет' }), /статью расхода/u);
    await assert.rejects(profit.monthlyProfit(who(ids.manager!, 'MANAGER')), AccessDenied);
  });

  it('расход месяца уменьшает прибыль; без вида — «общие», с видом — в своём виде', async () => {
    const before = await profit.monthlyProfit(head());
    const general = await profit.addExpense(head(), { month: thisMonth, categoryId: 'services', amount: 1_000_000n, note: 'Сервис рассылок' });
    await profit.addExpense(head(), { month: thisMonth, categoryId: 'promotion', amount: 500_000n, serviceTypeId: ids.type });
    ids.general = general.id;
    const after = await profit.monthlyProfit(head());
    const month = (data: typeof after) => data.months.find((row) => row.key === thisMonth)!;
    assert.equal(month(after).expenses - month(before).expenses, 1_500_000n);
    assert.equal(month(before).profit - month(after).profit, 1_500_000n);
    assert.equal(after.byType.find((row) => row.typeCode === ids.typeCode)?.expenses, 500_000n);
    const generalBefore = before.byType.find((row) => row.typeCode === 'general')?.expenses ?? 0n;
    assert.equal((after.byType.find((row) => row.typeCode === 'general')?.expenses ?? 0n) - generalBefore, 1_000_000n);
    assert.equal(after.byType.at(-1)?.typeCode, 'general', '«общие» — последней строкой');
  });

  it('сумма месяцев текущего года сходится с «Итогами по годам»', async () => {
    const [data, years] = await Promise.all([profit.monthlyProfit(head()), yearlyRows(head())]);
    const year = today.getUTCFullYear();
    const months = data.months.filter((row) => row.year === year);
    const row = years.rows.find((item) => item.year === year)!;
    assert.equal(months.reduce((acc, month) => acc + month.revenue, 0n), row.counted.revenue);
    assert.equal(months.reduce((acc, month) => acc + month.payouts + month.expenses, 0n), row.counted.costs);
  });

  it('удаление расхода — в журнал с прежними величинами', async () => {
    await profit.removeExpense(head(), ids.general!);
    const entry = await prisma.auditEvent.findFirst({ where: { action: 'EXPENSE_REMOVED', objectId: ids.general } });
    assert.equal((entry?.payload as Record<string, unknown> | null)?.amount, '1000000');
    await assert.rejects(profit.removeExpense(head(), ids.general!), /не найден/u);
  });
});
