/**
 * Строка «Тема» в «О работе» (решение Р-652): у работы без
 * темы — перенесённой из книги без описания, заказанной вручную или
 * поправленной с пустым полем — строки нет, как и на плашке «Моих работ».
 * Прежде подпись «Тема» стояла с пустым значением.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `moscow-day.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const read = (...parts: string[]) =>
  readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', ...parts), 'utf8');

describe('«Тема» без значения не выводится (Р-652)', () => {
  const card = read('projects', '[code]', 'page.tsx');
  // Строка «Тема» в перечне `about` — с условием, под которым она пропускается.
  const row = card.split('\n').find((line) => line.includes("term: 'Тема'")) ?? '';

  it('строка «Тема» найдена', () => {
    assert.notEqual(row, '');
  });

  it('работа без темы строки не получает', () => {
    assert.match(row, /project\.topic === null \|\| project\.topic === project\.title \? null :/u);
  });

  it('то же правило, что у плашки «Моих работ»', () => {
    assert.match(read('projects', 'page.tsx'), /project\.topic === null \|\| project\.topic === project\.title \? null :/u);
  });
});
