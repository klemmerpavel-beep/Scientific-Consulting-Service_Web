/**
 * Книга Excel для зеркала на Диске (решение Р-260).
 *
 * Проверки без базы и сети: книга читается обратно тем же разбором, что
 * принимает книгу заказов, суммы остаются числами, управляющие символы из
 * формы сайта не ломают XML, одна и та же таблица даёт один и тот же файл —
 * иначе зеркало отправляло бы неизменную таблицу каждый час.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readWorkbook } from '../src/lib/cabinet/import/xlsx.ts';
import { unzip } from '../src/lib/cabinet/import/zip.ts';
import { csv } from '../src/lib/disk/table.ts';
import { columnName, sheetTitle, xlsx } from '../src/lib/disk/xlsx.ts';

const sheet = {
  title: 'Оплаты',
  head: ['Работа', 'Сумма', 'Этапов', 'Сообщение'],
  rows: [
    ['PD-2026-001', { kopecks: 12_345_678n }, 3, 'Глава 2 <готова> & "принята"'],
    ['PD-2026-002', { kopecks: -5_000n }, 0, '=HYPERLINK("http://evil/")'],
    ['PD-2026-003', '', null, 'строка\u0007с\u0000управляющими'],
  ],
};

describe('книга Excel зеркала', () => {
  const book = xlsx(sheet);

  it('читается обратно: заголовок, текст и числа на местах', () => {
    const [first] = readWorkbook(book);
    assert.equal(first?.name, 'Оплаты');
    const rows = first!.rows;
    assert.equal(rows[0]?.cells.A?.value, 'Работа');
    assert.equal(rows[1]?.cells.A?.value, 'PD-2026-001');
    assert.equal(rows[1]?.cells.B?.value, '123456.78');
    assert.notEqual(rows[1]?.cells.B?.type, 'inlineStr');
    assert.equal(rows[1]?.cells.C?.value, '3');
    assert.equal(rows[1]?.cells.D?.value, 'Глава 2 <готова> & "принята"');
    assert.equal(rows[2]?.cells.B?.value, '-50.00');
  });

  it('текст, похожий на формулу, остаётся текстом', () => {
    const [first] = readWorkbook(book);
    assert.equal(first!.rows[2]?.cells.D?.value, '=HYPERLINK("http://evil/")');
    assert.equal(first!.rows[2]?.cells.D?.type, 'inlineStr');
    const parts = unzip(book);
    assert.ok(!parts.get('xl/worksheets/sheet1.xml')!.toString('utf8').includes('<f>'));
  });

  it('управляющие символы вычищены, пустые ячейки не пишутся', () => {
    const [first] = readWorkbook(book);
    assert.equal(first!.rows[3]?.cells.D?.value, 'строкасуправляющими');
    assert.equal(first!.rows[3]?.cells.B, undefined);
    assert.equal(first!.rows[3]?.cells.C, undefined);
  });

  it('заголовок закреплён, у столбцов фильтр', () => {
    const xml = unzip(book).get('xl/worksheets/sheet1.xml')!.toString('utf8');
    assert.match(xml, /<pane ySplit="1"[^>]*state="frozen"/);
    assert.match(xml, /<autoFilter ref="A1:D4"\/>/);
  });

  it('одна таблица — один файл байт в байт', () => {
    assert.deepEqual(xlsx(sheet), book);
  });

  it('CSV той же таблицы пишет сумму по-русски', () => {
    const text = csv(sheet.head, sheet.rows);
    assert.ok(text.includes('"123456,78"'), text);
    assert.ok(text.includes('"-50,00"'), text);
  });

  it('имена столбцов и листа по правилам Excel', () => {
    assert.equal(columnName(0), 'A');
    assert.equal(columnName(25), 'Z');
    assert.equal(columnName(26), 'AA');
    assert.equal(sheetTitle('Итоги: 2026/2027 [черновик]'), 'Итоги  2026 2027  черновик');
    assert.ok(sheetTitle('x'.repeat(40)).length <= 31);
  });
});
