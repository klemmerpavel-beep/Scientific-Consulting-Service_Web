/**
 * Длинная таблица: первые строки и остаток под свёрткой — одна сетка
 * столбцов (решение Р-682).
 *
 * `LongTable` рисует две таблицы. С автоматической раскладкой каждая
 * считала ширины столбцов по своим строкам, а вторая к тому же стояла в
 * теле свёртки с полем 18 px: на «Клиентах» шапки продолжения уезжали на
 * 15–20 px, и числа «Заказов» и суммы стояли не друг под другом. Р-176
 * задаёт остаток под свёрткой, но не другую сетку. Проверка — по
 * исходникам, как `cabinet-ui-p34.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

/** Исходник без комментариев: правила касаются кода, а не пояснений к нему. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('LongTable: ширины столбцов задаются один раз для обеих таблиц', () => {
  const ui = code(read('components', 'cabinet', 'ui.tsx'));
  const start = ui.indexOf('export function LongTable(');
  const body = ui.slice(start, ui.indexOf('\nexport function ', start + 1));

  it('необязательный проп widths', () => {
    assert.match(body, /widths\?: readonly string\[\];/u);
  });

  it('с ширинами — постоянная раскладка и общий colgroup в обеих таблицах', () => {
    assert.match(body, /tableLayout: 'fixed'/u);
    assert.match(body, /<colgroup>\{widths\.map\(\(width, index\) => \(\s*<col key=\{index\} style=\{\{ width \}\} \/>\s*\)\)\}<\/colgroup>/u);
    const tables = [...body.matchAll(/<table style=\{style\}>([\s\S]*?)<thead>/gu)].map((match) => match[1]!);
    assert.equal(tables.length, 2, 'таблиц в LongTable должно быть две');
    for (const head of tables) assert.match(head, /\{cols\}/u, 'таблица без общего colgroup');
  });

  it('остаток стоит по краям карточки, а не внутри поля свёртки', () => {
    const fold = body.slice(body.indexOf('<Disclosure'));
    assert.match(fold, /<TableScroll\b[^>]*style=\{widths === undefined \? undefined : \{ margin: '0 -18px' \}\}/u);
  });

  it('поле тела свёртки — те же 18 px, на которые выведен остаток', () => {
    const fold = ui.slice(ui.indexOf('export function Disclosure('));
    assert.match(fold, /className=\{tall \? 'cab-fold-body cab-fold-tall' : 'cab-fold-body'\}[\s\S]{0,120}padding: '4px 18px 18px'/u);
  });
});

describe('«Клиенты»: шесть ширин на шесть столбцов', () => {
  it('ширины переданы и в сумме дают всю таблицу', () => {
    const page = code(read('app', 'cabinet', 'manage', 'analytics', 'clients', 'page.tsx'));
    const call = page.slice(page.indexOf('<LongTable'));
    const match = /widths=\{CLIENT_COLUMNS\}/u.exec(call);
    assert.ok(match, 'LongTable «Клиентов» без ширин');
    const list = /const CLIENT_COLUMNS = \[([^\]]*)\] as const;/u.exec(page);
    assert.ok(list, 'нет перечня ширин');
    const widths = [...list[1]!.matchAll(/'(\d+)%'/gu)].map((m) => Number(m[1]));
    assert.equal(widths.length, 6);
    assert.equal(widths.reduce((sum, w) => sum + w, 0), 100);
    const heads = (call.slice(0, call.indexOf('</tr>')).match(/<th\b/gu) ?? []).length;
    assert.equal(heads, widths.length);
  });
});
