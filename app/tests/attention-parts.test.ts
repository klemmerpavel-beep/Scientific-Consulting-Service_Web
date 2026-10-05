/**
 * Число у пункта «Сводка» и плашки «Требует внимания» — одни части
 * (требование РК-04, решение Р-342): каждая часть `attentionParts`
 * разворачивается на «Сводке» в плашки, иначе число в меню разошлось бы со
 * списком. Новая часть без плашек — отказ проверки (поручения РК-19,
 * решение Р-352, добавили две).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const attention = readFileSync(path.join(SRC, 'lib', 'cabinet', 'attention.ts'), 'utf8');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');

describe('части «Требует внимания» и плашки «Сводки»', () => {
  const body = attention.slice(attention.indexOf('export function attentionParts'), attention.indexOf('export function attentionCount'));
  const keys = [...body.matchAll(/^\s{4}(\w+):/gmu)].map((match) => match[1]!);

  it('частей больше десяти — разбор файла не сломан', () => {
    assert.ok(keys.length >= 10, `найдено частей: ${keys.length}`);
  });

  for (const key of keys) {
    it(`часть «${key}» разворачивается в плашки`, () => {
      assert.match(page, new RegExp(`\\.\\.\\.parts\\.${key}\\.map\\(`, 'u'));
    });
  }
});
