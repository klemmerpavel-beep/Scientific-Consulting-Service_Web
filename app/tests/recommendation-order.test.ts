/**
 * Порядок карточек в лентах рекомендаций (решение Р-499): ждущие решения,
 * принятые, закрытые; принятые не уходят за предел ленты; хвост «и ещё»
 * считает только ждущих решения.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { laneOrder, limitedLane, markStage } from '../src/lib/cabinet/recommendation-order.ts';

type Row = { key: string };
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ key: `r${i + 1}` }));

describe('порядок лент рекомендаций (Р-499)', () => {
  it('ступени: нет отметки, принято, остальное', () => {
    assert.equal(markStage(undefined), 0);
    assert.equal(markStage({ status: 'ACCEPTED' }), 1);
    for (const status of ['DECLINED', 'DONE', 'POSTPONED']) assert.equal(markStage({ status }), 2);
  });

  it('лента без предела: ждущие, принятые, закрытые; внутри ступени порядок прежний', () => {
    const marks = new Map([
      ['r1', { status: 'DONE' }],
      ['r2', { status: 'ACCEPTED' }],
      ['r4', { status: 'DECLINED' }],
      ['r5', { status: 'ACCEPTED' }],
    ]);
    const order = laneOrder(rows(6), (row) => marks.get(row.key)).map((row) => row.key);
    assert.deepEqual(order, ['r3', 'r6', 'r2', 'r5', 'r1', 'r4']);
  });

  it('при десяти ждущих принятая карточка не уходит за предел', () => {
    const marks = new Map([['r12', { status: 'ACCEPTED' }], ['r13', { status: 'DONE' }]]);
    const lane = limitedLane(rows(13), (row) => marks.get(row.key), 10);
    const keys = lane.shown.map((row) => row.key);
    assert.ok(keys.includes('r12'), 'принятая карточка спрятана');
    assert.equal(keys.filter((key) => key !== 'r12').length, 10);
    assert.ok(!keys.includes('r13'), 'закрытая заняла место ждущей');
    assert.equal(lane.hiddenOpen, 1);
  });

  it('закрытые заполняют остаток и в «и ещё» не считаются', () => {
    const marks = new Map(rows(12).slice(5).map((row) => [row.key, { status: 'DONE' }] as const));
    const lane = limitedLane(rows(12), (row) => marks.get(row.key), 10);
    assert.equal(lane.shown.length, 10);
    assert.deepEqual(lane.shown.slice(0, 5).map((row) => row.key), ['r1', 'r2', 'r3', 'r4', 'r5']);
    assert.equal(lane.hiddenOpen, 0);
  });
});
