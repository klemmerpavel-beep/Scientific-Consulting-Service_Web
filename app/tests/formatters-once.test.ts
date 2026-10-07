/**
 * Форматы дат по Москве создаются один раз на модуль (решение Р-474):
 * создание `Intl.DateTimeFormat` стоит сотни микросекунд, а день по Москве
 * считается на каждую заявку, этап и сообщение — экран руководителя с
 * тысячами заявок тратил на это секунды.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { moscowHour, moscowToday } from '../src/lib/cabinet/clock.ts';
import { formatDay } from '../src/lib/cabinet/approval-text.ts';

const root = path.join(import.meta.dirname, '../src');

describe('форматы дат — один раз на модуль', () => {
  it('создание формата — только на верхнем уровне модуля', () => {
    for (const file of ['lib/cabinet/clock.ts', 'components/cabinet/ui.tsx', 'lib/cabinet/approval-text.ts']) {
      const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
      const inside = lines.filter((line) => /new Intl\.DateTimeFormat/u.test(line) && !/^const [A-Z_]+ = new Intl\.DateTimeFormat/u.test(line));
      assert.deepEqual(inside, [], `${file}: формат создаётся при каждом вызове`);
    }
    assert.doesNotMatch(readFileSync(path.join(root, 'components/cabinet/ui.tsx'), 'utf8'), /toLocaleTimeString/u);
  });

  it('значения прежние', () => {
    assert.equal(moscowToday(new Date('2026-10-06T22:30:00Z')).toISOString(), '2026-10-07T00:00:00.000Z');
    assert.equal(moscowToday(new Date('2026-10-07T20:59:00Z')).toISOString(), '2026-10-07T00:00:00.000Z');
    assert.equal(moscowHour(new Date('2026-10-07T06:00:00Z')), 9);
    assert.equal(moscowHour(new Date('2026-10-07T21:00:00Z')), 0);
    assert.equal(formatDay(new Date('2026-09-28T00:00:00Z')), '28 сентября 2026');
  });
});
