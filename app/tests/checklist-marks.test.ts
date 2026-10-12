/**
 * Отметки чек-листа вида работы — правила без базы (решение Р-555): счёт
 * и разница по отправке формы.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checklistProgress, markChanges, serviceChecklist } from '../src/lib/cabinet/service-checklists.ts';

const list = serviceChecklist('diploma')!;
const [a, b, c] = list.steps.map((step) => step.key);

describe('отметки чек-листа работы (Р-555)', () => {
  it('счёт — по действующим шагам; снятый шаг в счёт не идёт', () => {
    assert.deepEqual(checklistProgress(list, []), { done: 0, total: list.steps.length });
    assert.deepEqual(checklistProgress(list, [a!, b!, 'removed-step']), { done: 2, total: list.steps.length });
  });

  it('меняется только разница между показом и отправкой', () => {
    assert.deepEqual(markChanges(list, [], [a!, b!]), { add: [a, b], remove: [] });
    assert.deepEqual(markChanges(list, [a!, b!], [b!, c!]), { add: [c], remove: [a] });
    assert.deepEqual(markChanges(list, [a!], [a!]), { add: [], remove: [] });
  });

  it('чужая отметка, поставленная после показа формы, не снимается', () => {
    // Форма показана без шага `c`; пока она открыта, коллега отметил `c`.
    // Отправка без `c` не трогает его: `c` не было в показанном.
    assert.deepEqual(markChanges(list, [a!], [a!, b!]), { add: [b], remove: [] });
  });

  it('ключи не из чек-листа отбрасываются', () => {
    assert.deepEqual(markChanges(list, ['x'], ['y', a!]), { add: [a], remove: [] });
  });
});
