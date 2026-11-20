/**
 * Сетки вместо каруселей при шести и меньше элементах на десктопе (решение
 * Р-961, ответ владельца 20.11.2026; аудит 16.11.2026, SKILL §9).
 *
 * - «Шесть шагов от заявки до защиты» на «Аспирантам»: от 769 px — сетка
 *   3 × 2 с промежутком 16 px, стрелки и полоса прогресса сняты, ряд
 *   меток-пилюль под линией снят, номера всех шагов — акцентом; до 768 px —
 *   прежняя лента, рамка стрелок — `--pd-border`.
 * - Отзывы на «Аспирантам», «Компаниям» (по три) и «Студентам» (пять): от
 *   1025 px — сетка в три колонки, все карточки резкие, без стрелок, «Написать
 *   отзыв» под сеткой; на «Студентам» второй ряд из двух — по центру, карточки
 *   той же ширины (уточнение владельца 21.11.2026); для читалки в сетке видны
 *   все карточки. До 1024 px —
 *   прежняя карусель с высотами Р-940 (`site-review-card-fit`).
 *
 * Проверка идёт и по макету, и по перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';


const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'], ['BusinessPage', 'BusinessPage']] as const;

export const STEP_GRID = '@media (min-width:769px){.pd-steps{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:1fr;overflow:visible!important;scroll-snap-type:none!important}.pd-steps-nav{display:none!important}}';
export const REVIEW_GRID = '@media (min-width:1025px){.pd-revstage{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:1fr;gap:16px;height:auto!important}'
  + '.pd-revstage>article{grid-column:span 2;position:static!important;left:auto!important;top:auto!important;width:auto!important;height:auto!important;min-height:236px;margin:0!important;'
  + 'transform:none!important;filter:none!important;opacity:1!important;pointer-events:auto!important;z-index:auto!important}'
  // неполный последний ряд — по центру, карточки той же ширины: два — со второй доли, один — с третьей
  + '.pd-revstage>article:nth-child(3n+1):nth-last-child(2){grid-column:2/span 2}.pd-revstage>article:nth-child(3n+1):last-child{grid-column:3/span 2}'
  + '.pd-revnav{display:none!important}}';

/** Число отзывов макета: записи массива REVIEWS с полем text (разбор — как в `site-review-card-fit`). */
function reviewCount(design: string): number {
  const start = design.indexOf('const REVIEWS = [');
  assert.ok(start >= 0, 'в макете нет массива REVIEWS');
  const body = design.slice(start, design.indexOf('\n    ];', start));
  return [...body.matchAll(/\btext:\s*'(?:[^'\\]|\\.)*'/gu)].length;
}

/** Раздел макета по id. */
function section(html: string, id: string): string {
  const at = html.indexOf(`<section id="${id}"`);
  assert.ok(at >= 0, `нет раздела #${id}`);
  return html.slice(at, html.indexOf('</section>', at));
}

describe('«Шесть шагов» на «Аспирантам» — сетка от 769 px (Р-961)', () => {
  const html = read('design', 'MainPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'PostgradPage.tsx');
  const process = section(html, 'process');

  it('правило сетки 3 × 2 стоит в макете и в компоненте; лента и ряд стрелок помечены классами', () => {
    assert.ok(html.includes(STEP_GRID), 'в макете нет правила сетки шагов');
    assert.ok(tsx.includes(STEP_GRID), 'в компоненте нет правила сетки шагов');
    assert.match(process, /<div data-carousel="process" class="pd-steps"[^>]*style="display:flex;gap:16px;/u, 'лента шагов без класса pd-steps или без промежутка 16 px');
    assert.match(process, /<div class="pd-steps-nav"[^>]*>[\s\S]*aria-label="Предыдущий шаг"[\s\S]*aria-label="Следующий шаг"/u, 'стрелки и полоса прогресса — не в .pd-steps-nav');
    assert.match(tsx, /className="pd-steps"/u);
  });

  it('шагов шесть — не больше, чем держит сетка; номера всех шагов — акцентом, меток-пилюль нет', () => {
    const at = html.indexOf('const stepData = [');
    const rows = html.slice(at, html.indexOf('];', at)).match(/\['0\d', /gu) ?? [];
    assert.equal(rows.length, 6);
    assert.match(process, /font-size:44px;[^"]*color:var\(--pd-accent\);/u, 'номер шага не акцентом');
    assert.doesNotMatch(html, /numColor|stepTags|\{\{ p\.tags \}\}/u, 'цвет номера по ленте или метки шагов вернулись');
  });

  it('до 768 px — лента со стрелками в рамке --pd-border; в сетке у ленты нет остановки Tab', () => {
    for (const label of ['Предыдущий шаг', 'Следующий шаг']) {
      assert.match(process, new RegExp(`aria-label="${label}"[^>]*border:1px solid var\\(--pd-border\\)`, 'u'), `${label}: рамка не --pd-border`);
    }
    assert.match(process, /tabindex="\{\{ stepTab \}\}"/u);
    assert.match(html, /stepTab: this\.state\.stepsWide \? undefined : 0/u);
    assert.match(html, /matchMedia\('\(min-width:769px\)'\)/u);
  });
});

describe('отзывы — сетка от 1025 px на трёх страницах (Р-961)', () => {
  for (const [page, component] of PAGES) {
    const html = read('design', `${page}.dc.html`);
    const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);

    it(`${page}: правило сетки в три колонки в макете и в компоненте`, () => {
      assert.ok(html.includes(REVIEW_GRID), 'в макете нет правила сетки отзывов');
      assert.ok(tsx.includes(REVIEW_GRID), 'в компоненте нет правила сетки отзывов');
    });

    it(`${page}: в сетке три карточки в ряд, неполный последний ряд — по центру (Р-961)`, () => {
      // шесть долей, карточка — две: ширина карточки та же, что при трёх колонках
      assert.match(REVIEW_GRID, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/u);
      assert.match(REVIEW_GRID, /\.pd-revstage>article\{grid-column:span 2;/u);
      const n = reviewCount(html);
      const last = n % 3;
      const start = last === 2 ? 2 : last === 1 ? 3 : 0;
      if (start) assert.ok(REVIEW_GRID.includes(`:nth-child(3n+1):${last === 2 ? 'nth-last-child(2)' : 'last-child'}{grid-column:${start}/span 2}`), `${n} отзывов: последний ряд из ${last} не центрован`);
      if (page === 'StudentsPage') assert.equal(n, 5, 'на «Студентам» пять отзывов: 3 + 2');
    });

    it(`${page}: отзывов не больше шести — правило сетки применимо`, () => {
      const n = reviewCount(html);
      assert.ok(n >= 3 && n <= 6, `отзывов ${n}: при семи и больше — карусель и на десктопе (DESIGN-SYSTEM §7)`);
    });

    it(`${page}: стрелки — в .pd-revnav, «Написать отзыв» — под сеткой; в сетке читалка видит все карточки`, () => {
      const reviews = section(html, 'reviews');
      const stage = reviews.indexOf('<div class="pd-revstage"');
      const nav = reviews.indexOf('<div class="pd-revnav"');
      const write = reviews.search(/onClick="\{\{ toggleRevForm \}\}"/u);
      assert.ok(stage > 0 && nav > stage && write > nav, 'порядок: сетка → стрелки → «Написать отзыв»');
      assert.match(reviews.slice(nav, write), /onClick="\{\{ revPrev \}\}"[\s\S]*onClick="\{\{ revNext \}\}"/u);
      assert.match(reviews, /aria-roledescription="\{\{ revRoleDesc \}\}"/u);
      assert.match(html, /hidden: a === 0 \|\| this\.state\.revWide \? undefined : 'true'/u);
      assert.match(html, /revRoleDesc: this\.state\.revWide \? undefined : 'карусель'/u);
      assert.match(html, /matchMedia\('\(min-width:1025px\)'\)/u);
    });
  }
});
