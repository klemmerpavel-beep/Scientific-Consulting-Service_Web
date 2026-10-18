/**
 * Наведение на интерактивный блок (Р-628): блок поднимается на 5 px с тенью
 * наведения, синей рамки под курсором нет; при уменьшенном движении блок
 * стоит на месте. Вторичные кнопки-«пилюли» без рамки в покое (Р-627).
 * Проверка по исходникам: макет — источник правды, перенесённый код — то,
 * что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = [
  ['StartPage', 'StartPage'],
  ['MainPage', 'PostgradPage'],
  ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'],
  ['ExpertsPage', 'ExpertsPage'],
] as const;

/** Открывающие теги макета с атрибутом style-hover. */
function hoverTags(design: string): string[] {
  return [...design.matchAll(/<[a-z][a-z0-9-]*\b[^>]*\bstyle-hover="[^"]*"[^>]*>/gu)].map((m) => m[0]);
}

describe('интерактивные блоки поднимаются при наведении (Р-628)', () => {
  for (const [page, component] of PAGES) {
    it(`${page}: у карточек нет синей рамки под курсором`, () => {
      for (const tag of hoverTags(read('design', `${page}.dc.html`))) {
        const radius = tag.match(/\bstyle="[^"]*border-radius:(14px)/u);
        if (radius === null) continue;
        const hover = tag.match(/style-hover="([^"]*)"/u)![1];
        assert.doesNotMatch(hover, /border-color:var\(--pd-accent\)/u,
          `карточка с синей рамкой при наведении — нужен класс pd-lift: ${tag.slice(0, 160)}`);
      }
    });

    it(`${page}: правило pd-lift — 5 px, тень наведения, покой при уменьшенном движении`, () => {
      for (const source of [read('design', `${page}.dc.html`), read('app', 'src', 'components', 'pages', `${component}.tsx`)]) {
        assert.match(source, /\.pd-lift:hover,\.pd-lift:focus-visible\{transform:translateY\(-5px\)!important;box-shadow:0 10px 20px rgba\(20,22,28,\.09\)!important\}/u);
        assert.match(source, /@media \(prefers-reduced-motion:reduce\)\{html \.pd-lift\{transition:none!important\}html \.pd-lift:hover,html \.pd-lift:focus-visible\{transform:none!important\}\}/u);
      }
      assert.ok((read('design', `${page}.dc.html`).match(/\bclass="[^"]*\bpd-lift\b/gu) ?? []).length > 0, 'на странице нет ни одного блока pd-lift');
    });
  }
});

describe('вторичные кнопки без рамки в покое (Р-627)', () => {
  const buttons: [string, RegExp][] = [
    ['MainPage', /<button type="button" onClick="\{\{ toggleRevForm \}\}"[^>]*>/u],
    ['StudentsPage', /<button type="button" onClick="\{\{ toggleRevForm \}\}"[^>]*>/u],
    ['BusinessPage', /<button type="button" onClick="\{\{ toggleRevForm \}\}"[^>]*>/u],
    ['ExpertsPage', /<a href="#how"[^>]*>(?=Как устроена работа)/u],
  ];
  for (const [page, pattern] of buttons) {
    it(`${page}: рамка прозрачная в покое, цвета текста при наведении`, () => {
      const tag = read('design', `${page}.dc.html`).match(pattern);
      assert.ok(tag, 'кнопка не найдена в макете');
      assert.match(tag[0], /border:1px solid transparent;/u);
      assert.match(tag[0], /style-hover="border-color:var\(--pd-ink\)"/u);
    });
  }
});
