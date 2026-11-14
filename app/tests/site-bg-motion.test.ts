/**
 * Фон на всех содержательных страницах — как на «Экспертам» (Р-884, по
 * указанию владельца 13.11.2026: «фон сделать везде как на странице
 * экспертов, он здесь двигается уже»). Образец — Р-620: кольцо первого экрана
 * качается на ±30°, узлы на его кольцах парят на ±6 px за 5,5 с со сдвигом
 * фазы, на первом экране — сетка точек; «почти неподвижного» кольца ±3°
 * (pd-orb-calm, Р-625) больше нет. Только transform и opacity, при
 * уменьшенном движении всё стоит (Р-93), реакции на курсор нет (Р-43).
 * Проверка по исходникам: макет и перенесённый компонент.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = { StartPage: 'StartPage', MainPage: 'PostgradPage', StudentsPage: 'StudentsPage', BusinessPage: 'BusinessPage' } as const;
type Page = keyof typeof PAGES;
const design = (page: Page) => read('design', `${page}.dc.html`);
const both = (page: Page): Array<[string, string]> => [
  [`design/${page}.dc.html`, design(page)],
  [`${PAGES[page]}.tsx`, read('app', 'src', 'components', 'pages', `${PAGES[page]}.tsx`)],
];
/** Фоновый слой макета: первый блок aria-hidden до ссылки «Перейти к содержанию». */
const layer = (html: string) => {
  const at = html.indexOf('<div aria-hidden="true" style="position:absolute;inset:0;z-index:0;pointer-events:none');
  assert.ok(at > 0, 'нет фонового слоя');
  return html.slice(at, html.indexOf('class="pd-skip"', at));
};
/** Числа из ключевых кадров: размах покачивания и парения «Экспертам». */
const keyframes = (source: string, name: string) => {
  const m = source.match(new RegExp(`@keyframes ${name}\\{from\\{transform:(\\w+)\\((-?[\\d.]+)(deg|px)\\)\\}to\\{transform:\\w+\\((-?[\\d.]+)(?:deg|px)\\)\\}\\}`, 'u'));
  assert.ok(m, `нет ключевых кадров ${name}`);
  return { fn: m[1], from: Number(m[2]), to: Number(m[4]) };
};

describe('Р-884: фон четырёх страниц — как на «Экспертам»', () => {
  const experts = read('design', 'ExpertsPage.dc.html');

  it('размах и периоды — те же, что у образца: ±30° за 34 с; объёмных узлов нет (Р-888)', () => {
    const swing = keyframes(experts, 'ex-swing-hero');
    assert.ok(experts.includes('.ex-orb-hero{animation-name:ex-swing-hero;animation-duration:34s;animation-delay:-17s}'));
    // Р-888: парящие объёмные узлы остаются только на «Экспертам».
    assert.ok(experts.includes('.ex-node{animation:ex-float 5.5s ease-in-out infinite alternate}'));
    assert.ok((experts.match(/class="ex-node"/gu) ?? []).length >= 3, 'на «Экспертам» пропали узлы — образец Р-888');
    for (const page of Object.keys(PAGES) as Page[]) {
      for (const [where, source] of both(page)) {
        assert.deepEqual(keyframes(source, 'pd-swing-hero'), swing, `${where}: размах первого экрана не как на «Экспертам»`);
        // Р-888 (указание владельца 14.11.2026): объёмные картинки на фоне
        // отвлекают — узлов и их парения на четырёх страницах нет.
        assert.doesNotMatch(source, /pd-node|pd-float/u, `${where}: остались объёмные узлы фона`);
        for (const rule of [
          '.pd-orb-hero{animation-name:pd-swing-hero;animation-duration:34s;animation-delay:-17s}',
          '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
        ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 48)}…»`);
        assert.doesNotMatch(source, /pd-orb-calm|pd-swing-calm/u, `${where}: осталось «почти неподвижное» кольцо`);
      }
    }
  });

  it('на первом экране: кольцо pd-orb-hero и сетка точек, без объёмных узлов (Р-888)', () => {
    for (const page of Object.keys(PAGES) as Page[]) {
      const bg = layer(design(page));
      assert.match(bg, /^<div aria-hidden="true"[^>]*>\n<div class="pd-glow"[^>]*><\/div>\n<svg class="pd-orb pd-orb-hero" /u, `${page}: первым идёт не кольцо первого экрана`);
      const hero = bg.slice(bg.indexOf('<svg class="pd-orb pd-orb-hero"'), bg.indexOf('</svg>') + 6);
      const afterHero = bg.slice(bg.indexOf('</svg>') + 6);
      assert.match(afterHero, /^\n<div style="position:absolute;left:0;right:0;top:0;height:\d+px;background-image:radial-gradient\(var\(--pd-art-dot\) 1px,transparent 1\.2px\);background-size:34px 34px;opacity:\.4;/u, `${page}: нет сетки точек на первом экране`);
      assert.doesNotMatch(bg, /<img /u, `${page}: в фоновом слое — изображение (Р-888: объёмных картинок на фоне нет)`);
      // Точки — в пределах колец (от центра 330, 300 не дальше внешнего
      // кольца 262): угол и радиус подобраны так, чтобы дуга ±30° не заходила
      // под текст, кнопки и снимки (Р-884, дополнения после слияния).
      const dots = [...hero.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="\d+"/gu)].map((m) => Math.hypot(Number(m[1]) - 330, Number(m[2]) - 300));
      assert.equal(dots.length, 2, `${page}: точек на кольце первого экрана ${dots.length}`);
      for (const r of dots) assert.ok(r >= 99 && r <= 263, `${page}: точка вне колец (${r.toFixed(1)})`);
    }
  });
});
