/**
 * Период отчёта — московскими днями по сегодняшний включительно (решение
 * Р-448).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { periodBounds, receivedBetween, type ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';
import { moscowToday } from '../src/lib/cabinet/clock.ts';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('границы периода отчёта (Р-448)', () => {
  it('в первые часы московских суток платёж сегодняшнего дня входит в период', () => {
    // 01:30 по Москве 8 октября — в UTC это ещё 7 октября.
    const now = new Date('2026-10-07T22:30:00Z');
    const { from, to } = periodBounds(moscowToday(now), 30);
    assert.equal(to.toISOString(), '2026-10-08T00:00:00.000Z');
    assert.equal(from.toISOString(), '2026-09-09T00:00:00.000Z');
    const row = { payments: [{ on: day('2026-10-08'), amount: 100n }, { on: day('2026-09-08'), amount: 7n }] } as unknown as ProjectRow;
    assert.equal(receivedBetween([row], from, to), 100n, 'платёж сегодняшнего дня выпал или вчерашний за границей вошёл');
  });

  it('отчёт и главная берут границы из periodBounds, а не от текущего момента', () => {
    const APP = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');
    for (const file of ['report/page.tsx', 'page.tsx']) {
      const source = readFileSync(path.join(APP, file), 'utf8');
      assert.match(source, /periodBounds\(moscowToday\(/u, file);
      assert.doesNotMatch(source, /receivedBetween\([^)]*clockNow\(\)\)/u, file);
    }
  });
});
