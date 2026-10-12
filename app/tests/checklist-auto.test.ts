/**
 * Автоотметки шагов чек-листа по состоянию работы (улучшение У-3,
 * решение Р-556).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTO_NOTE, autoDone, moneySettled, type AutoRule, type WorkState } from '../src/lib/cabinet/checklist-auto.ts';
import { CHECKLISTS, stepAuto } from '../src/lib/cabinet/checklists.ts';

const base: WorkState = {
  curatorReady: false,
  ownNda: null,
  stages: 0,
  stagesDone: 0,
  contractSchedule: null,
  moneySettled: null,
  payoutsPaid: null,
  clientEntered: false,
  status: 'ACTIVE',
};

describe('автоотметки (Р-556)', () => {
  it('каждое правило стоит хотя бы у одного шага и подписано', () => {
    const used = new Set(CHECKLISTS.flatMap((list) => list.steps.map(stepAuto)).filter((rule) => rule !== null));
    for (const rule of Object.keys(AUTO_NOTE) as AutoRule[]) assert.ok(used.has(rule), `правило ${rule} не стоит ни у одного шага`);
  });

  it('этапы согласованы — только когда план есть и закрыт целиком', () => {
    assert.equal(autoDone('stages-done', base), false);
    assert.equal(autoDone('stages-done', { ...base, stages: 3, stagesDone: 2 }), false);
    assert.equal(autoDone('stages-done', { ...base, stages: 3, stagesDone: 3 }), true);
  });

  it('скрытое от смотрящего — «не знаю», а не «нет»', () => {
    // Менеджеру начисления куратору не видны (Р-149): шаг остаётся ручным.
    assert.equal(autoDone('payouts-paid', base), null);
    assert.equal(autoDone('money-settled', base), null);
    assert.equal(autoDone('contract-schedule', base), null);
    assert.equal(autoDone('own-nda', base), null);
    assert.equal(autoDone('payouts-paid', { ...base, payoutsPaid: true }), true);
  });

  it('прочие правила читают своё поле', () => {
    assert.equal(autoDone('curator-ready', { ...base, curatorReady: true }), true);
    assert.equal(autoDone('client-entered', { ...base, clientEntered: true }), true);
    assert.equal(autoDone('work-completed', { ...base, status: 'COMPLETED' }), true);
    assert.equal(autoDone('work-completed', { ...base, status: 'CANCELLED' }), false);
    assert.equal(autoDone('own-nda', { ...base, ownNda: false }), false);
  });

  it('остаток закрыт оплатой и списанием; открытый и сторнированный транш — нет', () => {
    assert.equal(moneySettled(100_00n, []), false);
    assert.equal(moneySettled(0n, []), true);
    assert.equal(moneySettled(100_00n, [{ status: 'PAID', amount: 100_00n }]), true);
    assert.equal(moneySettled(100_00n, [{ status: 'PAID', amount: 60_00n }, { status: 'WRITTEN_OFF', amount: 40_00n }]), true);
    assert.equal(moneySettled(100_00n, [{ status: 'PAID', amount: 60_00n }, { status: 'INVOICED', amount: 40_00n }]), false);
    assert.equal(moneySettled(100_00n, [{ status: 'PAID', amount: 60_00n }, { status: 'REVERSED', amount: 40_00n }]), false);
  });
});
