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

// Прокручиваемое тело свёртки на экране-панели и тело плашки-перечня
// «Сводки» рисовали дорожку полосы прокрутки квадратом поверх скруглённого
// нижнего правого угла: рамка снаружи скруглена, внутри угол прямой
// (решение Р-678). Обрезка стоит только там, где тело прокручивается, —
// пределы ширины те же, ниже которых прокрутка снята (Р-320).
describe('прокручиваемое тело не срезает скругление угла', () => {
  it('свёртка экрана-панели обрезает содержимое по своему скруглению от 1025 px', () => {
    assert.match(CABINET_CSS, /@media \(min-width:1025px\)\{\.cab-board-main details\.cab-block\{overflow:clip\}/u);
  });

  it('плашка-перечень «Сводки» обрезает содержимое от 960 px', () => {
    assert.match(CABINET_CSS, /@media \(min-width:960px\)\{\.cab-dash-list\{overflow:clip\}/u);
  });

  it('кольцо фокуса шапки и тела внутри обрезки уведено внутрь', () => {
    assert.match(
      CABINET_CSS,
      /@media \(min-width:1025px\)\{[^@]*\.cab-board-main details\.cab-block>summary:focus-visible,\.cab-board-main \.cab-fold-body:focus-visible\{outline-offset:-2px\}/u,
    );
    assert.match(CABINET_CSS, /@media \(min-width:960px\)\{[^@]*\.cab-dash-body:focus-visible\{outline-offset:-2px\}/u);
  });

  it('пределы обрезки смыкаются с пределами, ниже которых прокрутка снята', () => {
    assert.match(CABINET_CSS, /@media \(max-width:1024px\)\{[^\n]*\.cab-board-main \.cab-fold-body,\.cab-board-main \.cab-fold-tall\{max-height:none!important;overflow:visible!important\}/u);
    assert.match(CABINET_CSS, /@media \(max-width:959px\)\{[^\n]*\.cab-dash-body\{overflow:visible!important\}/u);
  });
});
