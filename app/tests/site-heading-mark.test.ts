/**
 * Подсветка в заголовках (Р-32, Р-614, Р-927). Кегельная площадка Literata
 * выше интерлиньяжа заголовка, поэтому фон подсвеченной строки заходит на
 * соседние строки. Буквы строки выше и ниже спасает `mix-blend-mode:
 * multiply` (Р-614); буквы самого подсвеченного фрагмента, когда он занимает
 * две строки, — вложенный `position: relative`: текст рисуется после фона
 * всех строк фрагмента. Без него фон второй строки срезал выносные элементы
 * первой («аспирантов» на «Аспирантам», 1440 и 390 px).
 * Проверка по исходникам: макет — источник правды, компонент — то, что
 * уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PAGES = ['StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage', 'ToolsPage'] as const;
const COMPONENT: Record<(typeof PAGES)[number], string> = {
  StartPage: 'StartPage', MainPage: 'PostgradPage', StudentsPage: 'StudentsPage',
  BusinessPage: 'BusinessPage', ExpertsPage: 'ExpertsPage', ToolsPage: 'ToolsPage',
};

/** Подсвеченные фрагменты заголовков h1 и h2 макета: [стиль, содержимое]. */
export function marks(html: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const head of html.matchAll(/<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    for (const span of head[2].matchAll(/<span(?: class="[^"]*")? style="([^"]*background:var\(--pd-accent-mark\)[^"]*)">([\s\S]*?)<\/span>/g)) {
      found.push([span[1], span[2]]);
    }
  }
  return found;
}

describe('подсветка в заголовках не закрывает буквы (Р-927)', () => {
  for (const page of PAGES) {
    const html = readFileSync(path.join(ROOT, 'design', `${page}.dc.html`), 'utf8');
    const list = marks(html);

    it(`${page}: подсвеченный заголовок найден`, () => {
      assert.ok(list.length >= 1, 'в макете нет подсветки в h1 или h2 — проверка ничего не охраняет');
    });

    it(`${page}: фон умножением, текст поверх фона`, () => {
      for (const [style, inner] of list) {
        assert.match(style, /mix-blend-mode:multiply/, `подсветка без multiply: ${inner.slice(0, 40)}`);
        assert.match(style, /box-decoration-break:clone/, `подсветка без clone: ${inner.slice(0, 40)}`);
        assert.ok(inner.startsWith('<span style="position:relative">'), `текст подсветки не поднят над фоном: ${inner.slice(0, 40)}`);
      }
    });

    it(`${page}: компонент перенесён с тем же приёмом`, () => {
      const tsx = readFileSync(path.join(ROOT, 'app', 'src', 'components', 'pages', `${COMPONENT[page]}.tsx`), 'utf8');
      const lifted = tsx.match(/mixBlendMode: ?["']multiply["'][^>]*>\s*<span style=\{\{ ?position: ?["']relative["'] ?\}\}>/g) ?? [];
      assert.ok(lifted.length >= list.length, `в компоненте ${lifted.length} поднятых подсветок, в макете ${list.length}`);
    });
  }

  it('проба: подсветка без вложенного слоя не проходит', () => {
    const probe = '<h1 style="x"><span style="background:var(--pd-accent-mark);mix-blend-mode:multiply;box-decoration-break:clone">две строки</span></h1>';
    const [[, inner]] = marks(probe);
    assert.equal(inner.startsWith('<span style="position:relative">'), false);
  });
});
