/**
 * Фото авторов отзывов (Р-590, Р-617). Отзывы настоящие, поэтому у карточки
 * может стоять только снимок, который прислал сам автор и на публикацию
 * которого он письменно согласился; без него остаётся инициал имени.
 * Проверка по исходникам: макет — источник правды, перенесённый код — то,
 * что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = [
  ['MainPage', 'PostgradPage'],
  ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'],
] as const;

/** Записи массива REVIEWS макета: каждая начинается с «{» в начале строки, порядок полей любой. */
function reviews(design: string): string[] {
  const start = design.indexOf('const REVIEWS = [');
  assert.ok(start >= 0, 'в макете нет массива REVIEWS');
  const end = design.indexOf('\n    ];', start);
  const entries = design.slice(start, end).split(/\n\s*\{(?=\s*\w+:)/u).slice(1);
  assert.ok(entries.length > 0, 'в массиве REVIEWS нет записей');
  return entries;
}

describe('фото авторов отзывов — только присланные ими с согласием (Р-590, Р-617)', () => {
  for (const [page, component] of PAGES) {
    it(`${page}: у фото есть дата согласия и файл в обеих папках ассетов`, () => {
      for (const entry of reviews(read('design', `${page}.dc.html`))) {
        const photo = entry.match(/photo: '([^']*)'/u);
        if (photo === null) continue;
        const [, src] = photo;
        assert.match(src, /^\.\/assets\/reviews\/[a-z0-9-]+\.webp$/u, `фото отзыва вне assets/reviews: ${src}`);
        assert.match(entry, /consent: '\d{2}\.\d{2}\.\d{4}'/u, `у фото ${src} нет даты согласия автора`);
        const file = src.replace(/^\.\/assets\//u, '');
        assert.ok(existsSync(path.join(ROOT, 'design', 'assets', file)), `нет design/assets/${file}`);
        assert.ok(existsSync(path.join(ROOT, 'app', 'public', 'assets', file)), `нет app/public/assets/${file}`);
      }
    });

    it(`${page}: без фото у карточки инициал`, () => {
      const design = read('design', `${page}.dc.html`);
      assert.match(design, /hasPhoto: Boolean\(r\.photo\),\n\s+noPhoto: !r\.photo,/u);
      assert.match(design, /<sc-if value="\{\{ r\.hasPhoto \}\}"[^>]*>\n<img src="\{\{ r\.photo \}\}" alt="" aria-hidden="true" width="56" height="56"/u);
      assert.match(design, /<sc-if value="\{\{ r\.noPhoto \}\}"[^>]*>\n<span aria-hidden="true"[^>]*>\{\{ r\.initial \}\}<\/span>/u);
      const code = read('app', 'src', 'components', 'pages', `${component}.tsx`);
      assert.match(code, /\{r\.hasPhoto \? \(<><img src=\{r\.photo\}/u);
      assert.match(code, /\{r\.noPhoto \? \(<><span aria-hidden="true"[^>]*>\{r\.initial\}<\/span>/u);
    });
  }

  it('подпись под отзывами не обещает, что фото нет', () => {
    for (const page of ['MainPage', 'StudentsPage']) {
      const design = read('design', `${page}.dc.html`);
      assert.doesNotMatch(design, /фамилии и фотографии — нет/u);
      assert.match(design, /фото — только с согласия автора/u);
    }
  });
});
