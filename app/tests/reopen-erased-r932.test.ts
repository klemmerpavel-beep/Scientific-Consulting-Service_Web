/**
 * Работа обезличенного клиента в действие не возвращается (решение Р-932; аудит 15.11.2026, Ф-11).
 * Ответ владельца — 15.11.2026.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS } from '../src/components/cabinet/tokens.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const ui = read('components', 'cabinet', 'ui.tsx');
const card = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
const css = CABINET_CSS.replace(/\/\*[\s\S]*?\*\//gu, '');
void [ui, card, css, findForbidden];

describe('Р-932: работа обезличенного клиента в действие не возвращается (Ф-11)', () => {
  it('отказ назван прямо и стоит до записи', () => {
    const projects = read('lib', 'cabinet', 'projects.ts');
    assert.match(projects, /if \(to === 'ACTIVE' && current\.client\.erasedAt !== null\) \{\s*throw new Error\(REOPEN_ERASED\);/u);
    assert.match(projects, /REOPEN_ERASED =\s*'Данные клиента удалены по его требованию: такую работу в действие не возвращают';/u);
  });
});
