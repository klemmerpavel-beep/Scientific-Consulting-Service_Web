/**
 * Скругление свёрток кабинета (замечание владельца 23.10.2026, решение
 * Р-677). Раскрытая шапка свёртки заливается цветом, и без своего
 * скругления её заливка ложилась прямоугольником поверх скруглённой рамки
 * блока: углы раскрытого блока становились прямыми на всех экранах.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS, RADIUS } from '../src/components/cabinet/tokens.ts';

const inner = `${RADIUS.card - 1}px`;

describe('шапка свёртки скругляется вместе с блоком', () => {
  it('сомкнутая — по всему контуру, внутренним радиусом блока', () => {
    assert.ok(CABINET_CSS.includes(`details.cab-block>summary{border-radius:${inner}}`));
  });

  it('раскрытая — только сверху: снизу к ней примыкает тело', () => {
    assert.ok(CABINET_CSS.includes(`details[open].cab-block>summary{border-radius:${inner} ${inner} 0 0}`));
  });

  it('у шапки блока со свёрткой нет своего скругления поверх общего правила', () => {
    const ui = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'ui.tsx'), 'utf8');
    const start = ui.indexOf('export function FoldCard(');
    const summary = ui.slice(ui.indexOf('<summary', start), ui.indexOf('</summary>', start));
    assert.doesNotMatch(summary, /borderRadius/u);
  });
});
