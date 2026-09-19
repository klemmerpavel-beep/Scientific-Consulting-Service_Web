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
   * Сколько поступлений отнесено к году по дате договора, а не по дате оплаты.
   * В перенесённой книге заказов даты оплаты нет — она там не велась, — и без
   * запасной даты вся историческая выручка выпала бы из сводки.
   */
  readonly datedByContract: number;
  /** Поступления, у которых не нашлось ни одной даты: в сводку не попали. */
  readonly undated: bigint;
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

  const [entered, tranches, payouts, projects] = await Promise.all([
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
  ]);

  const revenue = new Map<number, bigint>();
  const costs = new Map<number, bigint>();
  const orders = new Map<number, number>();

  let datedByContract = 0;
  let undated = 0n;
  for (const t of tranches) {
    const fallback = t.contract.signedOn ?? t.contract.project.startedOn ?? null;
    const date = t.paidOn ?? fallback;
    if (date === null) {
      undated += t.amount;
      continue;
    }
    if (t.paidOn === null) datedByContract += 1;
    add(revenue, yearOf(date), t.amount);
  }
  for (const p of payouts) add(costs, yearOf(p.paidOn!), p.amount);
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

  const data = {
    revenue: input.revenue,
    costs: input.costs,
    note: input.note,
    updatedById: actor.id,
  };

  await prisma.yearlyFinance.upsert({
    where: { year: input.year },
    create: { year: input.year, ...data },
    update: data,
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

export async function removeYear(actor: Actor, year: number): Promise<void> {
  ensure(actor, 'PAYMENT_EDIT');
  await prisma.yearlyFinance.deleteMany({ where: { year } });
  await record(actor, {
    action: 'FINANCE_YEAR_REMOVE',
    objectType: 'YearlyFinance',
    objectId: String(year),
  });
}
