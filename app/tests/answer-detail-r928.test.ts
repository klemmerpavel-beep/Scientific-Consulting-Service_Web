/**
 * Пояснение в ответе экрана на телефоне показано целиком (решение Р-928; аудит 15.11.2026, В-6).
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

describe('Р-928: пояснение в ответе экрана на телефоне — целиком (В-6)', () => {
  it('предел в три строки — в стилях и только на широком экране', () => {
    assert.match(css, /\.cab-lead-detail\{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden\}/u);
    assert.match(css, /@media \(max-width:480px\)\{\.cab-lead-detail\{display:block;overflow:visible\}\}/u);
    assert.match(ui, /className="cab-lead-detail"/u);
  });
});
