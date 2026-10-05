/**
 * Рабочие дни для срока согласования этапа (требование Т-15, решение
 * Р-290): выходные, праздник ст. 112 ТК РФ, перенос и рабочая суббота из
 * календаря, стык годов, сдача в пятницу и в субботу.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addWorkdays,
  isWorkday,
  previousWorkday,
  workdaysBetween,
} from '../src/lib/cabinet/workdays.ts';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const key = (day: Date) => day.toISOString().slice(0, 10);
const none = new Map<string, boolean>();

describe('рабочие дни', () => {
  it('выходные и праздник 4 ноября — нерабочие', () => {
    assert.equal(isWorkday(d('2026-10-03'), none), false, 'суббота');
    assert.equal(isWorkday(d('2026-10-04'), none), false, 'воскресенье');
    assert.equal(isWorkday(d('2026-10-05'), none), true, 'понедельник');
    assert.equal(isWorkday(d('2026-11-04'), none), false, 'День народного единства');
  });

  it('срок идёт со следующего дня: сдача в понедельник — до понедельника', () => {
    assert.equal(key(addWorkdays(d('2026-09-21'), 5, none)), '2026-09-28');
  });

  it('сдача в пятницу и в субботу дают один срок', () => {
    assert.equal(key(addWorkdays(d('2026-10-02'), 5, none)), '2026-10-09');
    assert.equal(key(addWorkdays(d('2026-10-03'), 5, none)), '2026-10-09');
  });

  it('праздник среди срока сдвигает его на день', () => {
    // 30.10 пт → 2, 3, 5, 6 и 9 ноября: 4 ноября не считается.
    assert.equal(key(addWorkdays(d('2026-10-30'), 5, none)), '2026-11-09');
    assert.equal(key(addWorkdays(d('2026-11-02'), 5, none)), '2026-11-10');
  });

  it('календарь сильнее правила: перенос выходного и рабочая суббота', () => {
    const calendar = new Map([
      ['2026-12-31', false],
      ['2026-12-26', true],
    ]);
    assert.equal(isWorkday(d('2026-12-31'), calendar), false);
    assert.equal(isWorkday(d('2026-12-26'), calendar), true);
    // 24.12 чт → 25 пт, 26 сб (рабочая), 28, 29, 30 — пятый день 30.12.
    assert.equal(key(addWorkdays(d('2026-12-24'), 5, calendar)), '2026-12-30');
  });

  it('стык годов: январские праздники не считаются', () => {
    const calendar = new Map([['2026-12-31', false]]);
    // 29.12 вт → 30.12, затем 31.12 и 1–8 января нерабочие → 11, 12, 13, 14 января.
    assert.equal(key(addWorkdays(d('2026-12-29'), 5, calendar)), '2027-01-14');
  });

  it('остаток и предыдущий рабочий день', () => {
    assert.equal(workdaysBetween(d('2026-09-22'), d('2026-09-28'), none), 5);
    assert.equal(workdaysBetween(d('2026-09-29'), d('2026-09-28'), none), 0);
    assert.equal(key(previousWorkday(d('2026-09-28'), none)), '2026-09-25');
    assert.equal(key(previousWorkday(d('2026-11-05'), none)), '2026-11-03');
  });

  it('нулевой срок — сам день', () => {
    assert.equal(key(addWorkdays(d('2026-10-05'), 0, none)), '2026-10-05');
  });
});
