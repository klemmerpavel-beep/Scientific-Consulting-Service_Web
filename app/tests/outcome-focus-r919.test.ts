/**
 * После действия фокус стоит на его исходе (решение Р-919).
 *
 * Аудит 15.11.2026, находка Д-2: после серверного действия фокус падал на
 * документ, при отказе окно оставалось вверху, а читалка не произносила
 * ни подтверждения, ни причины отказа.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const DIR = path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet');
const read = (name: string) => readFileSync(path.join(DIR, name), 'utf8');
const ui = read('ui.tsx');
const focus = read('OutcomeFocus.tsx');

describe('фокус на исходе действия (Р-919)', () => {
  it('блок исхода принимает фокус, но в порядок обхода не входит', () => {
    assert.match(ui, /<div className="cab-outcome" id=\{id\} tabIndex=\{-1\}/u);
  });

  it('исход берёт фокус сам, при появлении и при новом исходе в той же форме', () => {
    assert.match(focus, /^'use client';/u);
    assert.match(focus, /closest<HTMLElement>\('\.cab-outcome'\)\?\.focus\(\);/u);
    assert.match(focus, /\}, \[mark\]\);/u);
    assert.match(ui, /<OutcomeFocus mark=\{mark \?\? id \?\? tone\} \/>/u);
  });

  it('отказ помечен своим идентификатором: повторный отказ снова получает фокус', () => {
    assert.match(read('ActionError.tsx'), /<Outcome tone="error" mark=\{id\}>/u);
  });

  it('роль области прежняя: отказ — `alert`, подтверждение — `status`', () => {
    assert.match(ui, /<Notice tone=\{tone\} role=\{tone === 'error' \? 'alert' : 'status'\}>/u);
  });

  it('фокус не уводит окно от исхода: прокрутка не запрещена', () => {
    assert.doesNotMatch(focus, /preventScroll/u);
  });
});
