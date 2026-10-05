/**
 * Годовые итоги практики: введённые руками и посчитанные кабинетом.
 *
 * Руководитель ведёт выручку и расходы по годам в отдельной книге, а кабинет
 * знает только те работы, что через него прошли. Пока история за прошлые годы
 * не перенесена целиком, две величины расходятся, и сводка показывает обе —
 * с расхождением. Одно «итоговое» число здесь было бы вредным: оно скрыло бы,
 * какая часть года ведётся в кабинете, а какая держится на памяти (Р-156).
 */

import { ensure, type Actor } from './access.ts';
import { prisma } from '../db.ts';
import { record } from './audit.ts';

export interface YearRow {
  readonly year: number;
  /** Введено руководителем. `null` — за этот год ввода не было. */
  readonly entered: { revenue: bigint; costs: bigint; profit: bigint; note: string | null } | null;
  /** Посчитано кабинетом по оплаченным траншам и выплатам. */
  readonly counted: { revenue: bigint; costs: bigint; profit: bigint; orders: number };
  /** Разница «введено минус посчитано» по выручке. `null`, если ввода не было. */
  readonly revenueGap: bigint | null;
}

export interface YearlySummary {
  readonly rows: readonly YearRow[];
  /**
   * Сколько поступлений отнесено к году не по дате оплаты, а по дате договора
   * или, без неё, начала работы.
   * В перенесённой книге заказов даты оплаты нет — она там не велась, — и без
   * запасной даты вся историческая выручка выпала бы из сводки.
   */
  readonly datedByContract: number;
  /** Поступления, у которых не нашлось ни одной даты: в сводку не попали. */
  readonly undated: bigint;
}

/**
 * Дата поступления транша — одна функция для «Итогов по годам» и «Прибыли
 * по месяцам», чтобы сумма месяцев сходилась с годом (требование РК-21,
 * решение Р-353): дата оплаты, а без неё — дата договора или начала
 * работы (Р-133, Р-156).
 */
export function receiptOn(tranche: {
  readonly paidOn: Date | null;
  readonly contract: { readonly signedOn: Date | null; readonly project: { readonly startedOn: Date | null } };
}): Date | null {
  return tranche.paidOn ?? tranche.contract.signedOn ?? tranche.contract.project.startedOn ?? null;
}

/** Год даты в часовом поясе UTC: даты в базе хранятся в нём же. */
function yearOf(date: Date): number {
  return date.getUTCFullYear();
}

function add(map: Map<number, bigint>, year: number, amount: bigint): void {
  map.set(year, (map.get(year) ?? 0n) + amount);
}

export async function yearlyRows(actor: Actor): Promise<YearlySummary> {
  ensure(actor, 'MARGIN_VIEW');

  const [entered, tranches, payouts, projects, expenses] = await Promise.all([
    prisma.yearlyFinance.findMany({ orderBy: { year: 'desc' } }),
    // Выручка года — оплаченные транши, отнесённые к дате оплаты: деньги
    // приходят в тот год, когда пришли.
    //
    // У перенесённых из книги заказов поступлений даты оплаты нет: в книге её
    // не вели, и подставлять выдуманную при переносе отказались намеренно
    // (Р-133). Поэтому берётся запасная дата — договора, затем начала работы.
    // Без неё вся историческая выручка выпала бы из сводки, и расхождение с
    // введёнными величинами равнялось бы им целиком.
    prisma.tranche.findMany({
      where: { status: 'PAID' },
      select: {
        amount: true,
        paidOn: true,
        contract: {
          select: { signedOn: true, project: { select: { startedOn: true } } },
        },
      },
    }),
    prisma.expertPayout.findMany({
      where: { status: 'PAID', paidOn: { not: null } },
      select: { amount: true, paidOn: true },
    }),
    prisma.project.findMany({
      where: { startedOn: { not: null } },
      select: { startedOn: true },
    }),
    // Расходы по статьям входят в «Итоги по годам» (ОР-9; РК-21, Р-353).
    prisma.expense.findMany({ select: { amount: true, month: true } }),
  ]);

  const revenue = new Map<number, bigint>();
  const costs = new Map<number, bigint>();
  const orders = new Map<number, number>();

  let datedByContract = 0;
  let undated = 0n;
  for (const t of tranches) {
    const date = receiptOn(t);
    if (date === null) {
      undated += t.amount;
      continue;
    }
    if (t.paidOn === null) datedByContract += 1;
    add(revenue, yearOf(date), t.amount);
  }
  for (const p of payouts) add(costs, yearOf(p.paidOn!), p.amount);
  for (const e of expenses) add(costs, yearOf(e.month), e.amount);
  for (const p of projects) {
    const year = yearOf(p.startedOn!);
    orders.set(year, (orders.get(year) ?? 0) + 1);
  }

  // Год попадает в сводку, если он есть хотя бы в одном источнике: строка с
  // введённой цифрой и без работ в кабинете так же законна, как обратная.
  const years = new Set<number>([
    ...entered.map((e) => e.year),
    ...revenue.keys(),
    ...costs.keys(),
    ...orders.keys(),
  ]);

  const byYear = new Map(entered.map((e) => [e.year, e]));

  const rows = [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const own = byYear.get(year) ?? null;
      const countedRevenue = revenue.get(year) ?? 0n;
      const countedCosts = costs.get(year) ?? 0n;
      return {
        year,
        entered:
          own === null
            ? null
            : {
                revenue: own.revenue,
                costs: own.costs,
                profit: own.revenue - own.costs,
                note: own.note,
              },
        counted: {
          revenue: countedRevenue,
          costs: countedCosts,
          profit: countedRevenue - countedCosts,
          orders: orders.get(year) ?? 0,
        },
        revenueGap: own === null ? null : own.revenue - countedRevenue,
      };
    });

  return { rows, datedByContract, undated };
}

export interface YearInput {
  readonly year: number;
  readonly revenue: bigint;
  readonly costs: bigint;
  readonly note: string | null;
}

/** Границы года: ниже — опечатка, выше — не наступивший год. */
const FIRST_YEAR = 2000;

export async function saveYear(actor: Actor, input: YearInput): Promise<void> {
  ensure(actor, 'PAYMENT_EDIT');

  const limit = new Date().getUTCFullYear();
  if (!Number.isInteger(input.year) || input.year < FIRST_YEAR || input.year > limit) {
    throw new Error(`Год указывается числом от ${FIRST_YEAR} до ${limit}`);
  }
  if (input.revenue < 0n || input.costs < 0n) {
    throw new Error('Выручка и расходы не бывают отрицательными');
  }

  // Пустая заметка при повторном вводе года прежнюю не стирает: форма
  // года не заполняется прежними величинами, и заметка пропадала молча
  // (улучшение УР-03, решение Р-387). Новая заметка заменяет прежнюю.
  const note = input.note === null || input.note.trim() === '' ? null : input.note.trim();
  const data = {
    revenue: input.revenue,
    costs: input.costs,
    updatedById: actor.id,
  };

  await prisma.yearlyFinance.upsert({
    where: { year: input.year },
    create: { year: input.year, ...data, note },
    update: note === null ? data : { ...data, note },
  });

  // В журнал уходят сами величины: спорная цифра должна иметь автора, дату и
  // прежнее значение — иначе через год источник расхождения не установить.
  await record(actor, {
    action: 'FINANCE_YEAR_SAVE',
    objectType: 'YearlyFinance',
    objectId: String(input.year),
    payload: {
      year: input.year,
      revenue: input.revenue.toString(),
      costs: input.costs.toString(),
    },
  });
}

/**
 * Удалить введённые величины года (требование РК-15, решение Р-346).
 * Посчитанные кабинетом величины остаются: удаляется только ввод. В журнал
 * уходят прежние величины — спорную цифру и после удаления можно отнести к
 * автору и дате (Р-156).
 */
export async function removeYear(actor: Actor, year: number): Promise<void> {
  ensure(actor, 'PAYMENT_EDIT');
  if (!Number.isInteger(year)) throw new Error('Год указывается числом');
  const entered = await prisma.yearlyFinance.findUnique({
    where: { year },
    select: { revenue: true, costs: true, note: true },
  });
  if (entered === null) throw new Error(`Введённых величин за ${year} год нет: удалять нечего`);
  const removed = await prisma.yearlyFinance.deleteMany({ where: { year } });
  if (removed.count === 0) throw new Error('Год уже удалён: обновите страницу');
  await record(actor, {
    action: 'FINANCE_YEAR_REMOVE',
    objectType: 'YearlyFinance',
    objectId: String(year),
    payload: {
      year,
      revenue: entered.revenue.toString(),
      costs: entered.costs.toString(),
      note: entered.note,
    },
  });
}
