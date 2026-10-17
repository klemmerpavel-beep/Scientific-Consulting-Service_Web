/**
 * Раскладка «Сводки» руководителя (план по образцу, К-5, решение Р-595):
 * снисходительное чтение сохранённого значения, раскладка из формы,
 * видимые плашки и раскладка по умолчанию.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LAYOUT,
  SUMMARY_BANDS,
  formNumber,
  SUMMARY_PLATES,
  isDefaultLayout,
  isShown,
  layoutFromChoices,
  parseLayout,
  visiblePlates,
} from '../src/lib/cabinet/summary-layout.ts';

const KEYS = SUMMARY_PLATES.map((plate) => plate.key);

describe('раскладка «Сводки»', () => {
  it('по умолчанию — восемь плашек в порядке Р-576, всё видно', () => {
    assert.deepEqual(KEYS, ['team', 'load', 'months', 'demand', 'deadlines', 'money', 'works', 'leads']);
    assert.deepEqual(SUMMARY_BANDS.map((band) => band.key), ['review', 'pulse']);
    assert.deepEqual(visiblePlates(DEFAULT_LAYOUT), KEYS);
    assert.equal(isShown(DEFAULT_LAYOUT, 'pulse'), true);
    assert.equal(isDefaultLayout(DEFAULT_LAYOUT), true);
  });

  it('пустое или чужое значение — раскладка по умолчанию', () => {
    for (const value of [null, undefined, 'team', 42, [], { order: 'team' }]) {
      assert.deepEqual(parseLayout(value), DEFAULT_LAYOUT, JSON.stringify(value));
    }
  });

  it('неизвестные ключи отбрасываются, повторы схлопываются, недостающие плашки встают в конец и видны', () => {
    const layout = parseLayout({ order: ['money', 'bogus', 'money', 'leads'], hidden: ['team', 'bogus', 'review', 'team'] });
    assert.deepEqual(layout.order, ['money', 'leads', 'team', 'load', 'months', 'demand', 'deadlines', 'works']);
    assert.deepEqual(layout.hidden, ['team', 'review']);
    assert.deepEqual(visiblePlates(layout), ['money', 'leads', 'load', 'months', 'demand', 'deadlines', 'works']);
    assert.equal(isShown(layout, 'review'), false);
    assert.equal(isShown(layout, 'pulse'), true);
  });

  it('из формы: передвинутая на занятое место плашка встаёт на него, остальные сдвигаются', () => {
    const choices = KEYS.map((key, index) => ({ key, place: index + 1, was: index + 1, shown: true }));
    choices[5] = { key: 'money', place: 1, was: 6, shown: true };
    const layout = layoutFromChoices(choices);
    assert.deepEqual(layout.order, ['money', 'team', 'load', 'months', 'demand', 'deadlines', 'works', 'leads']);
    // Вниз: «Команда» с места 1 на место 8 — после «Заявок», последней.
    const down = KEYS.map((key, index) => ({ key, place: index + 1, was: index + 1, shown: true }));
    down[0] = { key: 'team', place: 8, was: 1, shown: true };
    assert.deepEqual(layoutFromChoices(down).order, ['load', 'months', 'demand', 'deadlines', 'money', 'works', 'leads', 'team']);
  });

  it('из формы: порядок считается от показанной раскладки, а не от раскладки по умолчанию', () => {
    // Показана раскладка «Деньги первыми»; ничего не меняли — она и остаётся.
    const shown = ['money', 'team', 'load', 'months', 'demand', 'deadlines', 'works', 'leads'];
    const layout = layoutFromChoices(shown.map((key, index) => ({ key, place: index + 1, was: index + 1, shown: true })));
    assert.deepEqual(layout.order, shown);
  });

  it('из формы: снятый флажок — скрыто; ключа без строки в форме нет — его показ не трогается', () => {
    const layout = layoutFromChoices([
      { key: 'team', place: 1, shown: false },
      { key: 'pulse', place: Number.NaN, shown: false },
      { key: 'review', place: Number.NaN, shown: true },
      { key: 'bogus', place: 1, shown: false },
    ]);
    assert.deepEqual(layout.hidden, ['team', 'pulse']);
    assert.equal(isShown(layout, 'review'), true);
    // Место без числа — место по умолчанию.
    assert.deepEqual(layout.order, KEYS);
  });

  it('ключ без строки в форме сохраняет прежний показ, а не включается сам', () => {
    const layout = layoutFromChoices(
      KEYS.filter((key) => key !== 'leads').map((key, index) => ({ key, place: index + 1, was: index + 1, shown: true })),
      { order: KEYS, hidden: ['pulse', 'leads'] },
    );
    assert.deepEqual(layout.hidden, ['leads', 'pulse']);
  });

  it('пустое и отсутствующее поле формы — не число, а не ноль: плашка не взлетает наверх', () => {
    assert.ok(Number.isNaN(formNumber(null)));
    assert.ok(Number.isNaN(formNumber('')));
    assert.ok(Number.isNaN(formNumber('  ')));
    assert.equal(formNumber('3'), 3);
    const choices = KEYS.map((key, index) => ({ key, place: index + 1, was: index + 1, shown: true }));
    choices[5] = { key: 'money', place: formNumber(null), was: formNumber(null), shown: true };
    assert.deepEqual(layoutFromChoices(choices).order, KEYS);
  });

  it('раскладка по умолчанию не хранится; любое отличие — хранится', () => {
    assert.equal(isDefaultLayout(layoutFromChoices(KEYS.map((key, index) => ({ key, place: index + 1, shown: true })))), true);
    assert.equal(isDefaultLayout({ order: KEYS, hidden: ['pulse'] }), false);
    assert.equal(isDefaultLayout({ order: [...KEYS].reverse(), hidden: [] }), false);
  });
});
