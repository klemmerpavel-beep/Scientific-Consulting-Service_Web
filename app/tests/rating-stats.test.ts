/**
 * Оценки сопровождения (решение Р-561): оценка с формы, средние по
 * практике, менеджеру и куратору, вид в таблице «Команды».
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { averageOf, formatAverage, parseScore, ratingStats } from '../src/lib/cabinet/rating-stats.ts';

describe('оценки сопровождения (Р-561)', () => {
  it('оценка с формы — целое от 1 до 5', () => {
    assert.equal(parseScore('5'), 5);
    assert.equal(parseScore(' 1 '), 1);
    for (const raw of ['0', '6', '4.5', '', 'пять', '10']) assert.equal(parseScore(raw), null, raw);
  });

  it('средние: по практике, менеджеру и куратору; снятая запись — только в общую', () => {
    const stats = ratingStats([
      { score: 5, managerId: 'm1', expertId: 'e1' },
      { score: 4, managerId: 'm1', expertId: 'e2' },
      { score: 3, managerId: 'm2', expertId: 'e1' },
      { score: 2, managerId: null, expertId: null },
    ]);
    assert.deepEqual(stats.practice, { average: 3.5, count: 4 });
    assert.deepEqual(stats.managers.get('m1'), { average: 4.5, count: 2 });
    assert.deepEqual(stats.managers.get('m2'), { average: 3, count: 1 });
    assert.deepEqual(stats.curators.get('e1'), { average: 4, count: 2 });
    assert.equal(stats.managers.size, 2);
    assert.equal(ratingStats([]).practice, null);
  });

  it('вид: «4,7 (3)», без оценок — «—»', () => {
    assert.equal(formatAverage(averageOf([5, 5, 4])), '4,7 (3)');
    assert.equal(formatAverage(averageOf([])), '—');
    assert.equal(formatAverage(undefined), '—');
  });
});
