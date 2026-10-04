/**
 * Благодарность за заявку — окном поверх страницы (решение Р-280).
 *
 * Проверка по исходникам: макеты остаются источником текста, перенос
 * связывает каждую форму заявки с её благодарностью, окно держит правила
 * дизайн-системы (одна кривая движения, уменьшенное движение, цель 44 px)
 * и закрывается само в пределах 3–5 секунд, о которых просил заказчик.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

// Компонент — TSX, его не импортировать в проверку без сборки: значения
// берутся из исходника.
const COMPONENT = read('app', 'src', 'components', 'LeadThanks.tsx');
const LEAD_SENT_EVENT = /export const LEAD_SENT_EVENT = '([^']+)';/u.exec(COMPONENT)![1]!;
const LEAD_THANKS_MS = Number(/export const LEAD_THANKS_MS = (\d+);/u.exec(COMPONENT)![1]);

const PAGES = [
  { design: 'StartPage', code: 'StartPage', forms: 2 },
  { design: 'MainPage', code: 'PostgradPage', forms: 2 },
  { design: 'StudentsPage', code: 'StudentsPage', forms: 2 },
  { design: 'BusinessPage', code: 'BusinessPage', forms: 2 },
];

function thanksMap(code: string): Record<string, string> {
  const source = read('app', 'src', 'components', 'pages', `${code}.tsx`);
  const match = /const LEAD_THANKS: Record<string, string> = (\{[\s\S]*?\});/u.exec(source);
  assert.ok(match, `${code}: нет таблицы благодарностей`);
  return JSON.parse(match[1]!) as Record<string, string>;
}

describe('перенос: каждая форма заявки знает свою благодарность', () => {
  for (const page of PAGES) {
    it(`${page.code}: тексты взяты из макета, отзыв не затронут`, () => {
      const design = read('design', `${page.design}.dc.html`);
      const map = thanksMap(page.code);
      assert.equal(Object.keys(map).length, page.forms);
      assert.equal('submitReview' in map, false);
      for (const text of Object.values(map)) {
        assert.match(text, /^Заявка принята/u);
        assert.ok(design.includes(`>${text}</span>`), `текста «${text}» нет в макете`);
      }
    });
  }

  it('правовые страницы и 404 форм заявки не имеют', () => {
    for (const code of ['OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage']) {
      assert.deepEqual(thanksMap(code), {});
    }
  });

  it('успешная заявка поднимает окно, прочие формы ведут себя по макету', () => {
    const page = read('app', 'src', 'components', 'pages', 'StartPage.tsx');
    assert.ok(page.includes(`new CustomEvent('${LEAD_SENT_EVENT}', { detail: { text: thanks, form } })`));
    assert.match(page, /if \(thanks && typeof window !== 'undefined'\) \{[\s\S]*?return;\s*\}\s*if \(typeof original === 'function'\) original/u);
  });
});

describe('окно благодарности', () => {
  const source = COMPONENT;

  it('закрывается само через 3–5 секунд', () => {
    assert.ok(LEAD_THANKS_MS >= 3000 && LEAD_THANKS_MS <= 5000);
  });

  it('модальное: диалог с заголовком и текстом, Esc, ловушка Tab, возврат фокуса', () => {
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /aria-labelledby=\{titleId\}/u);
    assert.match(source, /aria-describedby=\{textId\}/u);
    assert.match(source, /event\.key === 'Escape'/u);
    assert.match(source, /event\.key !== 'Tab'/u);
    assert.match(source, /querySelector<HTMLElement>\('\[type="submit"\]'\)/u);
  });

  it('размытая страница, одна кривая движения, уменьшенное движение, цель 44 px', () => {
    assert.match(source, /backdrop-filter:blur\(6px\)/u);
    assert.match(source, /-webkit-backdrop-filter:blur\(6px\)/u);
    assert.match(source, /--lt-ease:cubic-bezier\(\.2,0,\.2,1\)/u);
    assert.doesNotMatch(source, /cubic-bezier\((?!\.2,0,\.2,1\))/u);
    for (const ms of source.matchAll(/(\d+)ms/gu)) {
      const value = Number(ms[1]);
      assert.ok(value >= 180 && value <= 260, `длительность ${value} мс вне 180–260`);
    }
    assert.match(source, /prefers-reduced-motion:reduce/u);
    assert.match(source, /\.pd-lt-close\{[^}]*min-height:44px/u);
    for (const size of source.matchAll(/font-size:(\d+)px/gu)) assert.ok(Number(size[1]) >= 12);
  });

  it('стоит в общей разметке рядом с кнопкой замечаний', () => {
    const layout = read('app', 'src', 'app', 'layout.tsx');
    assert.match(layout, /import LeadThanks from '\.\.\/components\/LeadThanks';/u);
    assert.match(layout, /<FeedbackWidget \/>[\s\S]*<LeadThanks \/>/u);
  });
});
