/**
 * Клиенту у сорванного срока работы — пояснение, чего ждать (решение Р-927; аудит 15.11.2026, В-8).
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

describe('Р-927: клиенту у сорванного срока работы — чего ждать (В-8)', () => {
  it('пояснение стоит только у клиента и только при сорванном сроке', () => {
    assert.match(ui, /\{projectLate && !staff \? PROJECT_LATE_FOR_CLIENT : ''\}/u);
    assert.match(ui, /PROJECT_LATE_FOR_CLIENT = '; новый срок назовёт менеджер';/u);
  });

  it('сотрудник назван «менеджером», без имени', () => {
    assert.deepEqual(findForbidden('срок работы — 2 сентября 2026 · прошёл; новый срок назовёт менеджер'), []);
  });
});
