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

  it('размах и периоды — те же, что у образца: ±30° за 34 с, парение ±6 px за 5,5 с', () => {
    const swing = keyframes(experts, 'ex-swing-hero');
    const float = keyframes(experts, 'ex-float');
    assert.ok(experts.includes('.ex-orb-hero{animation-name:ex-swing-hero;animation-duration:34s;animation-delay:-17s}'));
    assert.ok(experts.includes('.ex-node{animation:ex-float 5.5s ease-in-out infinite alternate}'));
    for (const page of Object.keys(PAGES) as Page[]) {
      for (const [where, source] of both(page)) {
        assert.deepEqual(keyframes(source, 'pd-swing-hero'), swing, `${where}: размах первого экрана не как на «Экспертам»`);
        assert.deepEqual(keyframes(source, 'pd-float'), float, `${where}: парение узлов не как на «Экспертам»`);
        for (const rule of [
          '.pd-orb-hero{animation-name:pd-swing-hero;animation-duration:34s;animation-delay:-17s}',
          '.pd-node{animation:pd-float 5.5s ease-in-out infinite alternate}',
          '.pd-node:nth-of-type(2){animation-delay:-1.4s}.pd-node:nth-of-type(3){animation-delay:-2.8s}.pd-node:nth-of-type(4){animation-delay:-4.2s}',
          // Узлы — от 1200 px, как на «Экспертам» (Р-598).
          '@media (max-width:1199px){.pd-node{display:none!important}}',
          '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
        ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 48)}…»`);
        assert.doesNotMatch(source, /pd-orb-calm|pd-swing-calm/u, `${where}: осталось «почти неподвижное» кольцо`);
      }
    }
  });

  it('на первом экране: кольцо pd-orb-hero, сетка точек и узлы на кольцах — декоративные', () => {
    for (const page of Object.keys(PAGES) as Page[]) {
      const bg = layer(design(page));
      assert.match(bg, /^<div aria-hidden="true"[^>]*>\n<div class="pd-glow"[^>]*><\/div>\n<svg class="pd-orb pd-orb-hero" /u, `${page}: первым идёт не кольцо первого экрана`);
      const hero = bg.slice(bg.indexOf('<svg class="pd-orb pd-orb-hero"'), bg.indexOf('</svg>') + 6);
      const afterHero = bg.slice(bg.indexOf('</svg>') + 6);
      assert.match(afterHero, /^\n<div style="position:absolute;left:0;right:0;top:0;height:\d+px;background-image:radial-gradient\(var\(--pd-art-dot\) 1px,transparent 1\.2px\);background-size:34px 34px;opacity:\.4;/u, `${page}: нет сетки точек на первом экране`);
      const nodes = [...bg.matchAll(/<span class="pd-node" style="position:absolute;left:calc\(50% [+-] \d+px\);top:\d+px;width:96px;height:96px;margin:-48px 0 0 -48px;display:block"><img src="\.\/assets\/art\/([a-z0-9-]+)\.webp" alt="" width="96" height="96" decoding="async"[^>]*><\/span>/gu)].map((m) => m[1]);
      assert.ok(nodes.length >= 3 && nodes.length <= 4, `${page}: узлов ${nodes.length}`);
      assert.equal(new Set(nodes).size, nodes.length, `${page}: изображение узла повторено`);
      assert.equal((bg.match(/class="pd-node"/gu) ?? []).length, nodes.length, `${page}: узел другого устройства`);
      // Точки — в пределах колец (от центра 330, 300 не дальше внешнего
      // кольца 262): угол и радиус подобраны так, чтобы дуга ±30° не заходила
      // под текст, кнопки и снимки (Р-884, дополнения после слияния).
      const dots = [...hero.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="\d+"/gu)].map((m) => Math.hypot(Number(m[1]) - 330, Number(m[2]) - 300));
      assert.equal(dots.length, 2, `${page}: точек на кольце первого экрана ${dots.length}`);
      for (const r of dots) assert.ok(r >= 99 && r <= 263, `${page}: точка вне колец (${r.toFixed(1)})`);
    }
  });
});
