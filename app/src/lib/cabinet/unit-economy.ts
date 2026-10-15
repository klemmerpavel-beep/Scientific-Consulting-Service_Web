/**
 * Экономика работы (план владельца по образцу, пункт К-4, решение Р-594):
 * поступило, вознаграждение куратора, расходы вида, маржа и её доля — по
 * каждой работе, только руководителю.
 *
 * Маржа — та же, что на экране оплат и в «Деньгах»: полученное и ожидаемое
 * без начислений куратору (`marginOf`, Р-434). Её определение не меняется:
 * расходы вида вычитаются отдельной строкой, и у результата своё имя —
 * «маржа после расходов вида» (одно определение на величину, Р-257).
 *
 * Расходы вида. Расход по статьям вносится на месяц и, по желанию, на вид
 * сопровождения (Р-353); к работе он не привязан. На работы он делится так:
 * - расход вида за месяц делится между работами этого вида пропорционально
 *   их поступлениям в том же месяце (дата поступления — `receiptOn`, как в
 *   «Прибыли по месяцам» и «Итогах по годам»);
 * - если в месяце поступлений по виду не было, расход переходит на
 *   ближайший следующий месяц, где они есть: реклама октября ложится на
 *   работы, оплаченные в ноябре;
 * - расход последних месяцев без поступлений остаётся «не распределённым»
 *   и показывается отдельно, а не теряется;
 * - общие расходы практики (без вида) на работы не делятся: это не
 *   экономика работы, а содержание практики, и они остаются в «Прибыли по
 *   месяцам».
 * Копейки делятся методом наибольшего остатка: сумма долей работ равна
 * распределённому расходу вида до копейки.
 *
 * Здесь — только расчёт, без базы; выборка с проверкой прав —
 * `projectTypeExpenses` и `financeSummary` в `finance.ts`.
 */

/** Месяц даты `ГГГГ-ММ` по UTC — как у расходов и «Прибыли по месяцам». */
export const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export interface Receipt {
  readonly projectId: string;
  readonly typeId: string;
  /** Месяц `ГГГГ-ММ`. */
  readonly month: string;
  readonly amount: bigint;
}

export interface TypedExpense {
  readonly typeId: string;
  /** Месяц `ГГГГ-ММ`. */
  readonly month: string;
  readonly amount: bigint;
}

export interface Allocation {
  /** Доля расходов вида на работу, копейки. */
  readonly byProject: Map<string, bigint>;
  /** Расход вида, который ещё не на что разложить: поступлений после него не было. */
  readonly pending: Map<string, bigint>;
}

/** Разделить сумму по весам до копейки: наибольшие остатки получают по копейке. */
export function splitByWeight(total: bigint, weights: ReadonlyMap<string, bigint>): Map<string, bigint> {
  const out = new Map<string, bigint>();
  let sum = 0n;
  for (const weight of weights.values()) if (weight > 0n) sum += weight;
  if (total <= 0n || sum === 0n) return out;
  const rests: { id: string; rest: bigint }[] = [];
  let given = 0n;
  for (const [id, weight] of weights) {
    if (weight <= 0n) continue;
    const exact = total * weight;
    const part = exact / sum;
    out.set(id, part);
    given += part;
    rests.push({ id, rest: exact % sum });
  }
  // Порядок остатков постоянный: при равных остатках — по идентификатору.
  rests.sort((a, b) => (a.rest === b.rest ? (a.id < b.id ? -1 : 1) : a.rest > b.rest ? -1 : 1));
  for (let index = 0; given < total; index += 1, given += 1n) {
    const id = rests[index % rests.length]!.id;
    out.set(id, out.get(id)! + 1n);
  }
  return out;
}

/**
 * Разложить расходы видов на работы по поступлениям месяца с переносом
 * расхода месяца без поступлений на следующий месяц с поступлениями.
 */
export function allocateTypeExpenses(receipts: readonly Receipt[], expenses: readonly TypedExpense[]): Allocation {
  const byProject = new Map<string, bigint>();
  const pending = new Map<string, bigint>();
  const types = new Set([...receipts.map((row) => row.typeId), ...expenses.map((row) => row.typeId)]);

  for (const typeId of types) {
    const spend = new Map<string, bigint>();
    for (const row of expenses) {
      if (row.typeId === typeId && row.amount > 0n) spend.set(row.month, (spend.get(row.month) ?? 0n) + row.amount);
    }
    const income = new Map<string, Map<string, bigint>>();
    for (const row of receipts) {
      if (row.typeId !== typeId || row.amount <= 0n) continue;
      const month = income.get(row.month) ?? new Map<string, bigint>();
      month.set(row.projectId, (month.get(row.projectId) ?? 0n) + row.amount);
      income.set(row.month, month);
    }
    let carry = 0n;
    for (const month of [...new Set([...spend.keys(), ...income.keys()])].sort()) {
      const pool = carry + (spend.get(month) ?? 0n);
      const weights = income.get(month);
      if (weights === undefined || pool === 0n) {
        carry = pool;
        continue;
      }
      for (const [projectId, part] of splitByWeight(pool, weights)) {
        byProject.set(projectId, (byProject.get(projectId) ?? 0n) + part);
      }
      carry = 0n;
    }
    if (carry > 0n) pending.set(typeId, carry);
  }
  return { byProject, pending };
}

/**
 * Доля в процентах с одним знаком; `null`, когда делить не на что —
 * экран пишет «—», а не ноль (Р-257).
 */
export function shareOf(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 1000n) / whole) / 10;
}

export interface EconomyInput {
  readonly received: bigint;
  readonly awaiting: bigint;
  /** Маржа работы — `marginOf` (Р-434); здесь не пересчитывается. */
  readonly margin: bigint;
  readonly typeExpenses: bigint;
}

export interface Economy {
  /** Выручка работы: полученное и ожидаемое — база маржи (Р-434). */
  readonly revenue: bigint;
  readonly marginShare: number | null;
  readonly net: bigint;
  readonly netShare: number | null;
}

/** Маржа после расходов вида и доли обеих маржей в выручке работы. */
export function economyOf(input: EconomyInput): Economy {
  const revenue = input.received + input.awaiting;
  const net = input.margin - input.typeExpenses;
  return { revenue, marginShare: shareOf(input.margin, revenue), net, netShare: shareOf(net, revenue) };
}

/** Доля для экрана: «35,2 %»; `null` — «—» (Р-257). */
export function formatShare(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}
