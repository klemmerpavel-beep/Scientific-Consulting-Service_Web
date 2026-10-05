/**
 * Первая строка письма о работе (улучшение УК-06, решение Р-362): клиенту —
 * название без кода, сотруднику — с кодом.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { workLine } from '../src/lib/cabinet/work-line.ts';

describe('первая строка письма о работе (УК-06)', () => {
  const work = { code: 'PD-2026-061', title: 'Сопровождение ВКР' };
  it('клиенту — название без кода', () => {
    assert.equal(workLine(work, true), 'Работа «Сопровождение ВКР».');
  });
  it('сотруднику — с кодом', () => {
    assert.equal(workLine(work, false), 'Работа PD-2026-061 — Сопровождение ВКР.');
  });
});
