/**
 * Подпись «чей ход» — со стороны смотрящего (требование М-17, решения
 * Р-206, Р-288).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { turnLabel } from '../src/lib/cabinet/stage-state.ts';

describe('подпись хода', () => {
  it('куратору — «за вами», руководителю по чужой работе — «за менеджером»', () => {
    assert.equal(turnLabel('NOT_STARTED', 'curator', true), 'Ход за вами: этап не начат');
    assert.equal(turnLabel('NOT_STARTED', 'foreign-head', true), 'Ход за менеджером: этап не начат');
  });

  it('этап в работе: эксперту — «за вами», практике — «за экспертом»', () => {
    assert.equal(turnLabel('IN_PROGRESS', 'expert', true), 'Ход за вами: этап в работе');
    assert.equal(turnLabel('IN_PROGRESS', 'curator', true), 'Ход за экспертом: этап в работе');
  });

  it('этап в работе без эксперта — дело куратора', () => {
    assert.equal(turnLabel('IN_PROGRESS', 'curator', false), 'Ход за вами: назначьте эксперта');
  });

  it('ожидание клиента называется одинаково для всех', () => {
    for (const viewer of ['curator', 'foreign-head', 'expert'] as const) {
      assert.equal(turnLabel('AWAITING_CLIENT', viewer, true), 'Ход за клиентом: ждём материалов');
      assert.equal(turnLabel('IN_APPROVAL', viewer, true), 'Ход за клиентом: этап на согласовании');
    }
  });
});
