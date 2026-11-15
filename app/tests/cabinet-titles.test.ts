/**
 * У каждого экрана кабинета свой заголовок документа (решение Р-894).
 *
 * Аудит 15.11.2026 нашёл пустой `<title>` на 269 экранах из 271 (WCAG
 * 2.4.2, уровень A): вкладка, история и закладки называли экран адресом,
 * читалка не объявляла, куда человек попал. Проверка доступности по
 * снимкам этого не видела: снимок несёт тело страницы, а не её голову.
 * Здесь закреплено правило по исходникам: экран без названия не проходит.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const CABINET = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');

const pages = readdirSync(CABINET, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('page.tsx'))
  .map((name) => ({
    name: name.split(path.sep).join('/'),
    body: readFileSync(path.join(CABINET, name), 'utf8'),
  }));

/** Название экрана из постоянных метаданных; `null` — названия нет. */
function staticTitle(body: string): string | null {
  const block = /export const metadata: Metadata = \{([\s\S]*?)\n?\};/u.exec(body);
  if (block === null) return null;
  const title = /\btitle:\s*'([^']+)'/u.exec(block[1]!);
  return title === null ? null : title[1]!;
}

describe('заголовок документа у экранов кабинета (Р-894)', () => {
  it('экраны найдены', () => {
    assert.ok(pages.length >= 59, `экранов ${pages.length}`);
  });

  it('у каждого экрана есть название: постоянное или по роли', () => {
    const bare = pages
      .filter(({ body }) => staticTitle(body) === null && !/export async function generateMetadata\(/u.test(body))
      .map(({ name }) => name);
    assert.deepEqual(bare, []);
  });

  it('название по роли есть только у начальных экранов и берётся из меню', () => {
    const byRole = pages.filter(({ body }) => /export async function generateMetadata\(/u.test(body));
    assert.deepEqual(
      byRole.map(({ name }) => name).sort(),
      ['manage/page.tsx', 'projects/page.tsx'],
    );
    for (const { name, body } of byRole) {
      assert.match(body, /menuLabel\(actor, '\/cabinet\/(manage|projects)'\)/u, name);
    }
  });

  it('вложенный экран не дописывает имя сервиса сам — это делает шаблон', () => {
    const doubled = pages
      .filter(({ name }) => name !== 'page.tsx')
      .filter(({ body }) => /ProDisser/u.test(staticTitle(body) ?? ''))
      .map(({ name }) => name);
    assert.deepEqual(doubled, []);
  });

  it('название экрана — не длиннее 40 знаков и без кода', () => {
    for (const { name, body } of pages) {
      const title = staticTitle(body);
      if (title === null) continue;
      assert.ok(title.length <= 40 || name === 'page.tsx', `${name}: «${title}»`);
      assert.doesNotMatch(title, /[{}$<>]/u, name);
    }
  });

  it('каркас кабинета задаёт шаблон и запасное название', () => {
    const layout = readFileSync(path.join(CABINET, 'layout.tsx'), 'utf8');
    assert.match(layout, /title:\s*\{\s*template:\s*'%s — ProDisser',\s*default:\s*'Личный кабинет — ProDisser'\s*\}/u);
  });
});
