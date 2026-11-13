/**
 * «Сводка» руководителя, блок «Команда» (решения Р-343, Р-541, Р-575, Р-830,
 * Р-887): при пустой команде — только фраза, пустой ленты нет; плашка
 * сотрудника — по содержимому, «где стоят работы» сразу под числами;
 * «Команда» не тянется по соседу в ряду, кнопки — сразу под лентой.
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

const root = path.join(import.meta.dirname, '..');
const slider = readFileSync(path.join(root, 'src', 'components', 'cabinet', 'CardSlider.tsx'), 'utf8');
const tokens = readFileSync(path.join(root, 'src', 'components', 'cabinet', 'tokens.ts'), 'utf8');
/** Плашки сотрудников: от ленты до её конца. */
const plates = page.slice(page.indexOf('<CardSlider label="Сотрудники практики"'), page.indexOf('</CardSlider>'));
/** Плашка «Команда» целиком: от карточки до кнопок. */
const team = page.slice(page.indexOf('<Card className="cab-dash-team">'), page.indexOf('Добавить в команду'));

describe('Р-887: плашка сотрудника по содержимому, «Команда» без пустоты', () => {
  it('лента «Команды» без fill: ни ленты на высоту плашки, ни её правил', () => {
    assert.ok(plates.length > 0, 'лента «Сотрудники практики» не найдена');
    assert.doesNotMatch(plates, /<CardSlider[^>]*\bfill\b/u, 'лента снова на высоту плашки');
    assert.doesNotMatch(slider, /\bfill\?: boolean|\bfill = false|cab-slider-fill/u, 'у CardSlider снова свойство fill');
    assert.ok(!tokens.includes('cab-slider-fill'), 'правила .cab-slider-fill вернулись');
  });

  it('в плашке сотрудника нет margin:auto — «где стоят работы» сразу под числами', () => {
    assert.doesNotMatch(plates, /'auto/u, 'блок прижат к низу плашки (margin: auto)');
    assert.match(plates, /<Card as="article" link key=\{`[^`]+`\} style=\{\{ display: 'grid', alignContent: 'start', gap: 12, padding: '16px 18px' \}\}>/u);
    // Блок состояний и фраза без работ — за линией с отступом 12 px.
    assert.match(page, /const TEAM_POINTS = \{ margin: 0, paddingTop: 12, borderTop: '1px solid var\(--pd-divider\)' \} as const;/u);
    assert.match(plates, /<dl style=\{\{ \.\.\.TEAM_POINTS, display: 'grid', gap: 4 \}\}>/u);
    assert.match(plates, /<Text muted size=\{13\} style=\{TEAM_POINTS\}>\s*Действующих работ нет\.\s*<\/Text>/u);
  });

  it('где стоят работы — строками «состояние — число», не строкой через точку (Р-830)', () => {
    assert.match(plates, /<dt style=\{TEAM_POINT_LABEL\}>\{point\.label\}<\/dt>/u);
    assert.doesNotMatch(plates, /\.join\(' · '\)/u, 'состояния снова одной строкой');
  });

  it('всё, что видел руководитель, на плашке осталось: имя, роль, три числа, состояния', () => {
    for (const shown of ['{row.fullName}', '{row.side}', 'row.works', 'row.overdue', 'row.decide', 'row.points.map(']) {
      assert.ok(plates.includes(shown), `на плашке нет ${shown}`);
    }
  });

  it('«Команда» не тянется по соседу, кнопки — сразу под лентой', () => {
    assert.ok(team.length > 0, 'плашка «Команда» без класса cab-dash-team');
    assert.doesNotMatch(team, /marginTop: 'auto'/u, 'кнопки снова прижаты к низу растянутой плашки');
    assert.ok(tokens.includes('.cab-dash>.cab-dash-team{align-self:start}'), '«Команда» снова тянется по ряду');
    // Сосед по ряду — без нижнего предела: справа от «Команды» и слева.
    assert.ok(
      tokens.includes('.cab-dash>.cab-dash-team,.cab-dash>.cab-dash-team:nth-child(odd)+*,.cab-dash>:has(+.cab-dash-team:nth-child(even)){min-height:0}'),
      'у ряда «Команды» снова предел 540 px',
    );
    // Предел 540 px (Р-576) — у плашки, не у строки сетки: строке его не снять.
    assert.ok(tokens.includes('.cab-dash>*{min-width:0;min-height:540px}'));
    assert.doesNotMatch(tokens, /\.cab-dash\{[^}]*grid-auto-rows:minmax\(540px/u);
  });
});

describe('Р-830: в наполнении снимков — тестовые сотрудники', () => {
  const seed = readFileSync(path.join(root, 'scripts', 'seed-artboards.ts'), 'utf8');

  it('в наполнении снимков — тестовые сотрудники: лента листается', () => {
    const staff = seed.slice(seed.indexOf('const TEST_STAFF = ['), seed.indexOf('] as const;', seed.indexOf('const TEST_STAFF = [')));
    const people = staff.match(/\['(?:manager|curator)-\d+', '[^']+', '(?:MANAGER|EXPERT)'/gu) ?? [];
    assert.ok(people.length >= 6, `тестовых сотрудников ${people.length}`);
    assert.match(seed, /email: `\$\{login\}@\$\{DOMAIN\}`/u, 'тестовые адреса не на домене прототипа');
  });
});
