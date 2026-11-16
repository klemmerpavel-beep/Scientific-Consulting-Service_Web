/**
 * Карточка отзыва вмещает текст на узком экране (Р-940). Карточки стоят
 * стопкой в сцене фиксированной высоты (переход Р-106), поэтому высоту
 * задаёт макет, а не содержимое. На 360 px карточка шириной 84vw держит
 * семь строк отзыва, на 320 px — восемь: прежние 236 px до 430 px были малы,
 * последняя строка отзыва выходила за рамку («Студентам», 360 px).
 * Проверка по исходникам: правило высоты стоит в трёх макетах и компонентах,
 * а самый длинный отзыв не длиннее того, на что высота рассчитана.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'], ['BusinessPage', 'BusinessPage']] as const;

/** Замер 16.11.2026: отзыв в 170 знаков занимает 269 px на 360 px и 292 px на 320 px. */
const LONGEST = 175;
const RULES = [
  '@media (max-width:430px){.pd-revstage{height:304px!important}.pd-revstage>article{height:272px!important}}',
  '@media (max-width:340px){.pd-revstage{height:328px!important}.pd-revstage>article{height:296px!important}}',
];

/** Тексты отзывов макета: поле text записей массива REVIEWS, порядок полей любой. */
export function texts(design: string): string[] {
  const start = design.indexOf('const REVIEWS = [');
  assert.ok(start >= 0, 'в макете нет массива REVIEWS');
  const body = design.slice(start, design.indexOf('\n    ];', start));
  return [...body.matchAll(/\btext:\s*'((?:[^'\\]|\\.)*)'/gu)].map((m) => m[1]);
}

describe('карточка отзыва вмещает текст на узком экране (Р-940)', () => {
  for (const [page, component] of PAGES) {
    const design = read('design', `${page}.dc.html`);

    it(`${page}: высота сцены и карточки до 430 и до 340 px`, () => {
      const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);
      for (const rule of RULES) {
        assert.ok(design.includes(rule), `в макете нет правила: ${rule}`);
        assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
      }
      assert.match(design, /class="pd-revstage"[^>]*style="position:relative;height:268px/u, 'высота сцены на широком экране изменилась — пересчитайте правила');
    });

    it(`${page}: самый длинный отзыв — не длиннее ${LONGEST} знаков`, () => {
      const list = texts(design);
      assert.ok(list.length >= 3, 'отзывы не разобраны');
      for (const text of list) {
        assert.ok(text.length <= LONGEST, `отзыв в ${text.length} знаков не поместится в карточку на 320—360 px: поднимите высоты правил Р-940 и порог. «${text.slice(0, 40)}…»`);
      }
    });
  }

  it('проба: разбор находит длинный отзыв независимо от порядка полей', () => {
    const probe = `const REVIEWS = [\n      { text: '${'я'.repeat(LONGEST + 1)}', name: 'Проба' },\n      { name: 'Вторая', text: 'коротко' },\n    ];`;
    const list = texts(probe);
    assert.equal(list.length, 2);
    assert.ok(list[0].length > LONGEST);
  });
});
