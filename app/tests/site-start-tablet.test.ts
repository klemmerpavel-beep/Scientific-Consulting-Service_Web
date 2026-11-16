/**
 * Посадочная на планшете, 481—1100 px (Р-949). До правки: три карточки
 * направлений стояли 2 + 1 с пустой ячейкой; три плашки с цифрами на 1024 px
 * — колонками по 145 px, текст по слову в строке; портреты на 768 px —
 * по краям с пустотой около 400 px; согласия формы заявки — рядом с узким
 * полем почты. Меняется только раскладка: состав и порядок полей формы
 * заморожены (CONTRIBUTING, правило 2) и сверяются здесь же.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const RULES = [
  '@media (min-width:701px) and (max-width:1024px){.pd-routes{grid-template-columns:repeat(3,minmax(0,1fr))!important}}',
  '@media (min-width:481px) and (max-width:700px){.pd-routes{grid-template-columns:minmax(0,1fr)!important}.pd-routebg,.pd-routebg *{height:240px!important}}',
  '@media (min-width:769px) and (max-width:1100px){.pd-metrics{grid-template-columns:minmax(0,1fr)!important}.pd-metrics>a{min-height:0!important}}',
  '@media (min-width:481px) and (max-width:768px){.pd-metrics>a:last-child{grid-column:1/-1}}',
  '@media (max-width:768px){.pd-roles{justify-content:center!important;gap:40px!important}.pd-bform>div:not([role]){flex:1 1 100%}}',
];

/** Форма заявки внизу страницы: от тега с обработчиком submitBottom до `</form>`. */
export function bottomForm(html: string): string {
  const at = html.indexOf('onSubmit="{{ submitBottom }}"');
  assert.ok(at >= 0, 'формы заявки нет');
  return html.slice(html.lastIndexOf('<form', at), html.indexOf('</form>', at));
}

describe('посадочная на планшете (Р-949)', () => {
  const design = read('design', 'StartPage.dc.html');

  it('пять правил раскладки стоят в макете и в компоненте', () => {
    const tsx = read('app', 'src', 'components', 'pages', 'StartPage.tsx');
    for (const rule of RULES) {
      assert.ok(design.includes(rule), `в макете нет правила: ${rule}`);
      assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
    }
  });

  it('ряд портретов и форма заявки несут свои классы', () => {
    assert.match(design, /<div class="pd-roles" style="display:flex;align-items:flex-start;justify-content:space-between/u);
    assert.match(bottomForm(design).slice(0, 80), /^<form class="pd-bform" /u);
  });

  it('состав и порядок полей формы заявки прежние', () => {
    const names = [...bottomForm(design).matchAll(/<(?:input|select)\b[^>]*\bname="([^"]+)"/gu)].map((m) => m[1]);
    assert.deepEqual(names, ['company_website', 'direction', 'name', 'contact', 'consent', 'terms']);
  });

  it('проба: форма без класса не проходит', () => {
    assert.doesNotMatch(bottomForm('<form style="x" onSubmit="{{ submitBottom }}"></form>').slice(0, 80), /^<form class="pd-bform" /u);
  });
});
