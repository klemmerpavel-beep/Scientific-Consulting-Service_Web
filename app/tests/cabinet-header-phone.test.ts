/**
 * Шапка кабинета на телефоне (задача ВК-К09, решение Р-754).
 *
 * На 390 px шапка занимала 293 px из 844: вордмарк, две строки меню и
 * отдельная строка «роль + Выйти». До 480 px «Выйти» стоит в строке
 * вордмарка справа, отступы шапки — 12 px, строки меню — через 8 px;
 * подпись роли клиенту не выводится, у сотрудников остаётся, если
 * помещается. Состав, порядок и подписи меню прежние (Р-573), раскладка —
 * классом с `!important` (Р-25, Р-33), цели — 44 px (Р-57). Шире 480 px
 * шапка не меняется: правила живут только в медиазапросе.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS } from '../src/components/cabinet/tokens.ts';
import { navFor } from '../src/lib/cabinet/nav.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';

const SHELL = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'Shell.tsx'),
  'utf8',
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '');

/** Тела медиазапросов `@media (<условие>){…}` листа кабинета, без комментариев. */
function mediaBlocks(css: string, condition: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const head = `@media ${condition}{`;
  const out: string[] = [];
  for (let at = clean.indexOf(head); at !== -1; at = clean.indexOf(head, at + 1)) {
    let depth = 1;
    let i = at + head.length;
    for (; i < clean.length && depth > 0; i += 1) {
      if (clean[i] === '{') depth += 1;
      else if (clean[i] === '}') depth -= 1;
    }
    out.push(clean.slice(at + head.length, i - 1));
  }
  return out;
}

/** Объявления правила с данным селектором внутри тела. */
function rule(body: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const found = new RegExp(`(?:^|\\})${escaped}\\{([^}]*)\\}`, 'u').exec(body);
  assert.ok(found, `правило ${selector} есть в медиазапросе до 480 px`);
  return found[1]!;
}

const PHONE = mediaBlocks(CABINET_CSS, '(max-width:480px)').join('}');
const OUTSIDE = (() => {
  const clean = CABINET_CSS.replace(/\/\*[\s\S]*?\*\//gu, '');
  let rest = clean;
  for (const block of mediaBlocks(clean, '(max-width:480px)')) rest = rest.replace(block, '');
  return rest;
})();

describe('шапка на телефоне — до 480 px', () => {
  it('отступы шапки сверху и снизу и промежуток между строками — 12 px', () => {
    const head = rule(PHONE, '.cab-head');
    assert.match(head, /padding-top:12px!important/u);
    assert.match(head, /padding-bottom:12px!important/u);
    assert.match(head, /row-gap:12px!important/u);
  });

  it('строки меню — через 8 px', () => {
    assert.match(rule(PHONE, '.cab-nav>ul'), /row-gap:8px!important/u);
  });

  it('«Выйти» — в строке вордмарка справа, меню — строками ниже', () => {
    const exit = rule(PHONE, '.cab-exit');
    assert.match(exit, /order:1!important/u);
    assert.match(exit, /margin-left:auto!important/u);
    assert.match(rule(PHONE, '.cab-head>.cab-nav'), /order:2!important;flex:0 0 100%!important/u);
  });

  it('у формы «Выйти» нет заданной высоты и среза: при крупном шрифте кнопка уходит на свою строку целиком (WCAG 1.4.4)', () => {
    const exit = rule(PHONE, '.cab-exit');
    assert.doesNotMatch(exit, /height:/u);
    assert.doesNotMatch(exit, /overflow:/u);
    assert.doesNotMatch(exit, /flex:1 1 0/u);
  });

  it('подпись роли на телефоне не выводится ни у кого — и читалка не слышит срезанного текста', () => {
    assert.match(rule(PHONE, '.cab-role'), /display:none!important/u);
    assert.match(SHELL, /className="cab-role"/u);
  });

  it('каждое правило раскладки — с !important (Р-25, Р-33)', () => {
    for (const selector of ['.cab-head', '.cab-head>.cab-nav', '.cab-nav>ul', '.cab-exit', '.cab-role']) {
      for (const decl of rule(PHONE, selector).split(';').filter(Boolean)) {
        assert.match(decl, /!important$/u, `${selector}: ${decl}`);
      }
    }
  });
});

describe('шапка: классы в каркасе, шире 480 px — без изменений', () => {
  it('строка шапки, меню и форма выхода несут классы раскладки', () => {
    assert.match(SHELL, /className="cab-pad cab-head"/u);
    assert.match(SHELL, /<nav className="cab-nav"/u);
    assert.match(SHELL, /action="\/cabinet\/exit"\s+method="post"\s+className="cab-exit"/u);
  });

  it('прежние отступы шапки и меню остались в атрибуте style', () => {
    assert.match(SHELL, /padding: `24px \$\{GUTTER\}px`/u);
    assert.match(SHELL, /gap: 24,/u);
    assert.match(SHELL, /gap: 20,/u);
  });

  it('вне медиазапроса до 480 px у классов шапки правил нет', () => {
    assert.doesNotMatch(OUTSIDE, /\.cab-(?:head|exit|role)\b/u);
  });

  it('состав и порядок меню прежние', () => {
    const actor = (role: Actor['role']) => ({ id: 'u', role, name: 'Тест', email: 't@e.st' }) as unknown as Actor;
    assert.deepEqual(
      navFor(actor('CLIENT')).map((item) => item.label),
      ['Мои работы', 'Новая заявка', 'Материалы', 'Настройки'],
    );
    assert.deepEqual(
      navFor(actor('EXPERT')).map((item) => item.label),
      ['Назначенные работы', 'Вознаграждение', 'Управление', 'Настройки'],
    );
  });
});
