/**
 * Метки верхнего регистра на шести страницах — одно исполнение (Р-1001,
 * указание владельца 22.11.2026, С-9.3: «интервал букв в подписях над
 * заголовками»; канон Р-482, DESIGN-SYSTEM §3.3).
 *
 * Любой текст в верхнем регистре на посадочной, «Аспирантам», «Студентам»,
 * «Компаниям», «Экспертам» и «Инструментах» — метка: Inter 12 px,
 * интервал `.06em`. До Р-1001 у меток «Для кого», «Что делаем»,
 * «Получатель документа» и нормы направления на «Компаниям» и у «Консультация
 * 20 мин · бесплатно» на «Аспирантам» было `.05em`, у «Ключевой этап» на
 * «Студентам» — `.04em`, у «Этап N из M» — 13 px. Номера («01», сроки) не в
 * верхнем регистре и под правило не подпадают (`.05em` — номер этапа, §3.3).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [
  ['StartPage', 'StartPage'], ['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage'], ['ToolsPage', 'ToolsPage'],
] as const;

/** Встроенные стили и правила таблицы стилей макета с верхним регистром. */
export function upperStyles(html: string): string[] {
  const inline = [...html.matchAll(/style="([^"]*text-transform:uppercase[^"]*)"/gu)].map((m) => m[1]);
  const rules = [...html.matchAll(/\{([^{}]*text-transform:uppercase[^{}]*)\}/gu)].map((m) => m[1]);
  return [...inline, ...rules];
}

/** Нарушения канона метки: кегль не 12 px или интервал не `.06em`. */
export function offCanon(style: string): string | null {
  const size = style.match(/font-size:\s*"?([^;"]+)/u)?.[1] ?? style.match(/fontSize: "([^"]+)"/u)?.[1];
  const track = style.match(/letter-spacing:\s*([^;]+)/u)?.[1] ?? style.match(/letterSpacing: "([^"]+)"/u)?.[1];
  if (size !== '12px') return `кегль ${size ?? 'не задан'}`;
  if (track !== '.06em') return `интервал ${track ?? 'не задан'}`;
  return null;
}

describe('метки верхнего регистра: 12 px, .06em (Р-1001)', () => {
  for (const [page, component] of PAGES) {
    const html = read('design', `${page}.dc.html`);
    const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);

    it(`${page}: в макете все метки — 12 px и .06em`, () => {
      const styles = upperStyles(html);
      assert.ok(styles.length > 0, 'в макете нет меток — проверка ничего не охраняет');
      const bad = styles.map((s) => [offCanon(s), s.slice(0, 120)]).filter(([e]) => e);
      assert.deepEqual(bad, [], 'метки вне канона Р-482');
    });

    it(`${page}: компонент перенесён с тем же каноном`, () => {
      const objects = [...tsx.matchAll(/style=\{\{([^{}]*textTransform: "uppercase"[^{}]*)\}\}/gu)].map((m) => m[1]);
      const rules = [...tsx.matchAll(/\{([^{}]*text-transform:uppercase[^{}]*)\}/gu)].map((m) => m[1]);
      const bad = [...objects, ...rules].map((s) => [offCanon(s), s.slice(0, 120)]).filter(([e]) => e);
      assert.deepEqual(bad, [], 'метки компонента вне канона');
      assert.equal(objects.length + rules.length, upperStyles(html).length, 'число меток в компоненте и в макете разное');
    });
  }

  it('проба: прежние исполнения не проходят', () => {
    assert.equal(offCanon("font-size:12px;line-height:1.4;letter-spacing:.05em;text-transform:uppercase"), 'интервал .05em');
    assert.equal(offCanon("font-size:13px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase"), 'кегль 13px');
    assert.equal(offCanon('fontSize: "12px", letterSpacing: ".04em", textTransform: "uppercase"'), 'интервал .04em');
  });
});
