/**
 * «Сводка» руководителя, блок «Команда» (решения Р-343, Р-541, Р-575): при
 * пустой команде — только фраза, пустой ленты нет.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');

describe('«Команда» на «Сводке» (Р-541)', () => {
  it('лента людей стоит только в ветке непустой команды', () => {
    const empty = page.indexOf('В команде пока нет сотрудников.');
    assert.ok(empty > 0, 'фраза пустой команды не найдена');
    const branch = page.slice(empty, page.indexOf('{team.map(', empty));
    assert.match(branch, /<\/Text>\s*\) : \(\s*<CardSlider /u);
  });

  it('каждый сотрудник — своя плашка в ленте (Р-575)', () => {
    assert.match(page, /<CardSlider label="Сотрудники практики" compact>/u);
    assert.match(page, /\{team\.map\(\(row\) => \(\s*<Card as="article" link/u);
  });
});
