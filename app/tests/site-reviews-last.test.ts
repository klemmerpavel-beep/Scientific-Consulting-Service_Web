/**
 * Отзывы — последний раздел содержательной страницы, прямо перед подвалом
 * (Р-860, указание владельца 13.11.2026: «снести в самый низ всегда, перед
 * подвалом»). Правило действует на всех содержательных страницах: где есть
 * раздел отзывов (`#reviews` — «Аспирантам», «Студентам», «Компаниям»), за
 * ним до `</main>` нет ни одного раздела; на посадочной и «Экспертам»
 * отзывов нет. Проверка — по макету и по перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = [
  { design: 'StartPage', component: 'StartPage', reviews: false },
  { design: 'MainPage', component: 'PostgradPage', reviews: true },
  { design: 'StudentsPage', component: 'StudentsPage', reviews: true },
  { design: 'BusinessPage', component: 'BusinessPage', reviews: true },
  { design: 'ExpertsPage', component: 'ExpertsPage', reviews: false },
] as const;

/** Открывающие теги разделов внутри <main> по порядку и то, что стоит между последним разделом и </main>. */
function mainSections(source: string): { ids: string[]; afterLast: string } {
  const from = source.search(/<main\b/u);
  const to = source.indexOf('</main>', from);
  assert.ok(from >= 0 && to > from, 'нет <main>');
  const main = source.slice(from, to);
  const ids = [...main.matchAll(/<section\b([^>]*)>/gu)].map((m) => m[1]!.match(/\bid="([a-z-]+)"/u)?.[1] ?? '(без id)');
  const last = main.lastIndexOf('</section>');
  return { ids, afterLast: main.slice(last + '</section>'.length) };
}

describe('Р-860: отзывы — последний раздел перед подвалом на всех содержательных страницах', () => {
  for (const page of PAGES) {
    const sources: Array<[string, string]> = [
      [`design/${page.design}.dc.html`, read('design', `${page.design}.dc.html`)],
      [`${page.component}.tsx`, read('app', 'src', 'components', 'pages', `${page.component}.tsx`)],
    ];

    it(`${page.design}: ${page.reviews ? 'раздел #reviews — последний в <main>, дальше только подвал' : 'раздела отзывов нет'}`, () => {
      for (const [where, source] of sources) {
        const { ids, afterLast } = mainSections(source);
        if (!page.reviews) {
          assert.ok(!ids.includes('reviews'), `${where}: появился раздел отзывов — он должен стоять последним`);
          continue;
        }
        assert.equal(ids.filter((id) => id === 'reviews').length, 1, `${where}: раздел #reviews не один`);
        assert.equal(ids.at(-1), 'reviews', `${where}: после отзывов стоят разделы: ${ids.slice(ids.indexOf('reviews') + 1).join(', ')}`);
        assert.doesNotMatch(afterLast.replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/gu, ''), /<(?:section|form|h2)\b/u, `${where}: между отзывами и подвалом есть содержание`);
        const footer = source.search(/<footer\b/u);
        assert.ok(footer > source.indexOf('</main>'), `${where}: подвал не после <main>`);
      }
    });
  }
});
