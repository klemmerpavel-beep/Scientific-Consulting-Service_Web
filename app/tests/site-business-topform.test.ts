/**
 * «Компаниям», форма первого экрана до 480 px — в один столбец (Р-930).
 * Сетка формы — две колонки: на 360—414 px «ФИО» и контакт стояли рядом,
 * по 154—180 px, и адрес почты при вводе не помещался. Меняется только вид:
 * состав, порядок полей и тексты согласий заморожены (CONTRIBUTING,
 * правило 2) и здесь же сверяются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const RULE = '@media (max-width:480px){.bp-topform{grid-template-columns:minmax(0,1fr)!important}.bp-topform>*{grid-column:auto!important}}';

/** Форма первого экрана макета: от тега с обработчиком submitTop до `</form>`. */
export function topForm(html: string): string {
  const start = html.indexOf('onSubmit="{{ submitTop }}"');
  assert.ok(start >= 0, 'формы первого экрана нет');
  const open = html.lastIndexOf('<form', start);
  return html.slice(open, html.indexOf('</form>', start));
}

describe('«Компаниям»: форма первого экрана до 480 px в один столбец (Р-930)', () => {
  const design = read('design', 'BusinessPage.dc.html');
  const form = topForm(design);

  it('у формы класс bp-topform, правило стоит в макете и в компоненте', () => {
    assert.match(form.slice(0, form.indexOf('>')), /class="bp-topform"/u);
    assert.ok(design.includes(RULE), 'в макете нет правила одного столбца');
    assert.ok(read('app', 'src', 'components', 'pages', 'BusinessPage.tsx').includes(RULE), 'в компоненте нет правила одного столбца');
  });

  it('состав и порядок полей прежние', () => {
    const names = [...form.matchAll(/<(?:input|select)\b[^>]*\bname="([^"]+)"/gu)].map((m) => m[1]);
    assert.deepEqual(names, ['company_website', 'name', 'contact', 'need', 'consent', 'terms']);
  });

  it('проба: форма без класса не проходит', () => {
    const probe = '<form onSubmit="{{ submitTop }}" style="display:grid"><input name="name"></form>';
    assert.doesNotMatch(topForm(probe).slice(0, topForm(probe).indexOf('>')), /class="bp-topform"/u);
  });
});
