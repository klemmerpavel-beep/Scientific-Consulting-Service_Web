/**
 * Второстепенные переходы практики — ссылками в «О работе» (решение Р-929; аудит 15.11.2026, В-5).
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

describe('Р-929: второстепенные переходы практики — ссылками в «О работе» (В-5)', () => {
  it('три перехода собраны перечнем ссылок, только у менеджера и руководителя', () => {
    assert.match(card, /const aboutLinks: \{ href: string; label: string \}\[\] = practice\s*\? \[/u);
    for (const label of ['Обновить из документа', 'Чек-лист · ', 'Что подготовить · приложено ']) {
      const at = card.indexOf('const aboutLinks');
      assert.ok(card.slice(at, at + 1400).includes(label), label);
    }
    assert.match(card, /<Disclosure title="О работе">[\s\S]{0,200}aboutLinks\.length === 0 \? null :/u);
  });

  it('в шапке у практики этих кнопок нет; клиенту и куратору они остаются', () => {
    assert.match(card, /\{!practice && mayBrief \? \(/u);
    assert.match(card, /\{practice \|\| checklist === undefined \? null : \(/u);
    assert.match(card, /\{practice \|\| prepareCount === null \? null : \(/u);
  });

  it('ссылка — цель нажатия не ниже 44 px', () => {
    assert.match(card, /const ABOUT_LINK = \{ display: 'inline-flex', alignItems: 'center', minHeight: 44,/u);
  });
});
