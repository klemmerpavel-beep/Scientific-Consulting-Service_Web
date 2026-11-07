/**
 * «Сводка» руководителя, блок «Команда» (решения Р-343, Р-541, Р-575, Р-830):
 * при пустой команде — только фраза, пустой ленты нет; лента и карточки
 * сотрудников — на высоту плашки.
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
    assert.match(page, /<CardSlider label="Сотрудники практики" compact fill>/u);
    assert.match(page, /\{team\.map\(\(row\) => \(\s*<Card as="article" link/u);
  });
});

describe('Р-830: карточка сотрудника соразмерна плашке «Команда»', () => {
  const root = path.join(import.meta.dirname, '..');
  const slider = readFileSync(path.join(root, 'src', 'components', 'cabinet', 'CardSlider.tsx'), 'utf8');
  const tokens = readFileSync(path.join(root, 'src', 'components', 'cabinet', 'tokens.ts'), 'utf8');
  const seed = readFileSync(path.join(root, 'scripts', 'seed-artboards.ts'), 'utf8');

  it('лента с fill занимает остаток плашки, строка ленты — её высоту', () => {
    assert.match(slider, /fill \? 'cab-slider-fill' : ''/u);
    assert.ok(tokens.includes('.cab-slider-fill{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}'));
    assert.ok(tokens.includes('.cab-slider-fill .cab-slider-track{flex:1 1 auto}'));
  });

  it('где стоят работы — строками «состояние — число» у нижнего края карточки, не строкой через точку', () => {
    const card = page.slice(page.indexOf('<CardSlider label="Сотрудники практики"'), page.indexOf('</CardSlider>'));
    assert.match(card, /<dl style=\{\{ display: 'grid', gap: 4, margin: 'auto 0 0', paddingTop: 10, borderTop: '1px solid var\(--pd-divider\)' \}\}>/u);
    assert.match(card, /<dt style=\{TEAM_POINT_LABEL\}>\{point\.label\}<\/dt>/u);
    assert.doesNotMatch(card, /\.join\(' · '\)/u, 'состояния снова одной строкой');
  });

  it('в наполнении снимков — тестовые сотрудники: лента листается', () => {
    const staff = seed.slice(seed.indexOf('const TEST_STAFF = ['), seed.indexOf('] as const;', seed.indexOf('const TEST_STAFF = [')));
    const people = staff.match(/\['(?:manager|curator)-\d+', '[^']+', '(?:MANAGER|EXPERT)'/gu) ?? [];
    assert.ok(people.length >= 6, `тестовых сотрудников ${people.length}`);
    assert.match(seed, /email: `\$\{login\}@\$\{DOMAIN\}`/u, 'тестовые адреса не на домене прототипа');
  });
});
