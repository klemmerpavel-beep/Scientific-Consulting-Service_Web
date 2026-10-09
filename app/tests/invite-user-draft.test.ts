/**
 * Заведение учётной записи (решения Р-488, Р-543): отказ возвращает в
 * открытую форму «Завести учётную запись» с набранным, а не на закрытую
 * свёртку с пустыми полями.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`: действие
 * сервера завязано на cookie и redirect Next.js.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const actions = readFileSync(path.join(root, 'actions.ts'), 'utf8');
const page = readFileSync(path.join(root, 'manage', 'users', 'page.tsx'), 'utf8');

describe('отказ заведения учётной записи не теряет ввод (Р-543)', () => {
  it('действие возвращает в открытую форму с черновиком', () => {
    const body = actions.slice(actions.indexOf('export async function inviteUser'), actions.indexOf('export async function changeUserRole'));
    assert.match(body, /withError\('\/cabinet\/manage\/users\?new=1', reason, \{\s*draft: \{ \.\.\.input, role: String\(role\) \},\s*anchor: 'new',/u);
  });

  it('форма подставляет набранное', () => {
    assert.match(page, /const draft = \(await formDraft\(flags\.error\)\) \?\? \{\};/u);
    for (const name of ['fullName', 'email', 'position', 'degree', 'specialization']) {
      assert.match(page, new RegExp(`defaultValue=\\{draft\\.${name}\\}`, 'u'), name);
    }
    assert.match(page, /name="role" defaultValue=\{ROLES\.includes\(draft\.role as Role\) \? draft\.role : 'EXPERT'\}/u);
  });
});
