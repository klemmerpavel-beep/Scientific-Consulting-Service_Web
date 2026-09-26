/**
 * Строки таблиц: экранирование, числа, деньги.
 *
 * Отдельный модуль, потому что он чистый: ни базы, ни сети. Ошибка здесь
 * портит все таблицы разом — значит, её надо ловить проверками, а не
 * глазами в выгруженном файле.
 */

/**
 * Экранирование по RFC 4180: кавычки удваиваются, поле берётся в кавычки.
 *
 * Значение, которое табличный редактор исполнил бы как формулу, получает
 * апостроф: имя и сообщение приходят с открытой формы сайта, и
 * `=HYPERLINK(…)` в таблице заявок на Диске исполнился бы на машине
 * руководителя. Выгрузку заявок так защитил Р-235, таблицы зеркала — нет
 * (решение Р-246). Отрицательная сумма «-5,00» формулой не считается.
 */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const formula = /^[=+@\t\r]/u.test(s) || (s.startsWith('-') && !/^-\d+(,\d+)?$/u.test(s));
  const guarded = formula ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Метка BOM и переводы строк CRLF: без них таблицы на Windows показывают
 * кириллицу вопросительными знаками, а строки — одной длинной ячейкой.
 *
 * Поля делятся точкой с запятой, как в выгрузках кабинета (`csv.ts`):
 * Excel и «Р7-Офис» в русской раскладке ждут её, а запятая у них — знак
 * дробной части, и таблица с запятыми открывалась одним столбцом
 * (решение Р-252).
 */
export function csv(head: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [head.map(cell).join(';')];
  for (const row of rows) lines.push(row.map(cell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Москва — UTC+3 круглый год: перехода на летнее время нет с 2014 года. */
const MSK_MS = 3 * 3_600_000;

/**
 * День по Москве. Прежде день брался по UTC, и заявка, пришедшая в 01:30
 * по Москве, в таблице стояла вчерашней (решение Р-252). Для дат без
 * времени — срок, дата подписания — сдвиг на три часа день не меняет: они
 * хранятся полночью по UTC.
 */
export function mskDay(value: Date | null | undefined): string {
  return value === null || value === undefined
    ? ''
    : new Date(value.getTime() + MSK_MS).toISOString().slice(0, 10);
}

/** Момент по Москве с точностью до минуты; заголовок столбца помечается «МСК». */
export function mskMoment(value: Date | null | undefined): string {
  return value === null || value === undefined
    ? ''
    : new Date(value.getTime() + MSK_MS).toISOString().slice(0, 16).replace('T', ' ');
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
