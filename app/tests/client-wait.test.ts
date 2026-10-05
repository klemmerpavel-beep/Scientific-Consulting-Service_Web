/**
 * Сколько этап ждал материалов клиента (часть F, МП-05, решение Р-381):
 * сумма отрезков в «Ждёт материалов клиента», включая идущий; отрезок до
 * переноса срока считается с переноса.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clientWaitDays } from '../src/lib/cabinet/stage-state.ts';

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 9));

describe('ожидание клиента на этапе (МП-05)', () => {
  const changes = [
    { toState: 'IN_PROGRESS', createdAt: day(1) },
    { toState: 'AWAITING_CLIENT', createdAt: day(3) },
    { toState: 'IN_PROGRESS', createdAt: day(6) },
    { toState: 'AWAITING_CLIENT', createdAt: day(8) },
  ];
  it('закрытый отрезок и идущий складываются', () => {
    assert.equal(clientWaitDays(changes, null, day(10)), 5);
  });
  it('после переноса срока — только ожидание после него', () => {
    assert.equal(clientWaitDays(changes, day(7), day(10)), 2);
    assert.equal(clientWaitDays(changes, day(9), day(10)), 1);
  });
  it('без ожидания — ноль; порядок переходов не важен', () => {
    assert.equal(clientWaitDays([{ toState: 'IN_PROGRESS', createdAt: day(1) }], null, day(10)), 0);
    assert.equal(clientWaitDays([...changes].reverse(), null, day(10)), 5);
  });
});
