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

export type TrancheStatus = 'PLANNED' | 'INVOICED' | 'PAID' | 'WRITTEN_OFF';

export const STATUS_LABEL: Record<TrancheStatus, string> = {
  PLANNED: 'ожидается',
  INVOICED: 'выставлен счёт',
  PAID: 'оплачен',
  WRITTEN_OFF: 'списан',
};

/**
 * Допустимые смены статуса транша (решение Р-224).
 *
 * Прежде статус принимался любой, в том числе откат оплаченного в
 * «ожидается» со стиранием даты поступления, а выставить счёт или списать
 * долг было нечем: экран предлагал только «Отметить оплату». Оплаченный и
 * списанный транш — итог, из которого не уходят: ошибочную отметку
 * исправляет новый транш, а не стирание истории поступлений.
 */
const TRANCHE_TRANSITIONS: Record<TrancheStatus, readonly TrancheStatus[]> = {
  PLANNED: ['INVOICED', 'PAID', 'WRITTEN_OFF'],
  INVOICED: ['PAID', 'WRITTEN_OFF', 'PLANNED'],
  PAID: [],
  WRITTEN_OFF: [],
};

export function isTrancheStatus(value: string): value is TrancheStatus {
  return value in STATUS_LABEL;
}

export function nextTrancheStatuses(from: TrancheStatus): readonly TrancheStatus[] {
  return TRANCHE_TRANSITIONS[from];
}

export function canChangeTrancheStatus(from: TrancheStatus, to: TrancheStatus): boolean {
  return TRANCHE_TRANSITIONS[from].includes(to);
}

/** Разбор суммы, введённой человеком: «240 000», «240000,50», «240 000.50». */
export function parseAmount(raw: string): bigint {
  const normalized = raw
    .replace(/ /g, ' ')
    .replace(/[^\d,.-]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (normalized.length === 0) throw new Error('Сумма не указана');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) throw new Error('Сумма распознана неверно');
  return BigInt(Math.round(value * 100));
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
  const negative = value < 0n;
  const abs = negative ? -value : value;
  // Половина рубля и выше округляется вверх — обычное правило округления.
  const rubles = (abs + 50n) / 100n;
  return formatAmount((negative ? -rubles : rubles) * 100n);
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
