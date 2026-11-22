/**
 * Подсветка в h1 и h2 шести страниц — одно исполнение (Р-1004, указание
 * владельца 22.11.2026, С-9.3: «одно оформление выделения в заголовках»;
 * DESIGN-SYSTEM §3.4, Р-614, Р-939).
 *
 * Фон `--pd-accent-mark`, радиус 6, поля 2 px по вертикали и ни одного
 * бокового поля: фон выносится за текст тенью ±.1em, `mix-blend-mode:
 * multiply`, `box-decoration-break: clone`. Тень — в единицах шрифта и уже
 * межсловного пробела Literata (.185—.188em при трекинге h1 и h2): соседнее
 * слово в строке не касается подсветки ни на одной ширине. Первая редакция
 * Р-1004 ставила ±10 px — тень шире пробела заходила на «диссертацию» в h2
 * «Аспирантам» (1440) и на «по» в h1 «Инструментов» (390), приёмка
 * 22.11.2026 её не приняла. Добавка `white-space: nowrap`
 * допустима (h1 «Экспертам» и «Инструментов»: фрагмент не рвётся). До
 * Р-1004 исполнений было пять: ±8 px (h1 и h2 «Аспирантам», h2
 * «Студентам»), без вертикальных полей (h1 «Студентам», «Компаниям»),
 * боковые поля 10 и 6 px без тени (h1 «Экспертам», «Инструментов»).
 * Число подсветок на странице прежнее (Р-32): h1 и не больше одного h2.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const MARK = 'var(--pd-accent-mark)';
export const CANON = `background:${MARK};border-radius:6px;padding:2px 0;box-shadow:-.1em 0 0 ${MARK},.1em 0 0 ${MARK};mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone`;
const PAGES = [
  ['StartPage', 'StartPage', 1], ['MainPage', 'PostgradPage', 2], ['StudentsPage', 'StudentsPage', 2],
  ['BusinessPage', 'BusinessPage', 2], ['ExpertsPage', 'ExpertsPage', 1], ['ToolsPage', 'ToolsPage', 1],
] as const;

/** Подсвеченные фрагменты h1 и h2 макета: [стиль, содержимое] (как в `site-heading-mark`). */
export function marks(html: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const head of html.matchAll(/<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    for (const span of head[2].matchAll(/<span(?: class="[^"]*")? style="([^"]*background:var\(--pd-accent-mark\)[^"]*)">([\s\S]*?)<\/span>/g)) {
      found.push([span[1], span[2]]);
    }
  }
  return found;
}

/** Исполнение подсветки по канону §3.4 (с допустимой добавкой nowrap). */
export const canonical = (style: string) => style === CANON || style === `${CANON};white-space:nowrap`;

describe('подсветка в заголовках — одно исполнение §3.4 (Р-1004)', () => {
  for (const [page, component, count] of PAGES) {
    const list = marks(read('design', `${page}.dc.html`));

    it(`${page}: ${count} подсветки, все по канону`, () => {
      assert.equal(list.length, count, 'число подсветок изменилось (Р-32)');
      for (const [style, inner] of list) assert.ok(canonical(style), `подсветка вне канона: ${style} — ${inner.slice(0, 60)}`);
    });

    it(`${page}: компонент перенесён`, () => {
      const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);
      const spans = [...tsx.matchAll(/style=\{\{ background: "var\(--pd-accent-mark\)"([^{}]*)\}\}/gu)].map((m) => m[1]).filter((s) => s.includes('mixBlendMode'));
      assert.equal(spans.length, count);
      for (const s of spans) {
        assert.match(s, /^, borderRadius: "6px", padding: "2px 0", boxShadow: "-\.1em 0 0 var\(--pd-accent-mark\),\.1em 0 0 var\(--pd-accent-mark\)", mixBlendMode: "multiply"/u);
      }
    });
  }

  it('проба: прежние исполнения не проходят', () => {
    for (const old of [
      `background:${MARK};border-radius:6px;padding:0 10px;white-space:nowrap;mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone`,
      `background:${MARK};border-radius:6px;box-shadow:-10px 0 0 ${MARK},10px 0 0 ${MARK};mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone`,
      `background:${MARK};border-radius:6px;padding:2px 0;box-shadow:-8px 0 0 ${MARK},8px 0 0 ${MARK};mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone`,
      `background:${MARK};border-radius:6px;padding:2px 0;box-shadow:-10px 0 0 ${MARK},10px 0 0 ${MARK};mix-blend-mode:multiply;box-decoration-break:clone;-webkit-box-decoration-break:clone`,
    ]) assert.equal(canonical(old), false, old);
  });

  it('тень в единицах шрифта и уже межсловного пробела Literata (.185em), с зазором не меньше .06em', () => {
    const side = CANON.match(/box-shadow:-([\d.]+)em 0 0 /u);
    assert.ok(side, 'боковая тень не в em: в пикселях она шире пробела мелкого кегля');
    assert.ok(Number(side[1]) <= 0.185 - 0.06, `тень ${side[1]}em — до соседнего слова меньше .06em`);
  });
});
