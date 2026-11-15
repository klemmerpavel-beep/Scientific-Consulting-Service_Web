/**
 * Все этапы согласованы, а работа действует: клиенту не пишут «Работа
 * закрыта» (решение Р-911).
 *
 * Аудит 15.11.2026, находка Ф-7: после согласования последнего этапа
 * плашка хода отвечала «Работа закрыта. Материалы остаются доступны
 * здесь» при состоянии работы «Действует» и неоплаченном остатке. Ответ
 * о закрытии даёт только состояние работы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ui = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'ui.tsx'), 'utf8');
const answer = /function panelAnswer\([\s\S]*?\n\}\n/u.exec(ui)?.[0] ?? '';

describe('плашка хода: этапы закрыты, работа действует (Р-911)', () => {
  it('ответ найден', () => {
    assert.ok(answer.length > 0);
  });

  it('«Работа закрыта» говорит только состояние работы', () => {
    const closed = [...answer.matchAll(/Работа закрыта\./gu)];
    assert.equal(closed.length, 1);
    const before = answer.slice(0, closed[0]!.index);
    assert.match(before, /projectStatus === 'COMPLETED' \|\| projectStatus === 'CANCELLED'\)\) \{\s*return '$/u);
  });

  it('без текущего этапа клиент читает, что работа ещё не закрыта', () => {
    assert.match(answer, /return staff \? 'Все этапы закрыты\.' : ALL_STAGES_DONE_CLIENT;/u);
    assert.match(ui, /ALL_STAGES_DONE_CLIENT =\s*'Все этапы завершены\. Работа ещё не закрыта — о следующих шагах сообщит менеджер\.'/u);
  });

  it('клиент видит сотрудника словом «менеджер», без имени', () => {
    const line = /ALL_STAGES_DONE_CLIENT =\s*'([^']+)'/u.exec(ui)?.[1] ?? '';
    assert.doesNotMatch(line, /руководител|куратор|эксперт/iu);
  });
});
