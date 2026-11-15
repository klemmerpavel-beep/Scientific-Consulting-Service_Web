/**
 * Карточка работы без вложенной прокрутки; план — по высоте соседней
 * колонки, не меньше трёх этапов (решение Р-918).
 *
 * Аудит 15.11.2026, находки Н-1 и В-1 (обе высокие): «Управление работой»
 * показывало 1738 px форм в окне 200 px, «Правка этапа» была третьей
 * вложенной прокруткой; план показывал 380 px из 669 в окне 900 px и
 * 200 px в окне 720 px, обрезая этап посередине строки без признака
 * прокрутки. Ответ владельца на вопрос 3 квиза — 15.11.2026.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS } from '../src/components/cabinet/tokens.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const ui = readFileSync(path.join(SRC, 'components', 'cabinet', 'ui.tsx'), 'utf8');
const card = readFileSync(path.join(SRC, 'app', 'cabinet', 'projects', '[code]', 'page.tsx'), 'utf8');
const css = CABINET_CSS.replace(/\/\*[\s\S]*?\*\//gu, '');

describe('свёртки панели растут по содержимому (Н-1)', () => {
  it('обычная свёртка предела высоты и своей прокрутки не несёт', () => {
    assert.doesNotMatch(css, /\.cab-board-main \.cab-fold-body\{max-height:\d/u);
    assert.doesNotMatch(css, /\.cab-board-main \.cab-fold-body\{[^}]*overflow-y:auto/u);
  });

  it('окном читается только «История работы»', () => {
    assert.match(css, /\.cab-board-main \.cab-fold-tall\{max-height:340px;overflow-y:auto;scrollbar-gutter:stable\}/u);
  });
});

describe('план — по высоте соседней колонки (В-1)', () => {
  it('колонка плана помечена `follow`, и только она', () => {
    assert.match(card, /<BoardColumn\s+follow\s+title="План работ"/u);
    assert.equal((card.match(/<BoardColumn\b[^>]*?\bfollow\b/gu) ?? []).length, 1);
  });

  it('`follow`: высоту ряда задаёт соседняя колонка, нижний предел — 480 px', () => {
    assert.match(ui, /\.\.\.\(follow && !flow \? \{ contain: 'size', minHeight: BOARD_FOLLOW_MIN \} : \{\}\),/u);
    assert.match(ui, /export const BOARD_FOLLOW_MIN = 480;/u);
    assert.match(ui, /flex: fit \|\| flow \? '0 1 auto' : follow \? '1 1 0' : '1 1 auto',/u);
  });

  it('тело соседней колонки — не ниже 285 px: с шапкой и формой это те же 480 px', () => {
    assert.match(ui, /export const BOARD_BODY_MAX = 'max\(285px, min\(70vh, calc\(100dvh - 520px\)\)\)';/u);
    assert.match(ui, /: \{ maxHeight: BOARD_BODY_MAX, overflowY: 'auto' \}\),/u);
  });

  it('тень у кромки говорит, что колонка продолжается', () => {
    assert.match(css, /@media \(min-width:1025px\)\{\.cab-board-col>\.cab-board-body\{background:[^}]*local[^}]*scroll[^}]*\}\}/u);
  });

  it('на телефоне колонки идут страницей: пределы и привязка высоты сняты', () => {
    const narrow = /@media \(max-width:1024px\)\{[^\n]*/u.exec(css)?.[0] ?? '';
    assert.ok(narrow.includes('.cab-board-col{min-height:0!important;contain:none!important}'));
    assert.ok(narrow.includes('.cab-board-body{flex:0 1 auto!important;max-height:none!important;overflow:visible!important}'));
  });
});
