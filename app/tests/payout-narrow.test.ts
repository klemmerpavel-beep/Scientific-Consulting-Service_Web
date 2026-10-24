/**
 * «Вознаграждение» на телефоне показывает сумму и состояние без прокрутки
 * вбок (решение Р-737). Прежде таблица «Начисления по работам» шириной
 * не меньше 640 px на 390 и 360 px показывала «Работа» и начало «За что»,
 * а «Состояние» и «Сумма, ₽» уходили за правый край; заголовок экрана —
 * «Начислено и выплачено» при пункте меню «Вознаграждение».
 *
 * Теперь на узком экране «За что» — второй строкой под работой (как
 * комментарий к начислению), столбец «За что» и наименьшая ширина сняты;
 * на широком таблица прежняя. Состав данных и пометка «работа передана» не
 * меняются (Р-332, Р-339); плитки — общие (Р-172).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'payout', 'page.tsx'), 'utf8');
const nav = readFileSync(path.join(SRC, 'lib', 'cabinet', 'nav.ts'), 'utf8');
const tokens = readFileSync(path.join(SRC, 'components', 'cabinet', 'tokens.ts'), 'utf8');

describe('«Вознаграждение» на телефоне (Р-737)', () => {
  it('заголовок экрана совпадает с пунктом меню; подзаголовок прежний', () => {
    assert.match(nav, /\{ href: '\/cabinet\/payout', label: 'Вознаграждение' \}/u);
    assert.match(page, /<ScreenHead title="Вознаграждение" note="Начисления ставит практика по этапу или работе целиком\." \/>/u);
    assert.doesNotMatch(page, /Начислено и выплачено/u);
  });

  it('на широком экране таблица прежняя: четыре столбца, наименьшая ширина 640', () => {
    assert.match(page, /<table className="cab-pay" style=\{\{ width: '100%', borderCollapse: 'collapse', minWidth: 640 \}\}>/u);
    const heads = [...page.matchAll(/<th[^>]*scope="col">([^<]+)<\/th>/gu)].map((match) => match[1]);
    assert.deepEqual(heads, ['Работа', 'За что', 'Состояние', 'Сумма, ₽']);
    assert.match(page, /<th className="cab-pay-for" style=\{TABLE_HEAD\} scope="col">За что<\/th>/u);
    assert.match(page, /<td className="cab-pay-for" style=\{TABLE_CELL\}>/u);
  });

  it('«За что» и комментарий — второй строкой под работой, те же данные', () => {
    const cell = page.slice(page.indexOf('<td style={TABLE_CELL}>'), page.indexOf('<td className="cab-pay-for"'));
    assert.match(cell, /<div className="cab-pay-for-line" style=\{\{ fontSize: 13 \}\}>/u);
    assert.match(cell, /\{row\.project === null \? null : <div>\{row\.stage\?\.title \?\? 'по работе в целом'\}<\/div>\}/u);
    assert.match(cell, /\{row\.comment === null \? null : <div style=\{\{ color: 'var\(--pd-ink-muted\)' \}\}>\{row\.comment\}<\/div>\}/u);
    // Пометка переданной работы и закрытая до договора работа — прежние.
    assert.match(cell, /работа передана/u);
    assert.match(cell, /откроется после договора поручения/u);
  });

  it('на узком экране столбец «За что» и наименьшая ширина сняты, строка под работой видна', () => {
    assert.match(tokens, /\n\.cab-pay-for-line\{display:none\}\n/u);
    const rule = tokens.match(/@media \(max-width:768px\)\{(\.cab-pay\{[^\n]*)\}/u);
    assert.ok(rule !== null, 'нет правила узкого экрана для «Вознаграждения»');
    assert.match(rule[1]!, /\.cab-pay\{min-width:0!important\}/u);
    assert.match(rule[1]!, /\.cab-pay \.cab-pay-for\{display:none\}/u);
    assert.match(rule[1]!, /\.cab-pay-for-line\{display:block/u);
    // На 360 px с полями 16 и 8 px таблица шире области на 15 px.
    const phone = tokens.match(/@media \(max-width:480px\)\{(\.cab-pay th,[^\n]*)\}/u);
    assert.ok(phone !== null, 'нет правила полей таблицы на телефоне');
    assert.match(phone[1]!, /\.cab-pay th,\.cab-pay td\{padding-left:5px!important;padding-right:5px!important\}/u);
  });
});
