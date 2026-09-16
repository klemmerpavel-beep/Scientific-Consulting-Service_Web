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
