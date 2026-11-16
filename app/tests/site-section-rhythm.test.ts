/**
 * Ритм разделов профильных страниц (Р-950). Замечание владельца 15.11.2026:
 * «между блоками … на каждой странице увеличить расстояние на 10—15 %,
 * чтобы они не были слипнутые; элементы в самих блоках не менять». Отступ
 * раздела — `clamp(80px, 8vw, 126px)` вместо `clamp(72px, 7vw, 112px)`:
 * +11 % до 1000 px, +14 % на 1440 px, +12,5 % на 1920 px. Посадочная держит
 * свой ритм в пикселях (Р-946, `site-start-rhythm`).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PAGES = [['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'], ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage']] as const;
const RHYTHM = 'margin:clamp(80px,8vw,126px) auto 0';

/** Верхние отступы разделов внутри <main>, кроме первого экрана. */
export function margins(html: string): string[] {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return [...main.matchAll(/<section\b[^>]*style="([^"]*)"/gu)].slice(1).map(([, style]) => /(?:^|;)(margin:[^;]+)/u.exec(style)?.[1] ?? '');
}

describe('ритм разделов профильных страниц (Р-950)', () => {
  for (const [page, component] of PAGES) {
    it(`${page}: у каждого раздела после первого экрана — новый отступ`, () => {
      const design = readFileSync(path.join(ROOT, 'design', `${page}.dc.html`), 'utf8');
      const list = margins(design);
      assert.ok(list.length >= 8, `разделов найдено ${list.length} — разбор не сработал`);
      for (const margin of list) assert.equal(margin, RHYTHM);
      assert.doesNotMatch(design, /clamp\(72px,7vw,112px\)/u, 'в макете остался прежний ритм');
      assert.doesNotMatch(readFileSync(path.join(ROOT, 'app', 'src', 'components', 'pages', `${component}.tsx`), 'utf8'), /clamp\(72px,7vw,112px\)/u, 'в компоненте остался прежний ритм');
    });
  }

  it('проба: раздел с прежним отступом не проходит', () => {
    const probe = '<main><section style="padding:0"></section><section style="position:relative;margin:clamp(72px,7vw,112px) auto 0;padding:0 30px"></section></main>';
    assert.notEqual(margins(probe)[0], RHYTHM);
  });
});
