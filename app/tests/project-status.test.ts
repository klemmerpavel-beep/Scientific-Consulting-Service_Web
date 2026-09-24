/**
 * Переходы состояния работы (решение Р-223). Проверяется без базы: таблица
 * решает, что куратор может сделать с работой.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PROJECT_STATUS_ACTION,
  PROJECT_STATUS_LABEL,
  canChangeProjectStatus,
  isClosedStatus,
  nextProjectStatuses,
} from '../src/lib/cabinet/project-status.ts';

describe('состояние работы', () => {
  it('действующую можно приостановить, завершить, отменить', () => {
    assert.deepEqual([...nextProjectStatuses('ACTIVE')].sort(), ['CANCELLED', 'COMPLETED', 'PAUSED']);
  });

  it('закрытая возвращается только в действие', () => {
    assert.deepEqual(nextProjectStatuses('COMPLETED'), ['ACTIVE']);
    assert.deepEqual(nextProjectStatuses('CANCELLED'), ['ACTIVE']);
    assert.equal(canChangeProjectStatus('COMPLETED', 'CANCELLED'), false);
  });

  it('в то же состояние перехода нет', () => {
    for (const status of Object.keys(PROJECT_STATUS_LABEL) as (keyof typeof PROJECT_STATUS_LABEL)[]) {
      assert.equal(canChangeProjectStatus(status, status), false, status);
    }
  });

  it('закрытыми считаются завершённая и отменённая', () => {
    assert.equal(isClosedStatus('COMPLETED'), true);
    assert.equal(isClosedStatus('CANCELLED'), true);
    assert.equal(isClosedStatus('PAUSED'), false);
    assert.equal(isClosedStatus('ACTIVE'), false);
  });

  it('у каждого перехода есть название действия', () => {
    for (const status of Object.keys(PROJECT_STATUS_LABEL)) {
      assert.equal(typeof PROJECT_STATUS_ACTION[status as keyof typeof PROJECT_STATUS_ACTION], 'string');
    }
  });
});
