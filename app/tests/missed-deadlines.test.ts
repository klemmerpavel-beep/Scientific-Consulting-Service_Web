/**
 * Одно правило «срок сорван» на всех экранах сотрудников (решение
 * Р-719; Р-216, Р-257): то, по которому считает ответ «Сводки». Сорван
 * срок незакрытого этапа идущей работы; срок самой работы — у идущей без
 * сорванного этапа и у приостановленной. По нему — «Просрочено» в
 * «Команде», «Ближайшие сроки», пометка «· прошёл» в «Работах» и на
 * карточке. Прежде на стенде у Нечаевой выходило 5 → 4 → 3 → 0.
 * Экраны клиента не меняются (Р-654).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { missedCount, missedStages, workDuePassed, workMissed, type DueWork } from '../src/lib/cabinet/missed.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

const DAY = 86_400_000;
/** «Сегодня» стенда — 23.09.2026 по Москве. */
const TODAY = new Date(Date.UTC(2026, 8, 23));
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const work = (status: string, dueOn: string | null, stages: [string, string | null][] = []): DueWork => ({
  status,
  dueOn: dueOn === null ? null : at(dueOn),
  stages: stages.map(([state, due]) => ({ state, dueOn: due === null ? null : at(due) })),
});

describe('правило «срок сорван» (Р-719)', () => {
  it('этап идущей работы со сроком в прошлом — сорванный срок; срок работы при нём отдельно не считается', () => {
    const w = work('ACTIVE', '2025-05-20', [
      ['DONE', '2025-04-25'],
      ['IN_PROGRESS', '2025-05-20'],
    ]);
    assert.equal(missedStages(w, TODAY), 1);
    assert.equal(workMissed(w, TODAY), false);
    assert.equal(missedCount(w, TODAY), 1);
    assert.equal(workDuePassed(w, TODAY), true, 'пометка «прошёл» у срока работы всё равно стоит');
  });

  it('срок работы с планом без сорванного этапа — сорванный срок (у «Команды» прежде выпадал)', () => {
    const w = work('ACTIVE', '2026-09-02', [
      ['DONE', '2026-07-15'],
      ['IN_APPROVAL', '2026-10-03'],
    ]);
    assert.equal(missedCount(w, TODAY), 1);
    assert.equal(workMissed(w, TODAY), true);
  });

  it('приостановленная работа: срок работы считается, её этапы — нет', () => {
    assert.equal(missedCount(work('PAUSED', '2024-12-31'), TODAY), 1);
    assert.equal(workDuePassed(work('PAUSED', '2024-12-31'), TODAY), true);
    const staged = work('PAUSED', '2026-12-01', [['IN_PROGRESS', '2026-01-10']]);
    assert.equal(missedStages(staged, TODAY), 0);
    assert.equal(missedCount(staged, TODAY), 0);
  });

  it('закрытая работа, срок сегодня и работа без срока сорванными не считаются', () => {
    assert.equal(missedCount(work('COMPLETED', '2025-01-01', [['IN_PROGRESS', '2025-01-01']]), TODAY), 0);
    assert.equal(workDuePassed(work('CANCELLED', '2025-01-01'), TODAY), false);
    assert.equal(missedCount(work('ACTIVE', '2026-09-23'), TODAY), 0, 'срок «сегодня» не сорван (Р-240)');
    assert.equal(missedCount(work('ACTIVE', null), TODAY), 0);
    assert.equal(missedCount(work('ACTIVE', '2026-09-22'), new Date(TODAY.getTime() + DAY)), 1);
  });

  it('стенд: у Нечаевой пять сорванных сроков, по практике — шесть, как в ответе «Сводки»', () => {
    const nechaeva = [
      work('PAUSED', '2025-05-01'),
      work('PAUSED', '2024-12-31'),
      work('ACTIVE', '2025-09-01'),
      work('ACTIVE', '2026-09-02', [
        ['DONE', '2026-05-26'],
        ['DONE', '2026-07-15'],
        ['IN_APPROVAL', '2026-10-03'],
        ['AWAITING_CLIENT', '2026-10-13'],
        ['NOT_STARTED', '2026-11-22'],
      ]),
      work('ACTIVE', '2026-05-30'),
      work('ACTIVE', '2026-12-30'),
      work('ACTIVE', '2026-11-30'),
      work('ACTIVE', '2026-11-30'),
    ];
    const head = [
      work('ACTIVE', '2025-05-20', [
        ['DONE', '2025-04-25'],
        ['IN_PROGRESS', '2025-05-20'],
      ]),
      work('ACTIVE', '2026-09-25', [['IN_PROGRESS', '2026-09-25']]),
    ];
    const sum = (rows: DueWork[]) => rows.reduce((acc, row) => acc + missedCount(row, TODAY), 0);
    assert.equal(sum(nechaeva), 5);
    assert.equal(sum(head), 1);
    // «Работы» с отбором по Нечаевой помечают «прошёл» те же пять работ.
    assert.equal(nechaeva.filter((row) => workDuePassed(row, TODAY)).length, 5);
  });
});

describe('экраны сотрудников берут одно правило (Р-719)', () => {
  it('«Команда»: «Просрочено» — счёт ответа «Сводки», подпись определяет его', () => {
    const team = read('lib', 'cabinet', 'team.ts');
    assert.match(team, /overdue \+= missedCount\(work, day\)/u);
    assert.doesNotMatch(team, /current\?\.dueOn != null && current\.dueOn < day/u, 'остался счёт по текущему этапу');
    const page = read('app', 'cabinet', 'manage', 'team', 'page.tsx').replace(/\s+/gu, ' ');
    assert.match(page, /Просрочено — сорванные сроки: этапов идущих работ и самих работ, идущих без сорванного этапа или приостановленных, — тот же счёт, что в ответе «Сводки»\./u);
  });

  it('«Ближайшие сроки»: срок работы с планом — строкой «срок работы прошёл», этап приостановленной в прошлом — нет', () => {
    const summary = read('lib', 'cabinet', 'summary.ts');
    assert.match(summary, /works\.filter\(\(work\) => work\.stages\.length === 0 \|\| workMissed\(work, day\)\)/u);
    assert.match(summary, /stage\.project\.status === 'ACTIVE' \|\| stage\.dueOn!\.getTime\(\) >= day\.getTime\(\)/u);
    assert.doesNotMatch(summary, /stages: \{ none: \{\} \}, dueOn: \{ lte: horizon \}/u, 'срок работы — только у работ без плана');
    const manage = read('app', 'cabinet', 'manage', 'page.tsx');
    assert.match(manage, /row\.planless \? 'срок работы, плана нет' : 'срок работы прошёл'/u);
  });

  it('дело «срок работы прошёл» открывает раскрытую форму «Изменить карточку»', () => {
    const manage = read('app', 'cabinet', 'manage', 'page.tsx');
    const late = /\.\.\.parts\.late\.map\(([\s\S]*?)\n    \}\),/u.exec(manage);
    assert.ok(late !== null, 'нет дел «срок работы прошёл»');
    assert.match(late[1]!, /href: `\/cabinet\/projects\/\$\{work\.code\}\?manage=1#manage-card`/u);
  });

  it('«Работы»: у практики — по правилу, с приостановленными; клиенту и куратору — как прежде', () => {
    const list = read('app', 'cabinet', 'projects', 'page.tsx');
    assert.match(list, /const practice = !forClient && !forExpert;/u);
    assert.match(list, /practice\s*\?\s*workDuePassed\(project\)/u);
    assert.match(list, /:\s*project\.status === 'ACTIVE' && daysPast\(project\.dueOn\) !== null/u, 'у клиента сменилась пометка');
  });

  it('карточка работы: «прошёл N дней» в шапке и под шкалой у практики, в том числе без плана', () => {
    const card = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
    assert.match(card, /const practice = actor\.role === 'MANAGER' \|\| actor\.role === 'HEAD';/u);
    assert.match(card, /const workLateDays = practice && workDuePassed\(project\) \? daysPast\(project\.dueOn\) : null;/u);
    assert.match(card, /срок — \{formatDate\(project\.dueOn\)\}\s*\{workLateDays === null \? null : ` · прошёл \$\{workLateDays\}/u);
    // Клиенту — прежнее условие под шкалой, без числа дней (Р-654).
    assert.match(card, /projectLate=\{practice \? workLateDays !== null : current !== null && daysPast\(project\.dueOn\) !== null\}/u);
    assert.match(card, /projectLateDays=\{workLateDays\}/u);
    // Этап приостановленной или закрытой работы практике сорванным не помечается.
    assert.match(card, /stageLate=\{current !== null && daysPast\(current\.dueOn\) !== null && \(!practice \|\| project\.status === 'ACTIVE'\)\}/u);
    const ui = read('components', 'cabinet', 'ui.tsx');
    assert.match(ui, /projectLateDays == null\s*\?\s*' · прошёл'/u);
  });
});
