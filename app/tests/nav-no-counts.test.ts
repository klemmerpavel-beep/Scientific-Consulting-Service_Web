/**
 * Пункты меню кабинета — без чисел (замечание владельца 13.10.2026,
 * решение Р-573).
 *
 * Число у «Сводки» и у «Рекомендаций» меняло ширину пункта, и строка меню
 * сдвигалась. Числа остаются на самих экранах.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

describe('меню без чисел (Р-573)', () => {
  it('оболочка не считает и не выводит чисел у пунктов', () => {
    const shell = read('src', 'components', 'cabinet', 'Shell.tsx');
    assert.doesNotMatch(shell, /headAttentionCount|headRecommendationCount|item\.count/u);
  });

  it('у пункта меню нет поля числа', () => {
    const nav = read('src', 'lib', 'cabinet', 'nav.ts');
    assert.doesNotMatch(nav, /readonly count\?/u);
  });

  it('число ждущих решения рекомендаций — на самом экране', () => {
    const page = read('src', 'app', 'cabinet', 'manage', 'recommendations', 'page.tsx');
    assert.match(page, /Ждут решения: \$\{unmarked\}/u);
    assert.doesNotMatch(page, /у пункта меню/u);
  });
});
