/**
 * Денежная арифметика кабинета.
 *
 * Суммы хранятся и считаются в копейках целыми числами. Тип с плавающей
 * точкой к деньгам не применяется: в нём 0.1 + 0.2 не равно 0.3, и
 * расхождение всплывает не на сложении, а на сверке с бухгалтерией, когда
 * искать причину уже негде.
 *
 * Модуль не знает ни о базе, ни о правах — только о значениях, поэтому
 * проверяется тестами без поднятой базы.
 */

export type TrancheStatus = 'PLANNED' | 'INVOICED' | 'PAID' | 'WRITTEN_OFF' | 'REVERSED';

export const STATUS_LABEL: Record<TrancheStatus, string> = {
  PLANNED: 'ожидается',
  INVOICED: 'выставлен счёт',
  PAID: 'оплачен',
  WRITTEN_OFF: 'списан',
  REVERSED: 'сторнирован',
};

/**
 * Допустимые смены статуса транша (решение Р-224).
 *
 * Прежде статус принимался любой, в том числе откат оплаченного в
 * «ожидается» со стиранием даты поступления, а выставить счёт или списать
 * долг было нечем: экран предлагал только «Отметить оплату». Оплаченный и
 * списанный транш — итог, из которого не уходят; оплаченный снимается
 * только сторно (решение Р-249), история поступлений не стирается.
 */
const TRANCHE_TRANSITIONS: Record<TrancheStatus, readonly TrancheStatus[]> = {
  PLANNED: ['INVOICED', 'PAID', 'WRITTEN_OFF'],
  INVOICED: ['PAID', 'WRITTEN_OFF', 'PLANNED'],
  // Оплаченный транш не возвращается ни в «ожидается», ни в «списан»:
  // ошибочную или возвращённую оплату снимает сторно — отдельный итог с
  // причиной в журнале, история поступления не стирается (решение Р-249).
  PAID: ['REVERSED'],
  WRITTEN_OFF: [],
  REVERSED: [],
};

export function isTrancheStatus(value: string): value is TrancheStatus {
  return Object.hasOwn(STATUS_LABEL, value);
}

export function nextTrancheStatuses(from: TrancheStatus): readonly TrancheStatus[] {
  return TRANCHE_TRANSITIONS[from];
}

export function canChangeTrancheStatus(from: TrancheStatus, to: TrancheStatus): boolean {
  return TRANCHE_TRANSITIONS[from].includes(to);
}

/**
 * Остаток долга по договору: сумма договора без полученного и без
 * списанного, не ниже нуля.
 *
 * Списанный транш — решение больше этих денег не ждать. Прежде главный
 * экран считал долг как «договор минус оплата», и списанное продолжало
 * числиться под угрозой, хотя экран финансов его уже не ждал (решение
 * Р-240).
 */
export function outstandingOf(
  total: bigint,
  tranches: readonly { readonly amount: bigint; readonly status: string }[],
): bigint {
  const closed = tranches
    .filter((tranche) => tranche.status === 'PAID' || tranche.status === 'WRITTEN_OFF')
    .reduce((sum, tranche) => sum + tranche.amount, 0n);
  return total > closed ? total - closed : 0n;
}

/**
 * Состояния работы, по которым практика денег больше не ждёт.
 *
 * Неоплаченный остаток отменённой работы — потеря, а не деньги к
 * получению: прежде он одновременно стоял в «Потерях» аналитики и в «К
 * получению» главной, экрана денег и отчёта, в «Задолженности» и в
 * просроченном, и одна сумма считалась дважды — и как долг, и как
 * убыток. Приостановленная работа сюда не входит: она может
 * возобновиться, и её остаток ждут (решение Р-257).
 *
 * Перечень — массивом, чтобы выборки из базы брали его же в условие
 * `notIn`, а не писали своё: правило живёт в одном месте.
 */
export const PAYMENT_CLOSED_STATUSES = ['CANCELLED'] as const;

/**
 * Просроченный транш (требование РК-10, решение Р-345): счёт
 * выставлен или платёж запланирован, плановая дата — раньше московского
 * сегодня, работа не отменена. Одно условие на плитку «Просрочено по
 * траншам» и перечень «Должники»: суммы совпадают по построению.
 * `day` — начало сегодняшнего дня по Москве (`moscowToday`).
 */
export function overdueTrancheWhere(day: Date) {
  return {
    status: { in: ['PLANNED' as const, 'INVOICED' as const] },
    plannedDate: { lt: day },
    contract: { project: { status: { notIn: [...PAYMENT_CLOSED_STATUSES] } } },
  };
}

/** То же условие для строки на экране: транш и состояние его работы. */
export function isTrancheOverdue(
  tranche: { readonly status: string; readonly plannedDate: Date | null },
  projectStatus: string,
  day: Date,
): boolean {
  return (
    (tranche.status === 'PLANNED' || tranche.status === 'INVOICED') &&
    tranche.plannedDate !== null &&
    tranche.plannedDate.getTime() < day.getTime() &&
    !(PAYMENT_CLOSED_STATUSES as readonly string[]).includes(projectStatus)
  );
}

/** Ждёт ли практика денег по работе в этом состоянии (решение Р-257). */
export function expectsPayment(status: string): boolean {
  return !(PAYMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}

/**
 * К получению по работе: остаток по договору, если практика ещё ждёт
 * денег, и ноль у отменённой работы (решение Р-257).
 */
export function receivableOf(
  status: string,
  total: bigint,
  tranches: readonly { readonly amount: bigint; readonly status: string }[],
): bigint {
  return expectsPayment(status) ? outstandingOf(total, tranches) : 0n;
}

/**
 * Деньги строкой в перечне «Ведутся сейчас» на главной.
 *
 * Прежде работа без договора читалась как «0 ₽ по договору · оплачено
 * полностью», а работа, чей остаток списан, — как оплаченная полностью,
 * хотя денег по ней пришло меньше договора (решение Р-257).
 */
export function workMoneyNote(
  money: { readonly contracted: bigint; readonly outstanding: bigint; readonly writtenOff: bigint } | null,
): string {
  if (money === null) return 'договор не заведён';
  const head = `${formatPlain(money.contracted)} ₽ по договору`;
  if (money.outstanding > 0n) return `${head} · ${formatPlain(money.outstanding)} ₽ не оплачено`;
  if (money.writtenOff > 0n) return `${head} · закрыто, из них списано ${formatPlain(money.writtenOff)} ₽`;
  return `${head} · оплачено полностью`;
}

/**
 * Разбор суммы, введённой человеком: «240 000», «240000,50», «240 000.50».
 *
 * Прежде из строки выбрасывалось всё, кроме цифр и разделителей: «240 тыс»
 * давало 240 ₽, «1,5 млн» — 1,50 ₽, «240.000» с точкой-разделителем
 * тысяч — 240 ₽, а «−5000» с типографским минусом — плюс пять тысяч.
 * Договор на «600 тыс» заводился на шестьсот рублей, и исправить это было
 * нечем (решение Р-244). Теперь строка принимается целиком или не
 * принимается: разряды через пробел, один разделитель копеек, не больше
 * двух знаков после него. Разбор — строковый, без числа с плавающей точкой.
 */
export function parseAmount(raw: string): bigint {
  const text = raw
    .replace(/[\u00a0\u202f\u2009]/gu, ' ')
    .replace(/\s*₽\s*$/u, '')
    .replace(/\s*руб\.?\s*$/iu, '')
    .trim();
  if (text.length === 0) throw new Error('Сумма не указана');
  const match = /^(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,2}))?$/u.exec(text);
  if (match === null) {
    throw new Error(
      'Сумма распознана неверно: цифрами в рублях, разряды — пробелом, копейки — после запятой, например «240 000» или «1 250,50»',
    );
  }
  const rubles = BigInt(match[1]!.replace(/ /gu, ''));
  const kopecks = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return rubles * 100n + kopecks;
}

/** Сумма в рублях для показа: «240 000 ₽», «1 250,50 ₽». */
/**
 * Сумма без знака рубля — для колонки таблицы, где знак вынесен в шапку.
 *
 * Повторять «₽» в каждой ячейке значит мешать глазу сравнивать разряды:
 * ради этого числа и выстраивают в колонку.
 */
export function formatPlain(kopecks: bigint | number | null | undefined): string {
  const full = formatAmount(kopecks);
  return full === '—' ? full : full.replace(/\s*₽$/u, '');
}

/**
 * Сумма, округлённая до рубля.
 *
 * Копейки честны там, где они есть в договоре, и лишние там, где величина
 * получена делением: средний чек «96 018,51 ₽» обещает точность, которой
 * у него нет, и удлиняет число на три знака (решение Р-182).
 */
export function formatRounded(kopecks: bigint | number | null | undefined): string {
  if (kopecks === null || kopecks === undefined) return '—';
  const value = typeof kopecks === 'bigint' ? kopecks : BigInt(Math.round(kopecks));
  return formatAmount(roundRuble(value));
}

/**
 * Сумма в копейках, округлённая до целого рубля. Нужна колонке таблицы,
 * где знак рубля вынесен в шапку, а число — тот же средний чек, что на
 * плитке аналитики (решение Р-257).
 */
export function roundRuble(kopecks: bigint): bigint {
  const negative = kopecks < 0n;
  const abs = negative ? -kopecks : kopecks;
  // Половина рубля и выше округляется вверх — обычное правило округления.
  const rubles = (abs + 50n) / 100n;
  return (negative ? -rubles : rubles) * 100n;
}

export function formatAmount(kopecks: bigint | number | null | undefined): string {
  if (kopecks === null || kopecks === undefined) return '—';
  const value = typeof kopecks === 'bigint' ? kopecks : BigInt(Math.round(kopecks));
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rubles = abs / 100n;
  const cents = abs % 100n;
  const grouped = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const tail = cents === 0n ? '' : `,${cents.toString().padStart(2, '0')}`;
  return `${negative ? '−' : ''}${grouped}${tail} ₽`;
}
