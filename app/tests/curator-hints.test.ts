/**
 * Три подсказки у поля замечания куратора (требование Э-07 в составе
 * ответа С-1, решение Р-327): «Раздел — что не так — как исправить»,
 * «Клиент увидит замечание после проверки менеджером», «Замечания
 * объясняют, что и почему исправить; текст работы пишет автор». Видны
 * куратору там, где у него есть поле замечания; клиенту и практике — нет.
 *
 * У куратора проверяется исходник экрана этапа: в снимках прототипа нет
 * этапа куратора с версией, под которой стоит поле. У клиента, менеджера и
 * руководителя — снимки: поле замечания там снято настоящим кодом страницы.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const PROTOTYPE = path.join(import.meta.dirname, '..', '..', 'design', 'cabinet-prototype');
const STAGE_PAGE = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx');

const HINTS = [
  'Раздел — что не так — как исправить',
  'Клиент увидит замечание после проверки менеджером.',
  'Замечания объясняют, что и почему исправить; текст работы пишет автор.',
];

function stageScreens(role: string): string[] {
  const root = path.join(PROTOTYPE, role, 'stages');
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.html'))
    .map((name) => readFileSync(path.join(root, name), 'utf8'));
}

describe('подсказки у поля замечания (Э-07, С-1)', () => {
  it('у куратора — все три, только при `curatorView`', () => {
    const source = readFileSync(STAGE_PAGE, 'utf8');
    const field = source.slice(source.indexOf('label="Комментарий к текущей версии"'));
    const form = field.slice(0, field.indexOf('</Form>'));
    for (const hint of HINTS) {
      assert.equal(source.split(hint).length - 1, 1, `подсказка «${hint}» не одна на экране`);
      assert.ok(form.includes(hint), `подсказка «${hint}» не у поля замечания`);
      const line = form.split('\n').findIndex((text) => text.includes(hint));
      const guard = form.split('\n').slice(Math.max(0, line - 2), line + 1).join('\n');
      assert.match(guard, /curatorView \?/u, `подсказка «${hint}» видна не только куратору`);
    }
  });

  it('у клиента, менеджера и руководителя подсказок куратора нет', () => {
    for (const role of ['client', 'manager', 'head']) {
      const screens = stageScreens(role);
      if (role !== 'head') {
        assert.ok(screens.some((html) => /<textarea[^>]*name="body"/u.test(html)), `у роли ${role} нет снимка с полем`);
      }
      for (const html of screens) {
        for (const hint of HINTS) assert.ok(!html.includes(hint), `подсказка «${hint}» у роли ${role}`);
      }
    }
  });
});
