/**
 * Строки таблиц: экранирование, числа, деньги.
 *
 * Отдельный модуль, потому что он чистый: ни базы, ни сети. Ошибка здесь
 * портит все таблицы разом — значит, её надо ловить проверками, а не
 * глазами в выгруженном файле.
 */

/** Экранирование по RFC 4180: кавычки удваиваются, поле берётся в кавычки. */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Метка BOM и переводы строк CRLF: без них таблицы на Windows показывают
 * кириллицу вопросительными знаками, а строки — одной длинной ячейкой.
 */
export function csv(head: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [head.map(cell).join(',')];
  for (const row of rows) lines.push(row.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * Копейки в рубли для таблицы: запятая как разделитель дробной части и
 * никаких пробелов внутри числа. Так ячейку читает как число и «Р7-Офис», и
 * Excel в русской раскладке; пробел-разделитель разрядов превратил бы число
 * в текст, и столбец перестал бы складываться.
 */
export function rub(kopecks: bigint | null | undefined): string {
  if (kopecks === null || kopecks === undefined) return '';
  const negative = kopecks < 0n;
  const abs = negative ? -kopecks : kopecks;
  const whole = abs / 100n;
  const cents = String(abs % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole},${cents}`;
}
