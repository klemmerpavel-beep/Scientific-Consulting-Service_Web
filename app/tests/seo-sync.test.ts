/**
 * Данные для поиска, выведенные из макетов (решение Р-1010):
 *
 * - дата последней правки страницы в sitemap.xml меняется только вместе с
 *   макетом — рядом с датой хранится свёртка макета;
 * - ответы свёрнутых вопросов раздела «Вопросы» стоят в разметке страницы,
 *   а не появляются только после нажатия;
 * - разметка FAQPage собирается из тех же вопросов и ответов, что в макете.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const sync = await import('../scripts/seo-sync.mjs');
const { PAGE_DATES } = await import('../content/page-dates.generated.ts');
const { FAQ } = await import('../content/faq.generated.ts');

describe('дата правки страницы в sitemap.xml — из макета (Р-1010)', () => {
  // Файл карты читается текстом: он собран под сборщик Next (импорты без
  // расширений), и средой проверок напрямую не загружается.
  const source = read('app', 'src', 'app', 'sitemap.ts');
  const routes = [...source.matchAll(/\{ path: '([^']+)', priority: [\d.]+ \}/gu)].map((m) => m[1]!);

  it('у каждой страницы карты есть запись, и других записей нет', () => {
    assert.ok(routes.length >= 8);
    assert.deepEqual(Object.keys(PAGE_DATES).sort(), [...routes].sort());
    assert.deepEqual(sync.PAGE_LAYOUTS.map(([route]: string[]) => route).sort(), [...routes].sort());
  });

  it('свёртка в записи — свёртка макета: после правки макета выполнен tools/seo-sync.mjs', () => {
    for (const [route, entry] of Object.entries(PAGE_DATES)) {
      assert.equal(entry.sha256, sync.layoutHash(entry.layout), `${route}: макет ${entry.layout} изменён, а дата страницы не обновлена — node tools/seo-sync.mjs`);
    }
  });

  it('дата — день в виде ГГГГ-ММ-ДД, не позже сегодняшнего', () => {
    for (const [route, entry] of Object.entries(PAGE_DATES)) {
      assert.match(entry.date, /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u, route);
      assert.ok(entry.date <= sync.today(), `${route}: дата ${entry.date} из будущего`);
    }
  });

  it('прежний макет сохраняет дату, изменённый и новый получают сегодняшнюю', () => {
    const hashes = Object.fromEntries(sync.PAGE_LAYOUTS.map(([, layout]: string[]) => [layout, `h-${layout}`]));
    const current = {
      '/': { layout: 'StartPage', sha256: 'h-StartPage', date: '2026-01-10' },
      '/main': { layout: 'MainPage', sha256: 'прежняя', date: '2026-01-10' },
    };
    const next = sync.nextDates(current, hashes, '2026-02-20');
    assert.equal(next['/'].date, '2026-01-10');
    assert.deepEqual(next['/main'], { layout: 'MainPage', sha256: 'h-MainPage', date: '2026-02-20' });
    assert.equal(next['/tools'].date, '2026-02-20');
  });

  it('карта сайта берёт lastmod из записи страницы; «сейчас» в поле не попадает', () => {
    assert.match(source, /\.\.\.\(PAGE_DATES\[path\] \? \{ lastModified: PAGE_DATES\[path\]\.date \} : \{\}\),/u);
    assert.doesNotMatch(source, /new Date\(/u);
  });
});

describe('раздел «Вопросы»: ответы в разметке страницы и FAQPage (Р-1010)', () => {
  const pages = [
    ['/main', 'MainPage', 'PostgradPage', 'main'],
    ['/students', 'StudentsPage', 'StudentsPage', 'students'],
    ['/business', 'BusinessPage', 'BusinessPage', 'business'],
  ] as const;

  it('порождённый файл совпадает с макетами слово в слово', () => {
    assert.equal(read('app', 'content', 'faq.generated.ts'), sync.renderFaq(sync.collectFaq()));
    // Три разводящие страницы с раскрывающимися вопросами и посадочные
    // кластеров (Р-1016, Р-1017), где ответы видны сразу.
    assert.deepEqual(Object.keys(FAQ), [...pages.map(([route]) => route), '/kandidatskaya-dissertaciya', '/niokr', '/magisterskaya-dissertaciya', '/statya-vak', '/normokontrol', '/patent', '/grant']);
  });

  for (const [route, design, component, dir] of pages) {
    it(`${route}: свёрнутый вопрос несёт ответ скрытым абзацем — и в макете, и в коде`, () => {
      // Закрытая ветка: кнопка с aria-expanded="false", за ней — ответ.
      assert.match(
        read('design', `${design}.dc.html`),
        /<sc-if value="\{\{ f\.closed \}\}"[^>]*>\n<button [^>]*aria-expanded="false"[\s\S]*?\n<\/button>\n<p hidden>\{\{ f\.a \}\}<\/p>\n<\/sc-if>\n<\/sc-for>/u,
      );
      assert.match(read('app', 'src', 'components', 'pages', `${component}.tsx`), /<\/button><p hidden=\{true\}>\{f\.a\}<\/p><\/>\) : null\}/u);
    });

    it(`${route}: вопросов не меньше пяти, каждый — вопрос с ответом-предложением`, () => {
      const items = FAQ[route]!;
      assert.ok(items.length >= 5, `${route}: ${items.length}`);
      for (const { q, a } of items) {
        assert.match(q, /\?$/u, q);
        assert.ok(a.length >= 60, `короткий ответ: «${a}»`);
      }
    });

    it(`${route}: маршрут выводит FAQPage своей страницы`, () => {
      assert.ok(read('app', 'src', 'app', dir, 'page.tsx').includes(`<FaqSchema page="${route}" />`));
    });
  }

  it('страницы без раздела «Вопросы» и закрытая от индексации «Экспертам» разметку не выводят', () => {
    assert.doesNotMatch(read('app', 'src', 'app', 'page.tsx'), /FaqSchema/u);
    for (const dir of ['experts', 'tools', 'offer', 'privacy', 'consent']) {
      assert.doesNotMatch(read('app', 'src', 'app', dir, 'page.tsx'), /FaqSchema/u);
    }
  });

  it('разметка: FAQPage, вопрос — Question, ответ — Answer; витрина её не выводит', () => {
    const component = read('app', 'src', 'components', 'FaqSchema.tsx');
    assert.match(component, /'@type': 'FAQPage',/u);
    assert.match(component, /'@type': 'Question',\n\s+name: plain\(q\),\n\s+acceptedAnswer: \{ '@type': 'Answer', text: plain\(a\) \},/u);
    assert.match(component, /process\.env\.NEXT_PUBLIC_PREVIEW === '1'\) return null;/u);
  });
});
