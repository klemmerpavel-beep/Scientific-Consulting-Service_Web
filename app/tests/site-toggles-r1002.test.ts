/**
 * Переключатели `aria-pressed` — одно исполнение на всех страницах (Р-1002,
 * указание владельца 22.11.2026, С-9.3: «переключатели 14 px»).
 *
 * Способ связи «E-mail / Телефон» в формах посадочной, «Аспирантам»,
 * «Студентам», «Компаниям» и вид источника на «Инструментах» набраны как на
 * посадочной: Inter 14 px / 1.5 / 600, поля `0 20px`, высота не ниже 44 px,
 * выбранный — `--pd-ink` с белым текстом, остальные — прозрачные
 * `--pd-ink-muted`. До Р-1002 — 13 px / 1.4 на четырёх страницах и поля
 * `0 18px` на «Инструментах». Поля форм не меняются (152-ФЗ): правится
 * только вид кнопок переключателя.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [
  ['StartPage', 'StartPage', 2], ['MainPage', 'PostgradPage', 2], ['StudentsPage', 'StudentsPage', 2],
  ['BusinessPage', 'BusinessPage', 2], ['ToolsPage', 'ToolsPage', 1],
] as const;
const TYPE = "font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.5;font-weight:600";
const BOX = 'border-radius:999px;padding:0 20px;min-height:44px;display:inline-flex;align-items:center;justify-content:center';

/** Группы переключателей макета: [подпись группы, [[aria-pressed, style]…]]. */
export function toggleGroups(html: string): Array<[string, Array<[string, string]>]> {
  return [...html.matchAll(/<div role="group" aria-label="((?:Способ связи|Вид источника)[^"]*)"[^>]*>([\s\S]*?)<\/sc-for>/gu)].map((g) => [
    g[1],
    [...g[2].matchAll(/<button type="button" aria-pressed="(true|false)" onClick="\{\{ c\.pick \}\}" style="([^"]*)"/gu)].map((b) => [b[1], b[2]]),
  ]);
}

describe('переключатели aria-pressed: 14 px, как на посадочной (Р-1002)', () => {
  const styles = { true: new Set<string>(), false: new Set<string>() };

  for (const [page, component, count] of PAGES) {
    const html = read('design', `${page}.dc.html`);
    const groups = toggleGroups(html);

    it(`${page}: ${count} группы, кнопки 14 px / 1.5, поля 0 20px, 44 px`, () => {
      assert.equal(groups.length, count, 'число групп переключателей');
      for (const [label, buttons] of groups) {
        assert.deepEqual(buttons.map(([p]) => p), ['true', 'false'], `${label}: нужны выбранная и невыбранная кнопки`);
        for (const [pressed, style] of buttons) {
          assert.ok(style.includes(TYPE), `${label}, aria-pressed=${pressed}: текст не 14 px / 1.5 / 600`);
          assert.ok(style.includes(BOX), `${label}, aria-pressed=${pressed}: поля или высота не как на посадочной`);
          styles[pressed as 'true' | 'false'].add(style);
        }
      }
    });

    it(`${page}: компонент перенесён`, () => {
      const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);
      const buttons = [...tsx.matchAll(/aria-pressed="(?:true|false)" onClick=\{c\.pick\} style=\{\{([^{}]*)\}\}/gu)].map((m) => m[1]);
      assert.equal(buttons.length, count * 2);
      for (const b of buttons) {
        assert.match(b, /padding: "0 20px", minHeight: "44px"/u);
        assert.match(b, /fontSize: "14px", lineHeight: "1\.5", fontWeight: "600"/u);
      }
    });
  }

  it('одно исполнение: у выбранной и у невыбранной кнопки по одному стилю на все страницы', () => {
    assert.equal(styles.true.size, 1, [...styles.true].join('\n'));
    assert.equal(styles.false.size, 1, [...styles.false].join('\n'));
  });

  it('проба: прежнее исполнение 13 px не проходит', () => {
    const probe = '<div role="group" aria-label="Способ связи" style="x"><sc-for list="{{ a }}" as="c"><button type="button" aria-pressed="true" onClick="{{ c.pick }}" style="font-size:13px;line-height:1.4"></button></sc-for>';
    const [[, [[, style]]]] = toggleGroups(probe);
    assert.equal(style.includes(TYPE), false);
  });
});
