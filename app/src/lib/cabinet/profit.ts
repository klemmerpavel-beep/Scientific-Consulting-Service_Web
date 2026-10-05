/**
 * Расходы практики и «Прибыль по месяцам» (требование РК-21, решение
 * Р-353; ответ ОР-9).
 *
 * Прибыль месяца — поступления по дате поступления минус выплаты
 * кураторам по дате выплаты минус расходы по статьям. Дата поступления —
 * та же функция, что у «Итогов по годам» (`receiptOn`): сумма месяцев
 * года сходится с годом. Разрез по видам работ: поступления и выплаты —
 * по виду работы, расходы — по указанному виду, без вида — «общие».
 * Строки перенесённой книги заказов отнесены к дате заказа или договора:
 * даты оплаты в книге не вели.
 */

import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday, now as clockNow } from './clock.ts';
import { receiptOn } from './finance-years.ts';

export const EXPENSE_NOTE_MAX = 500;
const GENERAL = 'general';

const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const keyOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export interface ExpenseInput {
  /** Месяц `ГГГГ-ММ`. */
  readonly month: string;
  readonly categoryId: string;
  readonly amount: bigint | null;
  readonly serviceTypeId?: string | null;
  readonly note?: string | null;
}

/** Статьи расходов — справочник. */
export async function expenseCategories(actor: Actor) {
  ensure(actor, 'PAYMENT_EDIT');
  return prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
}

/** Внести расход месяца: статья, сумма, по желанию — вид работ и заметка. */
export async function addExpense(actor: Actor, input: ExpenseInput): Promise<{ id: string }> {
  ensure(actor, 'PAYMENT_EDIT');
  const match = /^(\d{4})-(\d{2})$/u.exec(input.month.trim());
  const month = match === null ? null : new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (month === null || Number(match![2]) < 1 || Number(match![2]) > 12 || month.getUTCFullYear() < 2000) {
    throw new Error('Укажите месяц расхода');
  }
  if (month.getTime() > monthStart(moscowToday()).getTime()) throw new Error('Расход будущего месяца не вносится');
  if (input.amount === null || input.amount <= 0n) throw new Error('Сумма расхода — больше нуля');
  const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
  if (category === null) throw new Error('Выберите статью расхода из справочника');
  const typeId = (input.serviceTypeId ?? '').trim() || null;
  if (typeId !== null && (await prisma.serviceType.count({ where: { id: typeId } })) === 0) {
    throw new Error('Вид работ не найден в справочнике');
  }
  const note = (input.note ?? '').trim() || null;
  if (note !== null && note.length > EXPENSE_NOTE_MAX) throw new Error(`Заметка — не длиннее ${EXPENSE_NOTE_MAX} знаков`);
  const created = await prisma.expense.create({
    data: { month, categoryId: category.id, amount: input.amount, serviceTypeId: typeId, note, createdById: actor.id },
    select: { id: true },
  });
  await record(actor, {
    action: 'EXPENSE_ADDED',
    objectType: 'Expense',
    objectId: created.id,
    payload: { month: keyOf(month), category: category.id, amount: input.amount.toString(), serviceTypeId: typeId },
  });
  return created;
}

/** Удалить ошибочно внесённый расход; прежние величины — в журнал. */
export async function removeExpense(actor: Actor, id: string): Promise<void> {
  ensure(actor, 'PAYMENT_EDIT');
  const row = await prisma.expense.findUnique({ where: { id }, select: { month: true, amount: true, categoryId: true } });
  if (row === null) throw new Error('Расход не найден');
  await prisma.expense.delete({ where: { id } });
  await record(actor, {
    action: 'EXPENSE_REMOVED',
    objectType: 'Expense',
    objectId: id,
    payload: { month: keyOf(row.month), category: row.categoryId, amount: row.amount.toString() },
  });
}

export interface MonthProfit {
  readonly key: string;
  readonly year: number;
  readonly month: number;
  readonly revenue: bigint;
  readonly payouts: bigint;
  readonly expenses: bigint;
  readonly profit: bigint;
}

export interface TypeProfit {
  readonly typeCode: string;
  readonly typeName: string;
  readonly revenue: bigint;
  readonly payouts: bigint;
  readonly expenses: bigint;
  readonly profit: bigint;
}

/**
 * Прибыль по месяцам: двенадцать месяцев по текущий и разрез по видам за
 * те же месяцы; расходы окна по строкам — для таблицы и удаления.
 */
export async function monthlyProfit(actor: Actor, at: Date = clockNow()) {
  ensure(actor, 'MARGIN_VIEW');
  const today = moscowToday(at);
  const months = Array.from({ length: 12 }, (_, index) => {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + index, 1));
    return { key: keyOf(first), year: first.getUTCFullYear(), month: first.getUTCMonth() + 1, revenue: 0n, payouts: 0n, expenses: 0n };
  });
  const from = new Date(Date.UTC(months[0]!.year, months[0]!.month - 1, 1));
  const byKey = new Map(months.map((month) => [month.key, month]));
  const types = new Map<string, { typeName: string; revenue: bigint; payouts: bigint; expenses: bigint }>();
  const typeCell = (code: string, name: string) => {
    const cell = types.get(code) ?? { typeName: name, revenue: 0n, payouts: 0n, expenses: 0n };
    types.set(code, cell);
    return cell;
  };

  const [tranches, payouts, expenses] = await Promise.all([
    prisma.tranche.findMany({
      where: { status: 'PAID' },
      select: {
        amount: true,
        paidOn: true,
        contract: {
          select: {
            signedOn: true,
            project: { select: { startedOn: true, serviceType: { select: { code: true, name: true } } } },
          },
        },
      },
    }),
    prisma.expertPayout.findMany({
      where: { status: 'PAID', paidOn: { gte: from } },
      select: { amount: true, paidOn: true, project: { select: { serviceType: { select: { code: true, name: true } } } } },
    }),
    prisma.expense.findMany({
      where: { month: { gte: from } },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        month: true,
        amount: true,
        note: true,
        category: { select: { name: true } },
        serviceType: { select: { code: true, name: true } },
      },
    }),
  ]);

  let fallbackDated = 0;
  for (const tranche of tranches) {
    const date = receiptOn(tranche);
    if (date === null) continue;
    const month = byKey.get(keyOf(date));
    if (month === undefined) continue;
    if (tranche.paidOn === null) fallbackDated += 1;
    month.revenue += tranche.amount;
    const type = tranche.contract.project.serviceType;
    typeCell(type.code, type.name).revenue += tranche.amount;
  }
  for (const payout of payouts) {
    const month = byKey.get(keyOf(payout.paidOn!));
    if (month === undefined) continue;
    month.payouts += payout.amount;
    const type = payout.project.serviceType;
    typeCell(type.code, type.name).payouts += payout.amount;
  }
  for (const expense of expenses) {
    const month = byKey.get(keyOf(expense.month));
    if (month === undefined) continue;
    month.expenses += expense.amount;
    const type = expense.serviceType;
    (type === null ? typeCell(GENERAL, 'Общие расходы') : typeCell(type.code, type.name)).expenses += expense.amount;
  }

  const rows: MonthProfit[] = months.map((month) => ({ ...month, profit: month.revenue - month.payouts - month.expenses }));
  const byType: TypeProfit[] = [...types.entries()]
    .map(([typeCode, cell]) => ({ typeCode, ...cell, profit: cell.revenue - cell.payouts - cell.expenses }))
    .sort((a, b) => (a.typeCode === GENERAL ? 1 : b.typeCode === GENERAL ? -1 : Number(b.revenue - a.revenue)));
  return { months: rows, byType, expenses, fallbackDated };
}
