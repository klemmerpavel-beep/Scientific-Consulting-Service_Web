/**
 * «Сводка» руководителя, блок «Команда» (решения Р-343, Р-541): при пустой
 * команде — только фраза, пустого перечня нет.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');

describe('«Команда» на «Сводке» (Р-541)', () => {
  it('перечень людей стоит только в ветке непустой команды', () => {
    const empty = page.indexOf('В команде пока нет людей с работами и делами.');
    assert.ok(empty > 0, 'фраза пустой команды не найдена');
    const branch = page.slice(empty, page.indexOf('{team.map(', empty));
    assert.match(branch, /<\/Text>\s*\) : \(\s*<ul /u);
  });
});
