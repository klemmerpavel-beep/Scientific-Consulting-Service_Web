/**
 * Плитка «Ошибок» на экране «Зеркало на облачном диске» до первого
 * прогона (решение Р-712).
 *
 * Подпись плитки отдавала состояние «прогонов нет» тексту «последний
 * прогон чистый», хотя соседние плитки в нём же пишут «прогонов ещё не
 * было» и «нет данных». Так выглядела любая новая установка до первой
 * выгрузки.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана: выражение подписи вычисляется для каждого состояния, как в
 * `disk-pull-caption.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'disk', 'page.tsx'),
  'utf8',
);
const start = page.indexOf('label="Ошибок"');
const tile = page.slice(start, page.indexOf('/>', start));

function note(last: { failed: number } | null): unknown {
  const expression = tile.match(/note=\{([\s\S]+)\}\s*$/u)?.[1];
  assert.ok(expression !== undefined, 'у плитки «Ошибок» нет подписи');
  return new Function('last', `return (${expression});`)(last);
}

describe('плитка «Ошибок» зеркала на диске', () => {
  it('до первого прогона не называет прогон чистым', () => {
    assert.ok(start >= 0, 'плитки «Ошибок» нет');
    assert.equal(note(null), 'прогонов ещё не было');
  });

  it('после прогона без ошибок — «последний прогон чистый»', () => {
    assert.equal(note({ failed: 0 }), 'последний прогон чистый');
  });

  it('после прогона с ошибками отсылает к журналу', () => {
    assert.equal(note({ failed: 2 }), 'разберите журнал прогона');
  });
});
