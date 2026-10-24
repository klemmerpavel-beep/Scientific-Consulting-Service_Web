/**
 * Флажок общего `Checkbox` держит размер при длинной подписи (решение Р-680).
 *
 * Подпись стоит с флажком в строке `display: flex`, и без запрета сжатия
 * переносящаяся подпись ужимала флажок до 13–17 px: флажки многострочных
 * пунктов чек-листа выходили мельче соседних, а левый край подписей шёл
 * вразнобой. Проверка — по исходнику, как `cabinet-ui-p34.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ui = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'ui.tsx'), 'utf8');

describe('Checkbox: флажок одного размера при любой подписи', () => {
  const start = ui.indexOf('export function Checkbox(');
  const body = ui.slice(start, ui.indexOf('\nexport function ', start + 1));

  it('компонент найден', () => {
    assert.ok(start >= 0, 'нет компонента Checkbox');
  });

  it('флажок 18 × 18 не сжимается и стоит без полей браузера', () => {
    assert.match(body, /<input\s+type="checkbox"[\s\S]*?style=\{\{ width: 18, height: 18, flexShrink: 0, margin: 0 \}\}/u);
  });
});
