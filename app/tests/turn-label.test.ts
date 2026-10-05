/**
 * Подпись «чей ход» — со стороны смотрящего (требование М-17, решения
 * Р-206, Р-288); этап, сданный куратором, — ход менеджера (требование
 * Э-05, решение Р-325); этап «Не начат» куратору — ход менеджера
 * (требование Э-04, решение Р-329).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handoverOf, turnLabel } from '../src/lib/cabinet/stage-state.ts';

describe('подпись хода', () => {
  it('куратору — «за вами», руководителю по чужой работе — «за менеджером»', () => {
    assert.equal(turnLabel('NOT_STARTED', 'curator', true), 'Ход за вами: этап не начат');
    assert.equal(turnLabel('NOT_STARTED', 'foreign-head', true), 'Ход за менеджером: этап не начат');
  });

  it('куратору этап «Не начат» — ход за менеджером (Э-04)', () => {
    assert.equal(turnLabel('NOT_STARTED', 'expert', true), 'Ход за менеджером: этап ещё не запущен');
  });

  it('этап в работе: куратору — «за вами», практике — «за куратором»', () => {
    assert.equal(turnLabel('IN_PROGRESS', 'expert', true), 'Ход за вами: этап в работе');
    assert.equal(turnLabel('IN_PROGRESS', 'curator', true), 'Ход за куратором: этап в работе');
  });

  it('этап в работе без куратора — дело менеджера', () => {
    assert.equal(turnLabel('IN_PROGRESS', 'curator', false), 'Ход за вами: назначьте куратора');
  });

  it('ожидание клиента называется одинаково для всех', () => {
    for (const viewer of ['curator', 'foreign-head', 'expert'] as const) {
      assert.equal(turnLabel('AWAITING_CLIENT', viewer, true), 'Ход за клиентом: ждём материалов');
      assert.equal(turnLabel('IN_APPROVAL', viewer, true), 'Ход за клиентом: этап на согласовании');
    }
  });

  it('сданный куратором этап — ход за менеджером', () => {
    const day = new Date(Date.UTC(2026, 9, 3, 12));
    assert.equal(turnLabel('IN_PROGRESS', 'expert', true, day), 'Этап сдан 3 октября 2026: ход за менеджером');
    assert.equal(turnLabel('IN_PROGRESS', 'curator', true, day), 'Ход за вами: куратор сдал этап 3 октября 2026');
    assert.equal(turnLabel('IN_PROGRESS', 'foreign-head', true, day), 'Ход за менеджером: куратор сдал этап 3 октября 2026');
    // Вне «В работе» пометка не действует.
    assert.equal(turnLabel('IN_APPROVAL', 'expert', true, day), 'Ход за клиентом: этап на согласовании');
  });
});

describe('пометка «сдан куратором» без нового состояния (Э-05)', () => {
  const day = new Date(Date.UTC(2026, 9, 3));
  it('сдан, возвращён, не сдан', () => {
    assert.equal(handoverOf({ state: 'IN_PROGRESS', handedOverAt: day, handbackAt: null }), 'handed');
    assert.equal(handoverOf({ state: 'IN_PROGRESS', handedOverAt: null, handbackAt: day }), 'handed-back');
    assert.equal(handoverOf({ state: 'IN_PROGRESS', handedOverAt: null, handbackAt: null }), 'none');
    assert.equal(handoverOf({ state: 'IN_APPROVAL', handedOverAt: day, handbackAt: null }), 'none');
  });
});
