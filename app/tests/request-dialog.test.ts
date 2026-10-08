/**
 * Заявка из шапки — окном поверх страницы (решение Р-484).
 *
 * Проверка по исходникам, как у благодарности (Р-406): окно смонтировано
 * на всех страницах, перехватывает только кнопку шапки, показывает нижнюю
 * форму своей страницы (поля и отправка прежние), размывает страницу,
 * закрывается крестиком, Esc и нажатием мимо, а после отправки уступает
 * место благодарности. Живая проверка в браузере — в описании решения.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const COMPONENT = read('app', 'src', 'components', 'RequestDialog.tsx');
const LAYOUT = read('app', 'src', 'app', 'layout.tsx');

describe('заявка из шапки — окном', () => {
  it('окно смонтировано в общем макете страниц', () => {
    assert.match(LAYOUT, /import RequestDialog from '\.\.\/components\/RequestDialog';/u);
    assert.match(LAYOUT, /<RequestDialog \/>/u);
  });

  it('перехватывается только ссылка «#request» в шапке, форма — нижняя форма страницы', () => {
    assert.match(COMPONENT, /closest\?\.\('a\[href="#request"\]'\)/u);
    assert.match(COMPONENT, /link\.closest\('header'\) === null\) return;/u);
    assert.match(COMPONENT, /document\.querySelector<HTMLFormElement>\('#request form'\)/u);
    // Своей формы у окна нет: ни полей, ни отправки.
    assert.doesNotMatch(COMPONENT, /<form|<input|fetch\(/u);
  });

  it('у каждой из четырёх страниц в шапке есть кнопка «#request» и форма в разделе заявки', () => {
    for (const page of ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage']) {
      const design = read('design', `${page}.dc.html`);
      const header = design.slice(design.indexOf('<header'), design.indexOf('</header>'));
      assert.match(header, /href="#request"/u, `${page}: в шапке нет кнопки заявки`);
      const section = design.slice(design.indexOf('<section id="request"'));
      assert.match(section.slice(0, section.indexOf('</section>')), /<form /u, `${page}: в разделе заявки нет формы`);
    }
  });

  it('страница за окном размыта, движение по дизайн-системе, уменьшенное движение учтено', () => {
    assert.match(COMPONENT, /backdrop-filter:blur\(6px\)/u);
    for (const ms of COMPONENT.matchAll(/(\d+)ms/gu)) {
      const value = Number(ms[1]);
      assert.ok(value >= 180 && value <= 260, `длительность ${value} мс вне 180—260`);
    }
    assert.match(COMPONENT, /@media \(prefers-reduced-motion:reduce\)/u);
  });

  it('закрывается крестиком 44 px, Esc и нажатием мимо; фокус держится в окне', () => {
    assert.match(COMPONENT, /\.pd-rq-close\{[^}]*width:44px;height:44px/u);
    assert.match(COMPONENT, /event\.key === 'Escape'/u);
    assert.match(COMPONENT, /veil\.addEventListener\('click', \(\) => shut\(true\)\)/u);
    assert.match(COMPONENT, /event\.key !== 'Tab'/u);
    assert.match(COMPONENT, /aria-modal/u);
  });

  it('после отправки окно закрывается и уступает благодарности; форма возвращается на место', () => {
    assert.match(COMPONENT, /window\.addEventListener\(LEAD_SENT_EVENT, onSent\)/u);
    assert.match(COMPONENT, /sent === open\.form\) shut\(false\)/u);
    assert.match(COMPONENT, /mark\.replaceWith\(form\)/u);
    // Слой ниже благодарности (45) и уведомления о cookies (50).
    const layers = [...COMPONENT.matchAll(/z-index:(\d+)/gu)].map((m) => Number(m[1]));
    assert.ok(layers.length > 0 && layers.every((z) => z < 45), `слои окна: ${layers.join(', ')}`);
  });
});
