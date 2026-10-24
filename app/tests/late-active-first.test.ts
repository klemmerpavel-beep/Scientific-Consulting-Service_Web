/**
 * «Сегодня»: сорванные сроки действующих работ — впереди приостановленных
 * (решение Р-720). Прежде порядок вида «срок работы прошёл» шёл только
 * по сроку: самые давние — у приостановленных (631 и 510 дней), предел вида
 * (2) заполняли они, три действующие работы (387, 116, 21 день) уходили под
 * «Показать все», а «Начать с главного» открывал работу, стоящую больше
 * полутора лет. Число в ответе не меняется: меняется только порядок.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { activeFirst } from '../src/lib/cabinet/missed.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');
const attention = readFileSync(path.join(SRC, 'lib', 'cabinet', 'attention.ts'), 'utf8');

describe('порядок дел «срок работы прошёл» (Р-720)', () => {
  it('действующие — впереди приостановленных, внутри группы — прежний порядок по сроку', () => {
    // Порядок выборки стенда — по сроку, давние сверху.
    const rows = [
      { code: 'PD-2024-009', status: 'PAUSED', days: 631 },
      { code: 'PD-2024-002', status: 'PAUSED', days: 510 },
      { code: 'PD-2025-030', status: 'ACTIVE', days: 387 },
      { code: 'PD-2026-048', status: 'ACTIVE', days: 116 },
      { code: 'PD-2026-047', status: 'ACTIVE', days: 21 },
    ];
    assert.deepEqual(
      activeFirst(rows).map((row) => row.days),
      [387, 116, 21, 631, 510],
    );
    assert.equal(activeFirst(rows).length, rows.length, 'число дел изменилось');
  });

  it('части «Требует внимания» берут вид в этом порядке', () => {
    // Карточка срока несёт пометку «нет куратора» (решение Р-738):
    // порядок — тот же `activeFirst`.
    assert.match(attention, /const late = activeFirst\(light\.lateWorks\);/u);
    assert.match(attention, /late: late\.map\(\(work\) => \(\{ \.\.\.work, noExpert: unassigned\.has\(work\.code\) \}\)\),/u);
  });

  it('в свёрнутом перечне три дела вида: действующие заполняют предел первыми', () => {
    assert.match(page, /\n\s+late: 3,\n/u);
  });

  it('«Начать с главного» и первая строка «Сделать» — первое дело не приостановленной работы', () => {
    assert.match(page, /paused: work\.status === 'PAUSED',/u);
    assert.match(page, /const main = attention\.find\(\(row\) => !\('paused' in row && row\.paused\)\) \?\? attention\[0\];/u);
    assert.match(page, /<ButtonLink href=\{main\.href\}>Начать с главного<\/ButtonLink>/u);
    assert.doesNotMatch(page, /href=\{attention\[0\]!\.href\}/u);
    assert.match(page, /act: \[main, \.\.\.attention\.filter\(\(row\) => row !== main\)\]/u);
  });
});
