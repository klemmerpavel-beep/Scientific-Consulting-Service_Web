/**
 * Блок «Деньги» на «Сводке» пишет суммы со знаком рубля (решение Р-698).
 *
 * Три величины блока — «Получено», «К получению», «Просрочено по
 * траншам» — выводились через `formatPlain`: она для колонки таблицы, где
 * знак вынесен в шапку. Шапки со знаком у блока нет, а плитка «Получено» в
 * «Пульсе» на том же экране пишет «230 000 ₽», и рядом стояли «230 000» и
 * «230 000 ₽».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { formatAmount } from '../src/lib/cabinet/money.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'page.tsx'),
  'utf8',
);

describe('«Деньги» на «Сводке» — со знаком рубля (Р-698)', () => {
  // Строки блока: от «Получено» до «Просрочено по траншам».
  const block = page.slice(page.indexOf("key: 'got',"), page.indexOf('].map((row) => (', page.indexOf("key: 'got',")));

  it('разбор блока нашёл три строки', () => {
    for (const key of ['got', 'wait', 'debt']) assert.match(block, new RegExp(`key: '${key}'`, 'u'));
  });

  it('суммы блока — `formatAmount`, а не `formatPlain`', () => {
    assert.doesNotMatch(block, /formatPlain\(/u);
    assert.equal(block.match(/value: formatAmount\(/gu)?.length, 3);
  });

  it('`formatAmount` пишет знак рубля', () => {
    assert.match(formatAmount(23_000_000n), /^230\s000\s₽$/u);
  });
});
