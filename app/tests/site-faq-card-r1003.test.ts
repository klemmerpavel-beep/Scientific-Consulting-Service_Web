/**
 * Карточка вопросов — одно исполнение на всех страницах с блоком вопросов
 * (Р-1003, указание владельца 22.11.2026, С-9.3: «одно оформление карточки
 * вопросов»; эталон — «Экспертам», Р-839).
 *
 * Исполнение «Экспертам»: список с промежутком 12 px; закрытая карточка —
 * кнопка `aria-expanded="false"`, белая `.92`, рамка `--pd-border`, радиус 14,
 * поля `18px 22px`, вопрос Inter 14 px / 1.5 / 600, тень уровня 2, подъём
 * `pd-lift`; раскрытая — рамка `--pd-accent-edge`, тень уровня 2, шапка на
 * `--pd-accent-mark` с полями `18px 22px`, ответ 14 px / 1.6 с полями
 * `16px 22px 20px` и мерой 70ch. До Р-1003 у «Студентам» и «Компаниям» были
 * белая карточка, тень уровня 1, поля `16px 20px`, промежуток 10 px.
 * `scroll-margin-top` — только у карточек, на которые ведут ссылки страницы
 * («Студентам», «Экспертам»), и в сравнение не входит.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'], ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage']] as const;

/** Части карточки вопроса из раздела `#faq` макета, без `scroll-margin-top` и `id`. */
export function faqCard(html: string) {
  const at = html.indexOf('<section id="faq"');
  assert.ok(at >= 0, 'нет раздела #faq');
  const sec = html.slice(at, html.indexOf('</section>', at));
  const norm = (s: string | undefined) => s?.replace(/scroll-margin-top:96px;?/gu, '').replace(/ id="\{\{ f\.id \}\}"/gu, '');
  const pick = (re: RegExp) => norm(sec.match(re)?.[1]);
  return {
    list: pick(/<div style="([^"]*)">\n<sc-for list="\{\{ faq \}\}"/u),
    open: pick(/<sc-if value="\{\{ f\.open \}\}"[^>]*>\n<div(?: id="\{\{ f\.id \}\}")? style="([^"]*)">/u),
    head: pick(/<button type="button" onClick="\{\{ f\.toggle \}\}" aria-expanded="true" (style="[^"]*" style-hover="[^"]*" style-active="[^"]*")>/u),
    answer: pick(/<p style="([^"]*)">\{\{ f\.a \}\}<\/p>/u),
    closed: pick(/<button(?: id="\{\{ f\.id \}\}")? class="pd-lift" type="button"(?: id="\{\{ f\.id \}\}")? onClick="\{\{ f\.toggle \}\}" aria-expanded="false" (style="[^"]*"(?: style-[a-z]+="[^"]*")*)>/u),
  };
}

describe('карточка вопросов — исполнение «Экспертам» (Р-1003)', () => {
  const etalon = faqCard(read('design', 'ExpertsPage.dc.html'));

  it('эталон «Экспертам»: белая .92, тень уровня 2, поля 18 × 22, промежуток 12 px', () => {
    for (const [part, value] of Object.entries(etalon)) assert.ok(value, `у эталона не найдена часть ${part}`);
    assert.equal(etalon.list, 'display:flex;flex-direction:column;gap:12px');
    assert.match(etalon.closed!, /background:rgba\(255,255,255,\.92\);[^"]*padding:18px 22px;[^"]*box-shadow:0 6px 14px rgba\(20,22,28,\.06\),0 1px 2px rgba\(20,22,28,\.05\)/u);
    assert.match(etalon.open!, /^background:rgba\(255,255,255,\.92\);border:1px solid var\(--pd-accent-edge\);border-radius:14px;overflow:hidden;box-shadow:0 6px 14px/u);
    assert.match(etalon.head!, /padding:18px 22px;/u);
    assert.match(etalon.answer!, /padding:16px 22px 20px;/u);
  });

  for (const [page, component] of PAGES) {
    it(`${page}: карточка вопроса совпадает с эталоном`, () => {
      assert.deepEqual(faqCard(read('design', `${page}.dc.html`)), etalon);
    });

    it(`${page}: компонент перенесён`, () => {
      const tsx = read('app', 'src', 'components', 'pages', `${component}.tsx`);
      const at = tsx.indexOf('id="faq"');
      const sec = tsx.slice(at, tsx.indexOf('</section>', at));
      assert.match(sec, /background: "rgba\(255,255,255,\.92\)", border: "1px solid var\(--pd-accent-edge\)"/u, 'раскрытая карточка');
      assert.match(sec, /aria-expanded="false" style=\{\{[^}]*background: "rgba\(255,255,255,\.92\)"[^}]*padding: "18px 22px"[^}]*boxShadow: "0 6px 14px rgba\(20,22,28,\.06\),0 1px 2px rgba\(20,22,28,\.05\)"/u, 'закрытая карточка');
      assert.match(sec, /padding: "16px 22px 20px"/u, 'ответ');
    });
  }

  it('проба: карточка с тенью уровня 1 и полями 16 × 20 не совпадает', () => {
    const probe = '<section id="faq"><div style="display:flex;flex-direction:column;gap:10px">\n<sc-for list="{{ faq }}" as="f">'
      + '<button class="pd-lift" type="button" onClick="{{ f.toggle }}" aria-expanded="false" style="background:var(--pd-ink-inverse);padding:16px 20px;box-shadow:0 1px 2px rgba(20,22,28,.05)" style-active="opacity:.82"></section>';
    assert.notDeepEqual(faqCard(probe), etalon);
  });
});
