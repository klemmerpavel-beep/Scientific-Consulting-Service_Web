/**
 * Одна подпись кнопки к заявке (решение Р-959, ответ владельца 20.11.2026).
 *
 * Все тёмные кнопки, ведущие к форме заявки, на посадочной, «Аспирантам»,
 * «Студентам», «Компаниям» и в «Инструментах» подписаны «Оставить заявку».
 * Прежние «Обсудить проект» (раздел ролей «Аспирантам» и «Компаниям», Р-877)
 * и «Обсудить мой срок» («Этапы» «Студентам», Р-853) сняты. Исключение одно —
 * «Получить смету» в «Подборе сметы» «Студентам»: кнопка переносит выбранный
 * срок в форму (Р-886). Ссылки внутри карточек («Обсудить пакет», «Обсудить
 * это направление», «Разобрать…») — не тёмные кнопки и правило не задевают.
 * Проверка идёт и по макету, и по перенесённому компоненту.
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
  ['ToolsPage', 'ToolsPage'],
] as const;

/** Подписи тёмных кнопок-ссылок к форме заявки — в макете (`background:var(--pd-ink)`) и в компоненте (`background: "var(--pd-ink)"`). */
export function ctaLabels(source: string): string[] {
  const re = /<a\b[^>]*\bhref="(?:#request|\.\/index\.html#request|\/#request|\/index\.html#request)"[^>]*\bbackground:\s*"?var\(--pd-ink\)[;"][^>]*>([^<]+)</gu;
  return [...source.matchAll(re)].map((m) => m[1]!.trim());
}

describe('одна подпись кнопки к заявке (Р-959)', () => {
  for (const [design, component] of PAGES) {
    for (const [where, source] of [
      ['макет', read('design', `${design}.dc.html`)],
      ['компонент', read('app', 'src', 'components', 'pages', `${component}.tsx`)],
    ] as const) {
      it(`${design}, ${where}: тёмные кнопки к форме — «Оставить заявку»${design === 'StudentsPage' ? ' и одна «Получить смету»' : ''}`, () => {
        const labels = ctaLabels(source);
        assert.ok(labels.length >= 1, 'кнопки к заявке не найдены — проверьте разбор');
        const other = labels.filter((l) => l !== 'Оставить заявку' && !(design === 'StudentsPage' && l === 'Получить смету'));
        assert.deepEqual(other, [], `подписи сверх «Оставить заявку»: ${other.join(', ')}`);
        if (design === 'StudentsPage') assert.equal(labels.filter((l) => l === 'Получить смету').length, 1, '«Получить смету» — одна, в «Подборе сметы» (Р-886)');
        assert.doesNotMatch(source, />\s*Обсудить (?:проект|мой срок)\s*</u, 'прежняя подпись Р-877 или Р-853 осталась');
      });
    }
  }

  it('разделы ролей «Аспирантам» и «Компаниям» и «Этапы» «Студентам» держат кнопку «Оставить заявку»', () => {
    for (const [page, mark] of [['MainPage', 'class="pd-orbit"'], ['BusinessPage', 'class="bp-orbit"'], ['StudentsPage', '<section id="route"']] as const) {
      const html = read('design', `${page}.dc.html`);
      const at = html.indexOf(mark);
      assert.ok(at > 0, `${page}: нет раздела`);
      const section = html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
      assert.ok(ctaLabels(section).includes('Оставить заявку'), `${page}: в разделе нет кнопки «Оставить заявку»`);
    }
  });

  it('проба: разбор ловит прежнюю подпись и не трогает ссылки в карточках', () => {
    const probe = '<a href="#request" style="display:inline-flex;background:var(--pd-ink);color:var(--pd-ink-inverse)">Обсудить проект<span></span></a>'
      + '<a href="#request" style="color:var(--pd-accent)">Обсудить пакет</a>'
      + '<a href="#request" style={{ display: "inline-flex", background: "var(--pd-ink)", color: "var(--pd-ink-inverse)" }}>Оставить заявку</a>';
    assert.deepEqual(ctaLabels(probe), ['Обсудить проект', 'Оставить заявку']);
  });
});
