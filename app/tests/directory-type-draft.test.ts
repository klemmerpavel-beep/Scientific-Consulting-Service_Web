/**
 * «Справочники» → «Добавить позицию» (решение Р-707): отказ возвращает в
 * раскрытую форму с набранным и причиной в ней, как «Завести учётную
 * запись» (решения Р-543, Р-706). Прежде обе свёртки закрывались, а поля
 * «Код», «Название» и «Базовая цена» оставались пустыми.
 *
 * Проверка ходит по исходнику, как `invite-user-draft.test.ts`: действие
 * сервера завязано на cookie и redirect Next.js.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const actions = readFileSync(path.join(root, 'actions.ts'), 'utf8');
const page = readFileSync(path.join(root, 'manage', 'directory', 'page.tsx'), 'utf8');

describe('отказ «Добавить позицию» не теряет ввод (Р-707)', () => {
  it('действие возвращает в открытую форму с черновиком', () => {
    const body = actions.slice(actions.indexOf('export async function saveType'), actions.indexOf('export async function attachAlias'));
    assert.match(
      body,
      /withError\('\/cabinet\/manage\/directory\?new=1', reason, \{\s*draft: \{ code, name, basePrice: rawPrice, sortOrder: rawOrder \},\s*anchor: 'new-type',/u,
    );
  });

  it('свёртка раскрыта, поля подставляют набранное', () => {
    const start = page.indexOf('<Disclosure title="Добавить позицию"');
    assert.ok(start > 0, 'свёртка не найдена');
    const fold = page.slice(start, page.indexOf('</Disclosure>', start));
    assert.match(fold, /^<Disclosure title="Добавить позицию" open=\{sp\.new === '1'\} id="new-type">/u);
    assert.match(page, /const draft = \(await formDraft\(sp\.error\)\) \?\? \{\};/u);
    for (const name of ['code', 'name', 'basePrice', 'sortOrder']) {
      assert.match(fold, new RegExp(`name="${name}"[^>]*defaultValue=\\{draft\\.${name}\\}`, 'u'), name);
    }
  });

  it('причина — в свёртке над полями, а не вверху экрана', () => {
    const start = page.indexOf('<Disclosure title="Добавить позицию"');
    const fold = page.slice(start, page.indexOf('</Disclosure>', start));
    const outcome = fold.indexOf('<Notice tone="error" role="alert">');
    assert.ok(outcome > 0, 'в свёртке нет причины отказа');
    assert.ok(outcome < fold.indexOf('name="code"'), 'причина ниже полей');
    assert.match(page, /const typeFailed = sp\.new === '1' && failure !== undefined && tab === 'types';/u);
    assert.match(page, /failure === undefined \|\| typeFailed \? null : \(/u);
  });
});
