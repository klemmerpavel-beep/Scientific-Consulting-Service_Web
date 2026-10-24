/**
 * «К получению» — одно имя одной величины и ссылка на «Поступления»
 * (решение Р-752). Остаток по договорам, кроме отменённых (`openBalance`,
 * Р-257), на «Сводке», в «Деньгах» и отчёте звался «К получению», а в
 * «Аналитике» — «Задолженность» и «Задолженность всего»: слово читалось как
 * просроченный долг. Теперь плитки «Аналитики» и «Потерь» — «К получению»
 * с прежними пояснениями; число «К получению» на «Сводке» и в «Деньгах» —
 * ссылкой на «Поступления», где тот же итог разложен по месяцам (Р-348).
 * «Просрочено по траншам» не меняется (Р-345, Р-447).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const overview = read('app', 'cabinet', 'manage', 'analytics', 'page.tsx');
const money = read('app', 'cabinet', 'manage', 'analytics', 'money', 'page.tsx');
const losses = read('app', 'cabinet', 'manage', 'analytics', 'losses', 'page.tsx');
const manage = read('app', 'cabinet', 'manage', 'page.tsx');
const finance = read('app', 'cabinet', 'manage', 'finance', 'page.tsx');
const ui = read('components', 'cabinet', 'ui.tsx');

describe('«К получению» вместо «Задолженности» (Р-752)', () => {
  it('плитки «Аналитики» и «Потерь» — «К получению», пояснения прежние', () => {
    assert.match(overview, /<Tile label="К получению" value=\{formatAmount\(total\.outstanding\)\} note="остаток по каждой работе, кроме отменённых" \/>/u);
    assert.match(money, /label="К получению"\s*value=\{formatAmount\(total\.outstanding\)\}\s*note=\{`\$\{debts\.length\} \$\{plural\(debts\.length, 'работа', 'работы', 'работ'\)\} с остатком, кроме отменённых`\}/u);
    assert.match(losses, /<Tile label="К получению" value=\{formatAmount\(total\.outstanding\)\} note="по всем работам, кроме отменённых" \/>/u);
  });

  it('слова «Задолженность» у плиток нет', () => {
    for (const source of [overview, money, losses]) assert.doesNotMatch(source, /label="Задолженность/u);
  });
});

describe('«К получению» ведёт к «Поступлениям» (Р-752)', () => {
  it('на «Сводке» — число ссылкой; «Просрочено по траншам» — как прежде', () => {
    assert.match(
      manage,
      /row\.key === 'wait' && money\.awaiting > 0n \? \([\s\S]{0,200}<a className="cab-mark" href="\/cabinet\/manage\/finance\/receipts">\s*\{row\.value\}/u,
    );
    assert.match(manage, /row\.key === 'debt' && money\.overdue > 0n \? \(\s*<a className="cab-mark" href="\/cabinet\/manage\/finance\/debtors">/u);
  });

  it('в «Деньгах» — плитка ссылкой', () => {
    assert.match(finance, /\{ label: 'К получению', value: totals\.awaiting, href: totals\.awaiting > 0n \? '\/cabinet\/manage\/finance\/receipts' : undefined \}/u);
    assert.match(finance, /<Tile key=\{tile\.label\} label=\{tile\.label\} value=\{formatAmount\(tile\.value\)\} note=\{tile\.note\} href=\{tile\.href\} \/>/u);
    assert.match(ui, /\{href === undefined \? \(\s*value\s*\) : \([\s\S]{0,300}?<a className="cab-mark" href=\{href\} style=\{\{ margin: 'calc\(\(1\.24em - 44px\) \/ 2\) 0' \}\}>\s*\{value\}\s*<\/a>\s*\)\}/u);
  });
});
