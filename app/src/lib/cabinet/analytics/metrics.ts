/**
 * Расчёты аналитики практики.
 *
 * Модуль намеренно не знает ни о базе, ни о правах: на входе массив строк,
 * на выходе числа. Так его проверяют построчно, а выборка из базы —
 * единственное место, где действуют права, — остаётся в `data.ts`.
 *
 * Расчёты перенесены из панели `nauchny-konsalting-panel` (`src/core/model.js`)
 * с двумя отличиями. Первое: деньги здесь целые копейки, а не числа с
 * плавающей точкой. Второе: прогнозная часть панели (бутстрап, пуассоновские
 * розыгрыши, планировщик слотов) не переносится — она строилась на допущениях,
 * которых данные системы не подтверждают, и место ей в отдельной работе,
 * а не в витрине фактов.
 *
 * Из соседних модулей берутся только чистые правила: «ждёт ли практика
 * денег по работе» (`money.ts`) и «сегодня по Москве» (`clock.ts`). Свои
 * копии этих правил здесь уже расходились с главной и экраном денег
 * (решение Р-257).
 */

import { isPastDue, moscowToday } from '../clock.ts';
import { expectsPayment } from '../money.ts';

/** Строка витрины: один проект со сведёнными деньгами. */
export interface ProjectRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  readonly startedOn: Date | null;
  readonly dueOn: Date | null;
  readonly closedOn: Date | null;
  /**
   * День подписания договора; `null` — договора нет или дата не указана.
   * По нему работа относится к периоду в «законтрактовано за период»
   * (решение Р-257).
   */
  readonly signedOn: Date | null;
  /** Сумма договора в копейках. */
  readonly cost: bigint;
  /** Поступило по траншам со статусом «оплачен», в копейках. */
  readonly paid: bigint;
  /**
   * Списано по траншам со статусом «списан», в копейках. Списанное — не
   * долг: прежде аналитика и отчёт считали его к получению и просроченным,
   * а экран финансов — нет (решение Р-236).
   */
  readonly writtenOff: bigint;
  /**
   * Поступления с датой: дата оплаты, а без неё — дата договора или начала
   * работы, как в итогах по годам. По ним считается «получено за период».
   */
  readonly payments: readonly { readonly amount: bigint; readonly on: Date | null }[];
}

/**
 * Незакрытый остаток работы: договор без оплаченного и списанного, не
 * меньше нуля. У отменённой работы остатка к получению нет — её
 * неоплаченное считается потерей (вкладка «Потери»), и в задолженность,
 * к получению и остаток с прошедшим сроком оно не входит (решение Р-257).
 */
/**
 * Собираемость процентом. Округление до целых превращало 99,84 % в
 * «100 %» при неоплаченном остатке закрытой работы; пока собрано не всё,
 * процент не округляется до ста — берётся знак после запятой вниз
 * (решение Р-257).
 */
export function collectionPercent(ratio: number): string {
  const whole = Math.round(ratio * 100);
  if (ratio < 1 && whole >= 100) {
    return `${(Math.floor(ratio * 1000) / 10).toFixed(1).replace('.', ',')} %`;
  }
  return `${whole} %`;
}

export function openBalance(row: ProjectRow): bigint {
  if (!expectsPayment(row.status)) return 0n;
  const left = row.cost - row.paid - row.writtenOff;
  return left > 0n ? left : 0n;
}

/**
 * Работы, у которых прошёл срок, а они не закрыты: действующие и
 * приостановленные со сроком раньше сегодняшнего дня по Москве.
 *
 * Прежде отчёт, итог и вкладка «Сроки» считали это каждый по-своему:
 * одни — только идущие работы, другие — и приостановленные, и сравнивали
 * срок с текущим моментом, а не с началом дня (решение Р-257).
 */
export function lateOpen(rows: readonly ProjectRow[], controlDate: Date): ProjectRow[] {
  return rows.filter(
    (row) => (row.status === 'ACTIVE' || row.status === 'PAUSED') && isPastDue(row.dueOn, controlDate),
  );
}

/** Действующие работы — идущие и приостановленные, как вкладка перечня. */
export function isOngoing(row: ProjectRow): boolean {
  return row.status === 'ACTIVE' || row.status === 'PAUSED';
}

/**
 * Законтрактовано за период: договоры, подписанные в периоде, а без даты
 * подписания — по дню начала работы.
 *
 * Прежде отчёт брал сумму договоров работ, начатых или закрытых в
 * периоде: договор двухлетней давности, закрытый вчера, давал всю сумму
 * «законтрактовано за тридцать дней», и средний чек периода считался по
 * нему же (решение Р-257).
 */
export function contractedBetween(
  rows: readonly ProjectRow[],
  from: Date,
  to: Date,
): { readonly total: bigint; readonly count: number; readonly averageCheck: bigint | null } {
  const inside = rows.filter((row) => {
    const on = row.signedOn ?? row.startedOn;
    return row.cost > 0n && on !== null && on >= from && on <= to;
  });
  const total = sum(inside.map((row) => row.cost));
  return {
    total,
    count: inside.length,
    averageCheck: inside.length === 0 ? null : total / BigInt(inside.length),
  };
}

/**
 * Поступило за период — по дате поступления, а не по датам работы.
 * Прежде отчёт брал оплату работ, начатых или закрытых в периоде: работа,
 * оплаченная два года назад и закрытая вчера, давала всю сумму «за
 * тридцать дней», а оплата вчера по работе, начатой зимой, не попадала
 * никуда (решение Р-236).
 */
export function receivedBetween(rows: readonly ProjectRow[], from: Date, to: Date): bigint {
  let total = 0n;
  for (const row of rows) {
    for (const payment of row.payments) {
      if (payment.on !== null && payment.on >= from && payment.on <= to) total += payment.amount;
    }
  }
  return total;
}

const DAY = 86_400_000;

export const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
] as const;

// ─────────────────────────── Статистика ─────────────────────────────────────

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Выборочное стандартное отклонение: делитель n−1, а не n. */
export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sum = values.reduce((acc, value) => acc + (value - m) ** 2, 0);
  return Math.sqrt(sum / (values.length - 1));
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base]! : sorted[base]! + rest * (next - sorted[base]!);
}

const sum = (values: readonly bigint[]): bigint => values.reduce((acc, value) => acc + value, 0n);

// ─────────────────────────── Каплан — Мейер ─────────────────────────────────

export interface Duration {
  /** Наблюдаемая длительность в днях. */
  readonly days: number;
  /** Работа завершилась (событие) либо наблюдение оборвано (цензурирование). */
  readonly closed: boolean;
}

export interface CycleEstimate {
  /** Медиана срока в днях; `null`, если кривая не опустилась до половины. */
  readonly median: number | null;
  /** Нижняя оценка, когда медиана не достигнута: наибольший наблюдённый срок. */
  readonly lower: number | null;
  readonly observations: number;
  readonly events: number;
}

/**
 * Медиана срока по Каплану — Мейеру.
 *
 * Простое среднее по закрытым работам занижало бы срок: длинные проекты
 * ещё идут и в среднее не попадают. Оценка учитывает и незавершённые
 * наблюдения — они цензурируют кривую, а не выбрасываются.
 */
export function cycleMedian(items: readonly Duration[]): CycleEstimate {
  const valid = items.filter((item) => Number.isFinite(item.days) && item.days >= 0);
  if (valid.length === 0) return { median: null, lower: null, observations: 0, events: 0 };

  const byTime = new Map<number, { events: number; censored: number }>();
  for (const item of valid) {
    const cell = byTime.get(item.days) ?? { events: 0, censored: 0 };
    if (item.closed) cell.events += 1;
    else cell.censored += 1;
    byTime.set(item.days, cell);
  }

  const times = [...byTime.keys()].sort((a, b) => a - b);
  let atRisk = valid.length;
  let survival = 1;
  let medianDays: number | null = null;
  let events = 0;

  for (const time of times) {
    const cell = byTime.get(time)!;
    if (cell.events > 0) {
      survival *= 1 - cell.events / atRisk;
      events += cell.events;
      if (medianDays === null && survival <= 0.5) medianDays = time;
    }
    atRisk -= cell.events + cell.censored;
  }

  const longest = Math.max(...valid.map((item) => item.days));
  return {
    median: medianDays,
    lower: medianDays === null ? longest : null,
    observations: valid.length,
    events,
  };
}

/**
 * Длительность работы: от даты заказа до закрытия либо до контрольной даты.
 *
 * Событие «завершено» — только завершённая работа. Отменённая наблюдалась
 * до дня отмены и обрывает наблюдение, то есть цензурирует кривую: прежде
 * она шла событием, и работа, брошенная через неделю, делала медиану
 * срока короче, будто работу сделали за неделю (решение Р-257).
 */
export function durationOf(row: ProjectRow, controlDate: Date): Duration | null {
  if (row.startedOn === null) return null;
  const closed = row.status === 'COMPLETED';
  const stopped = closed || row.status === 'CANCELLED';
  const end = stopped ? (row.closedOn ?? controlDate) : controlDate;
  return {
    days: Math.max(0, Math.round((end.getTime() - row.startedOn.getTime()) / DAY)),
    closed,
  };
}

// ─────────────────────────── Обзор ──────────────────────────────────────────

export interface Overview {
  readonly projects: number;
  readonly clients: number;
  readonly active: number;
  readonly paused: number;
  /** Действующих: идущие и приостановленные (решение Р-257). */
  readonly ongoing: number;
  readonly completed: number;
  readonly contracted: bigint;
  readonly received: bigint;
  /**
   * Задолженность: остаток по каждой работе, кроме отменённых,
   * отрицательных не бывает.
   */
  readonly outstanding: bigint;
  /**
   * Доля собранного по завершённым работам; `null` — завершённых работ с
   * договором нет, и «0 %» читалось бы как «ничего не собрано» (Р-257).
   */
  readonly collection: number | null;
  /** Средний чек по работам с договором; `null` — договоров нет (Р-257). */
  readonly averageCheck: bigint | null;
  readonly period: { readonly from: Date | null; readonly to: Date | null };
}

export function overview(rows: readonly ProjectRow[]): Overview {
  const dates = rows
    .map((row) => row.startedOn)
    .filter((date): date is Date => date !== null)
    .map((date) => date.getTime());

  const completed = rows.filter((row) => row.status === 'COMPLETED');
  const contractedClosed = sum(completed.map((row) => row.cost));
  // Собранное по работе ограничено её договором: переплата одной
  // работы не закрывает недобор другой, иначе книга с переплатой и
  // неоплаченной закрытой работой давала «собрано 100 %» (решение Р-257).
  const receivedClosed = sum(completed.map((row) => (row.paid < row.cost ? row.paid : row.cost)));

  const contracted = sum(rows.map((row) => row.cost));
  return {
    projects: rows.length,
    clients: new Set(rows.map((row) => row.clientId)).size,
    active: rows.filter((row) => row.status === 'ACTIVE').length,
    paused: rows.filter((row) => row.status === 'PAUSED').length,
    ongoing: rows.filter(isOngoing).length,
    completed: completed.length,
    contracted,
    received: sum(rows.map((row) => row.paid)),
    // Остаток считается по каждой работе отдельно и снизу ограничен нулём:
    // переплата по одному договору не погашает долг по другому.
    outstanding: sum(rows.map(openBalance)),
    collection: contractedClosed > 0n ? Number(receivedClosed) / Number(contractedClosed) : null,
    // Чек — по работам с договором: работа без суммы договора (его ещё не
    // завели) тянула средний к нулю (решение Р-244). Без договоров чека
    // нет вовсе, а не «0 ₽» (решение Р-257).
    averageCheck: (() => {
      const priced = rows.filter((row) => row.cost > 0n);
      return priced.length === 0 ? null : sum(priced.map((row) => row.cost)) / BigInt(priced.length);
    })(),
    period: {
      from: dates.length === 0 ? null : new Date(Math.min(...dates)),
      to: dates.length === 0 ? null : new Date(Math.max(...dates)),
    },
  };
}

// ─────────────────────────── Деньги ─────────────────────────────────────────

export interface MonthPoint {
  readonly key: string;
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly orders: number;
  readonly contracted: bigint;
  readonly received: bigint;
}

/**
 * Помесячный ряд без пропусков: месяц без заказов — это ноль, а не разрыв.
 *
 * Всё в ряду отнесено к месяцу НАЧАЛА работы: число заказов, сумма
 * договоров и оплаты по этим работам. Оплата здесь — не поступление
 * месяца: деньги за работу, начатую в марте, стоят в марте, когда бы ни
 * пришли. Подписи экранов говорят это прямо (решение Р-257).
 *
 * Ряд доходит до текущего месяца, а не до месяца последнего начала:
 * прежде «последние двенадцать месяцев» при затишье кончались полгода
 * назад, и пустые месяцы выпадали из окна вместо того, чтобы стоять
 * нулями (решение Р-257).
 */
export function byMonth(rows: readonly ProjectRow[], controlDate: Date): MonthPoint[] {
  const dated = rows.filter((row) => row.startedOn !== null);
  if (dated.length === 0) return [];

  const times = dated.map((row) => row.startedOn!.getTime());
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times, moscowToday(controlDate).getTime()));

  const points: MonthPoint[] = [];
  for (
    let year = first.getUTCFullYear(), month = first.getUTCMonth();
    year < last.getUTCFullYear() || (year === last.getUTCFullYear() && month <= last.getUTCMonth());
    month === 11 ? ((year += 1), (month = 0)) : (month += 1)
  ) {
    const inMonth = dated.filter(
      (row) => row.startedOn!.getUTCFullYear() === year && row.startedOn!.getUTCMonth() === month,
    );
    points.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTHS_SHORT[month]} ${String(year).slice(2)}`,
      year,
      month: month + 1,
      orders: inMonth.length,
      contracted: sum(inMonth.map((row) => row.cost)),
      received: sum(inMonth.map((row) => row.paid)),
    });
  }
  return points;
}

export interface SeasonalNorm {
  readonly month: number;
  readonly label: string;
  /** Среднее число заказов месяца по наблюдаемым годам. */
  readonly norm: number;
  readonly orders: number;
  readonly yearsObserved: number;
}

/**
 * Сезонная норма: сколько заказов приходится на месяц в среднем за год.
 *
 * Делить общее число заказов месяца на число календарных лет нельзя:
 * история начинается и заканчивается в середине года, и у крайних месяцев
 * наблюдений меньше. Знаменатель считается по фактически наблюдавшимся
 * месяцам, иначе январь первого неполного года занижал бы норму.
 */
export function seasonalNorm(rows: readonly ProjectRow[], controlDate: Date): SeasonalNorm[] {
  const dated = rows.filter((row) => row.startedOn !== null);
  if (dated.length === 0) return [];

  const times = dated.map((row) => row.startedOn!.getTime());
  const first = new Date(Math.min(...times));
  const startKey = first.getUTCFullYear() * 12 + first.getUTCMonth();
  const endKey = controlDate.getUTCFullYear() * 12 + controlDate.getUTCMonth();

  return MONTHS_SHORT.map((label, index) => {
    const orders = dated.filter((row) => row.startedOn!.getUTCMonth() === index).length;
    let observed = 0;
    for (let year = first.getUTCFullYear(); year <= controlDate.getUTCFullYear(); year += 1) {
      const key = year * 12 + index;
      if (key >= startKey && key <= endKey) observed += 1;
    }
    const yearsObserved = observed === 0 ? 1 : observed;
    return { month: index + 1, label, orders, yearsObserved, norm: orders / yearsObserved };
  });
}

export interface Receivable {
  readonly code: string;
  readonly client: string;
  readonly title: string;
  readonly status: ProjectRow['status'];
  readonly cost: bigint;
  readonly paid: bigint;
  readonly debt: bigint;
  readonly dueOn: Date | null;
  /** Дней с даты срока; отрицательное — срок ещё не наступил. */
  readonly overdueDays: number | null;
}

/**
 * Дебиторка: незакрытые остатки, крупные сверху. Отменённых работ здесь
 * нет — их остаток в потерях (решение Р-257).
 */
export function receivables(rows: readonly ProjectRow[], controlDate: Date): Receivable[] {
  const day = moscowToday(controlDate).getTime();
  return rows
    .filter((row) => openBalance(row) > 0n)
    .map((row) => ({
      code: row.code,
      client: row.clientName,
      title: row.title,
      status: row.status,
      cost: row.cost,
      paid: row.paid,
      debt: openBalance(row),
      dueOn: row.dueOn,
      // Дни от срока до начала сегодняшнего дня по Москве, как у
      // `daysPast`: округление делало работу просроченной уже в день срока
      // с полудня (Р-236), а счёт от момента — только с трёх часов ночи
      // следующего дня (решение Р-257).
      overdueDays: row.dueOn === null ? null : Math.floor((day - row.dueOn.getTime()) / DAY),
    }))
    .sort((a, b) => (b.debt > a.debt ? 1 : b.debt < a.debt ? -1 : a.code.localeCompare(b.code)));
}

// ─────────────────────────── Клиенты ────────────────────────────────────────

export interface ClientRow {
  readonly clientId: string;
  readonly name: string;
  readonly orders: number;
  readonly ltv: bigint;
  readonly paid: bigint;
  readonly firstOrder: Date | null;
  readonly lastOrder: Date | null;
  readonly recencyDays: number | null;
  readonly segment: ClientSegment;
}

export type ClientSegment = 'CORE' | 'ACTIVE' | 'DORMANT_VALUABLE' | 'DORMANT_ONCE';

export const SEGMENT_LABEL: Record<ClientSegment, string> = {
  CORE: 'Ядро',
  ACTIVE: 'Активные',
  DORMANT_VALUABLE: 'Спящие ценные',
  DORMANT_ONCE: 'Спящие разовые',
};

export interface ClientsReport {
  readonly clients: readonly ClientRow[];
  readonly repeat: number;
  readonly repeatShare: number;
  /** `null` — ни у одного клиента нет договора: медиана «0 ₽» лгала бы (Р-257). */
  readonly medianLtv: bigint | null;
  /** Доля пяти крупнейших клиентов в сумме договоров; `null` — договоров нет. */
  readonly top5Share: number | null;
  readonly segments: Readonly<Record<ClientSegment, number>>;
}

/** Граница «спящего» клиента: полгода без заказов. */
const DORMANT_AFTER_DAYS = 180;

export function clients(rows: readonly ProjectRow[], controlDate: Date): ClientsReport {
  const byClient = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    const list = byClient.get(row.clientId) ?? [];
    list.push(row);
    byClient.set(row.clientId, list);
  }

  const ltvs = [...byClient.values()].map((list) => Number(sum(list.map((row) => row.cost))));
  const priced = ltvs.some((ltv) => ltv > 0);
  const medianLtv = priced ? BigInt(Math.round(median(ltvs))) : null;

  const list: ClientRow[] = [...byClient.entries()].map(([clientId, projects]) => {
    const dates = projects
      .map((row) => row.startedOn)
      .filter((date): date is Date => date !== null)
      .map((date) => date.getTime());
    const lastOrder = dates.length === 0 ? null : new Date(Math.max(...dates));
    const recencyDays =
      lastOrder === null
        ? null
        : Math.round((controlDate.getTime() - lastOrder.getTime()) / DAY);
    const ltv = sum(projects.map((row) => row.cost));
    const recent = recencyDays !== null && recencyDays <= DORMANT_AFTER_DAYS;
    const segment: ClientSegment = recent
      ? projects.length >= 2
        ? 'CORE'
        : 'ACTIVE'
      : ltv >= (medianLtv ?? 0n)
        ? 'DORMANT_VALUABLE'
        : 'DORMANT_ONCE';

    return {
      clientId,
      name: projects[0]!.clientName,
      orders: projects.length,
      ltv,
      paid: sum(projects.map((row) => row.paid)),
      firstOrder: dates.length === 0 ? null : new Date(Math.min(...dates)),
      lastOrder,
      recencyDays,
      segment,
    };
  });

  // Последним ключом идёт код клиента: при равных суммах порядок строк
  // иначе задаёт база, и два прогона подряд дают разный перечень
  // (решение Р-186).
  list.sort((a, b) =>
    b.ltv > a.ltv ? 1 : b.ltv < a.ltv ? -1 : a.clientId.localeCompare(b.clientId),
  );

  const total = sum(list.map((client) => client.ltv));
  const top5 = sum(list.slice(0, 5).map((client) => client.ltv));
  const repeat = list.filter((client) => client.orders >= 2).length;

  const segments: Record<ClientSegment, number> = {
    CORE: 0,
    ACTIVE: 0,
    DORMANT_VALUABLE: 0,
    DORMANT_ONCE: 0,
  };
  for (const client of list) segments[client.segment] += 1;

  return {
    clients: list,
    repeat,
    repeatShare: list.length === 0 ? 0 : repeat / list.length,
    medianLtv,
    top5Share: total > 0n ? Number(top5) / Number(total) : null,
    segments,
  };
}

// ─────────────────────────── Продукты ───────────────────────────────────────

export interface ProductRow {
  readonly typeCode: string;
  readonly typeName: string;
  readonly orders: number;
  readonly total: bigint;
  /**
   * Статистика цены — по работам с договором; `null` — договоров по
   * позиции нет, и «0 ₽» читалось бы как цена (решение Р-257).
   */
  readonly averageCheck: bigint | null;
  readonly medianCheck: bigint | null;
  readonly min: bigint | null;
  readonly max: bigint | null;
  /** Коэффициент вариации чека: разброс относительно среднего; `null` — без договоров. */
  readonly variation: number | null;
  /** Разброс выше 40% — цена назначается «на глаз», нужен прайс. */
  readonly needsPriceList: boolean;
}

export function products(rows: readonly ProjectRow[]): ProductRow[] {
  const byType = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    const list = byType.get(row.typeCode) ?? [];
    list.push(row);
    byType.set(row.typeCode, list);
  }

  return [...byType.entries()]
    .map(([typeCode, list]) => {
      // Статистика цены — по работам с договором (решение Р-244); число
      // заказов и сумма — по всем.
      const priced = list.filter((row) => row.cost > 0n).map((row) => Number(row.cost));
      const base = {
        typeCode,
        typeName: list[0]!.typeName,
        orders: list.length,
        total: sum(list.map((row) => row.cost)),
      };
      if (priced.length === 0) {
        return {
          ...base,
          averageCheck: null,
          medianCheck: null,
          min: null,
          max: null,
          variation: null,
          needsPriceList: false,
        };
      }
      const average = mean(priced);
      const variation = average === 0 ? 0 : stdev(priced) / average;
      return {
        ...base,
        averageCheck: BigInt(Math.round(average)),
        medianCheck: BigInt(Math.round(median(priced))),
        min: BigInt(Math.min(...priced)),
        max: BigInt(Math.max(...priced)),
        variation,
        needsPriceList: variation > 0.4,
      };
    })
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : a.typeCode.localeCompare(b.typeCode)));
}

// ─────────────────────────── Сроки ──────────────────────────────────────────

export interface CycleRow {
  readonly typeCode: string;
  readonly typeName: string;
  readonly estimate: CycleEstimate;
}

export interface CyclesReport {
  readonly overall: CycleEstimate;
  readonly byType: readonly CycleRow[];
  /** Завершённые в срок, из числа тех, у кого срок был задан. */
  readonly onTime: number;
  readonly withDue: number;
  /** Незакрытых работ с прошедшим сроком — `lateOpen` (решение Р-257). */
  readonly overdueOpen: number;
  /** Отменённых работ с датой начала: они цензурируют кривую, а не завершают её. */
  readonly cancelled: number;
}

export function cycles(rows: readonly ProjectRow[], controlDate: Date): CyclesReport {
  const durations = rows
    .map((row) => durationOf(row, controlDate))
    .filter((duration): duration is Duration => duration !== null);

  const byType = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    const list = byType.get(row.typeCode) ?? [];
    list.push(row);
    byType.set(row.typeCode, list);
  }

  const closedWithDue = rows.filter(
    (row) => row.status === 'COMPLETED' && row.dueOn !== null && row.closedOn !== null,
  );

  return {
    overall: cycleMedian(durations),
    byType: [...byType.entries()]
      .map(([typeCode, list]) => ({
        typeCode,
        typeName: list[0]!.typeName,
        estimate: cycleMedian(
          list
            .map((row) => durationOf(row, controlDate))
            .filter((duration): duration is Duration => duration !== null),
        ),
      }))
      .sort((a, b) => b.estimate.observations - a.estimate.observations),
    onTime: closedWithDue.filter((row) => row.closedOn!.getTime() <= row.dueOn!.getTime()).length,
    withDue: closedWithDue.length,
    overdueOpen: lateOpen(rows, controlDate).length,
    cancelled: rows.filter((row) => row.status === 'CANCELLED' && row.startedOn !== null).length,
  };
}

// ─────────────────────────── Потери ─────────────────────────────────────────

export interface LossRow {
  readonly code: string;
  readonly client: string;
  readonly title: string;
  readonly cost: bigint;
  readonly paid: bigint;
  readonly lost: bigint;
}

export interface LossesReport {
  readonly rows: readonly LossRow[];
  readonly total: bigint;
  readonly stopped: number;
  readonly cancelled: number;
}

/**
 * Потери на остановленных работах: недополученное по договору.
 *
 * Величина считается только по данным системы. Прежде рядом стояла
 * цифра из брифа, не выводимая из данных; экран руководителя показывает
 * лишь то, что следует из его учёта (решение Р-257, заменяет Р-134).
 */
export function losses(rows: readonly ProjectRow[]): LossesReport {
  const stopped = rows.filter(
    (row) => (row.status === 'PAUSED' || row.status === 'CANCELLED') && row.cost > row.paid,
  );
  return {
    rows: stopped
      .map((row) => ({
        code: row.code,
        client: row.clientName,
        title: row.title,
        cost: row.cost,
        paid: row.paid,
        lost: row.cost - row.paid,
      }))
      .sort((a, b) => (b.lost > a.lost ? 1 : b.lost < a.lost ? -1 : a.code.localeCompare(b.code))),
    total: sum(stopped.map((row) => row.cost - row.paid)),
    stopped: rows.filter((row) => row.status === 'PAUSED').length,
    cancelled: rows.filter((row) => row.status === 'CANCELLED').length,
  };
}

// ─────────────────────────── Выводы ─────────────────────────────────────────

/** Насколько вывод надёжен: от подтверждённого числами до рискованного. */
export type Confidence = 'sure' | 'likely' | 'risky';

export interface Conclusion {
  /** Область, к которой относится вывод: деньги, клиенты, продукт, сроки. */
  readonly area: string;
  readonly title: string;
  /** Что показывают числа. */
  readonly text: string;
  /** Что с этим делать. Без этой строки вывод остаётся наблюдением. */
  readonly action: string;
  readonly confidence: Confidence;
  /** Когда этим заниматься. */
  readonly term: string;
  /** Оценка эффекта в копейках; `null` — величина не считается честно. */
  readonly effect: bigint | null;
}

/**
 * Выводы обзора с рекомендациями.
 *
 * Прежде выводы были наблюдениями: «пять клиентов дают 68 % суммы
 * договоров» — и человек сам решал, что с этим делать. Требование
 * заказчика: вывод обязан говорить, что работает лучше и когда, то есть
 * нести действие, срок и оценку эффекта (решение Р-194).
 *
 * Оценка эффекта считается только там, где её можно вывести из своих же
 * чисел: взыскиваемый остаток — это сумма долга, выравнивание цены к
 * собственной медиане — разница медианы и среднего на числе заказов.
 * Где честной величины нет, стоит `null`, а не выдуманный процент роста.
 */
export function conclusions(rows: readonly ProjectRow[], controlDate: Date): Conclusion[] {
  const out: Conclusion[] = [];
  if (rows.length === 0) return out;

  const money = overview(rows);
  const clientReport = clients(rows, controlDate);
  const productRows = products(rows);
  const season = seasonalNorm(rows, controlDate);
  const debts = receivables(rows, controlDate);

  // 1. Остаток по работам с прошедшим сроком — деньги, которые уже
  //    заработаны. Отменённых здесь нет: их остаток — потеря (Р-257).
  const overdueDebts = debts.filter((debt) => (debt.overdueDays ?? 0) > 0);
  const overdueSum = sum(overdueDebts.map((debt) => debt.debt));
  if (overdueDebts.length > 0) {
    out.push({
      area: 'Деньги',
      title: 'Взыскать остаток по работам с прошедшим сроком',
      text:
        `По ${overdueDebts.length} ${plural(overdueDebts.length, 'работе', 'работам', 'работам')} ` +
        `срок прошёл, а остаток не получен: ${moneyWords(overdueSum)}.` +
        (money.collection === null
          ? ''
          : ` Собрано по завершённым работам ${collectionPercent(money.collection)}.`),
      action:
        'Пройти по каждой работе и назвать дату платежа; где платить не будут — списать, ' +
        'чтобы эти деньги перестали считаться выручкой будущего.',
      confidence: 'sure',
      term: 'две недели',
      effect: overdueSum,
    });
  }

  // 2. Сорванные сроки действующих работ — идущих и приостановленных,
  //    срок раньше сегодняшнего дня по Москве (решение Р-257).
  const late = lateOpen(rows, controlDate);
  if (late.length > 0) {
    out.push({
      area: 'Сроки',
      title: 'Разобрать сорванные сроки',
      text:
        `${late.length} ${plural(late.length, 'действующая работа', 'действующие работы', 'действующих работ')} ` +
        'стоит со сроком в прошлом. Срок в прошлом не двигает работу и портит разговор с клиентом.',
      action:
        'По каждой назначить новый срок и сказать об этом клиенту — либо закрыть работу, ' +
        'если она фактически завершена.',
      confidence: 'sure',
      term: 'неделя',
      effect: null,
    });
  }

  // 3. Что работает лучше и когда: тип с наибольшим средним чеком и месяцы
  //    пика сезона. Это и есть прямой ответ на вопрос заказчика.
  const workhorse = productRows
    .filter(
      (product): product is ProductRow & { averageCheck: bigint } =>
        product.orders >= 3 && product.averageCheck !== null,
    )
    .sort((a, b) => (b.averageCheck > a.averageCheck ? 1 : b.averageCheck < a.averageCheck ? -1 : 0))[0];
  const peak = [...season].sort((a, b) => b.norm - a.norm).slice(0, 3);
  if (workhorse !== undefined && peak.length === 3 && peak[0]!.norm > 0) {
    out.push({
      area: 'Продукт',
      title: `Лучше всего работает «${workhorse.typeName}»`,
      text:
        `Средний чек ${moneyWords(workhorse.averageCheck)} при ${workhorse.orders} ` +
        `${plural(workhorse.orders, 'заказе', 'заказах', 'заказах')} — выше остальных позиций. ` +
        `Заказы приходят плотнее всего в ${peak.map((month) => month.label).join(', ')}: ` +
        `${peak.map((month) => month.norm.toFixed(1).replace('.', ',')).join(', ')} заказа в месяц.`,
      action:
        `Готовить предложение по этой позиции к ${peak[0]!.label} и держать под неё свободного ` +
        'куратора: спрос приходит в те же месяцы, что и в прошлые годы.',
      confidence: 'likely',
      term: 'к началу сезона',
      effect: null,
    });
  }

  // 4. Повторные клиенты: проверенный спрос, который просто не спросили.
  const sleeping = clientReport.clients.filter(
    (client) =>
      client.orders >= 2 &&
      client.lastOrder !== null &&
      controlDate.getTime() - client.lastOrder.getTime() > 180 * DAY,
  );
  if (sleeping.length > 0 && money.averageCheck !== null && money.averageCheck > 0n) {
    out.push({
      area: 'Клиенты',
      title: 'Вернуться к повторным клиентам',
      text:
        `${sleeping.length} ${plural(sleeping.length, 'клиент', 'клиента', 'клиентов')} ` +
        `${plural(sleeping.length, 'заказывал', 'заказывали', 'заказывали')} не по одному разу и ` +
        `${plural(sleeping.length, 'не появлялся', 'не появлялись', 'не появлялись')} дольше ` +
        'полугода. Повторных клиентов всего ' +
        `${clientReport.repeat} — ${Math.round(clientReport.repeatShare * 100)} %.`,
      action:
        'Написать каждому лично под его тему: у этих людей спрос уже проверен, и новая работа ' +
        'стоит практике дешевле первой.',
      confidence: 'likely',
      term: 'месяц',
      effect: money.averageCheck * BigInt(sleeping.length),
    });
  }

  // 5. Цена назначается по случаю: выравнивание к собственной медиане.
  const scattered = productRows.filter((product) => product.needsPriceList && product.orders >= 3);
  if (scattered.length > 0) {
    const uplift = sum(
      scattered.map((product) =>
        product.medianCheck !== null &&
        product.averageCheck !== null &&
        product.medianCheck > product.averageCheck
          ? (product.medianCheck - product.averageCheck) * BigInt(product.orders)
          : 0n,
      ),
    );
    out.push({
      area: 'Продукт',
      title: 'Вывести прайс там, где цена гуляет',
      text:
        `Разброс чека выше 40 % у позиций: ${scattered
          .map((product) => `${product.typeName} (${Math.round((product.variation ?? 0) * 100)} %)`)
          .join(', ')}. Одна и та же работа продаётся по разной цене без видимой причины.`,
      action:
        'Назначить по этим позициям базовую цену — собственную медиану — и отклоняться от неё ' +
        'только письменно, с причиной.',
      confidence: 'risky',
      term: 'месяц',
      effect: uplift > 0n ? uplift : null,
    });
  }

  // 6. Зависимость от нескольких клиентов.
  if (
    clientReport.clients.length >= 5 &&
    clientReport.top5Share !== null &&
    clientReport.top5Share > 0.5
  ) {
    out.push({
      area: 'Клиенты',
      title: 'Зависимость от пяти клиентов',
      text:
        `Пять крупнейших дают ${Math.round(clientReport.top5Share * 100)} % суммы договоров ` +
        `при ${clientReport.clients.length} клиентах всего. Уход одного заметно бьёт по году.`,
      action:
        'Считать поток новых клиентов отдельной величиной и планировать его наравне с выручкой.',
      confidence: 'risky',
      term: 'квартал',
      effect: null,
    });
  }

  // Порядок: сначала то, у чего есть считаемый эффект, крупное сверху.
  return out
    .sort((a, b) => {
      if (a.effect === null && b.effect === null) return 0;
      if (a.effect === null) return 1;
      if (b.effect === null) return -1;
      return b.effect > a.effect ? 1 : b.effect < a.effect ? -1 : 0;
    })
    .slice(0, 5);
}

/** Сумма словами для текста вывода: целые рубли, без копеек. */
function moneyWords(amount: bigint): string {
  return `${Math.round(Number(amount) / 100).toLocaleString('ru-RU')} ₽`;
}

/** Русское склонение по числу. Своё: модуль расчётов не знает разметки. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}


/**
 * Итог практики одной связной фразой.
 *
 * Заказчик просил, чтобы аналитика подавалась ёмко и концентрированно:
 * открыл — и понял, как дела, не читая плиток и не обходя шесть вкладок.
 * Отдельного экрана под это не заводится — четвёртая копия одних и тех же
 * чисел не добавила бы ничего; итог встаёт первой строкой обзора и отчёта
 * (решение Р-202).
 *
 * Ничего нового здесь не считается: величины берутся из `overview`,
 * `receivables` и `conclusions`. Новое только сведение их в речь.
 */
export interface Verdict {
  /** Как дела: работы и деньги. */
  readonly state: string;
  /** Главный риск: то, что стоит дороже всего, если не трогать. */
  readonly risk: string | null;
  /** Первое действие — старший вывод `conclusions`. */
  readonly first: string | null;
}

export function verdict(rows: readonly ProjectRow[], controlDate: Date): Verdict | null {
  if (rows.length === 0) return null;

  const money = overview(rows);
  const debts = receivables(rows, controlDate).filter((debt) => (debt.overdueDays ?? 0) > 0);
  const overdueSum = sum(debts.map((debt) => debt.debt));
  const late = lateOpen(rows, controlDate);
  const advice = conclusions(rows, controlDate);

  // «Действующих» — идущие и приостановленные, как на главной и во
  // вкладке перечня; «в работе» здесь прежде значило одни идущие, а на
  // соседнем экране — обе (решение Р-257).
  const state =
    `Действующих работ ${money.ongoing} из ${money.projects}` +
    (money.paused > 0 ? ` (из них приостановлено ${money.paused})` : '') +
    `; получено ${moneyWords(money.received)} ` +
    `из ${moneyWords(money.contracted)} законтрактованных, ` +
    `к получению остаток ${moneyWords(money.outstanding)}.`;

  const risks: string[] = [];
  if (debts.length > 0) {
    risks.push(
      `остаток ${moneyWords(overdueSum)} по ${debts.length} ` +
        `${plural(debts.length, 'работе', 'работам', 'работам')} с прошедшим сроком`,
    );
  }
  if (late.length > 0) {
    risks.push(
      `${late.length} ${plural(late.length, 'действующая работа стоит', 'действующие работы стоят', 'действующих работ стоят')} ` +
        'со сроком в прошлом',
    );
  }

  return {
    state,
    risk: risks.length === 0 ? null : `${risks.join('; ')}.`,
    first: advice[0] === undefined ? null : `${advice[0].title}: ${advice[0].action}`,
  };
}
