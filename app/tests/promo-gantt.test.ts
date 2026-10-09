/**
 * График окон продвижения (решения Р-493, Р-539): рисунок и его
 * обозначения скрыты от читалки — она читает даты в столбце вида; на стыке
 * окна и главного окна углы прямые.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`: компонент
 * собирается Next.js, без него разметку здесь не отрисовать.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const code = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'PromoGantt.tsx'), 'utf8');

describe('график окон продвижения (Р-539)', () => {
  it('обозначения скрыты от читалки, как и сам рисунок', () => {
    const legend = code.slice(code.indexOf('<ul'), code.indexOf('>', code.indexOf('<ul')) + 1);
    assert.match(legend, /aria-hidden="true"/u);
    assert.doesNotMatch(code, /aria-label="Обозначения графика"/u);
  });

  it('окно и главное окно стыкуются прямыми углами', () => {
    assert.match(code, /bar\(windowFrom, mainFrom, WINDOW_BAR, \{ right: true \}\)/u);
    assert.match(code, /bar\(mainFrom, orderOn \+ DAY, MAIN_BAR, \{ left: windowFrom !== null && windowFrom < mainFrom \}\)/u);
    assert.match(code, /const squareLeft = from < start \|\| joined\.left === true;/u);
    assert.match(code, /const squareRight = to > end \|\| joined\.right === true;/u);
  });
});
