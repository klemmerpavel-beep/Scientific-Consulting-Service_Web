/**
 * Переходы состояния этапа — одна таблица для сервера и экрана (решение
 * Р-229). Прежде сервер принимал «В работе → Не начат», которого экран не
 * предлагал.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { STAGE_TRANSITIONS, stageStateButtons } from '../src/lib/cabinet/stage-state.ts';

const APP = path.join(import.meta.dirname, '..');

describe('переходы состояния этапа', () => {
  it('начатый этап в «не начат» не возвращается', () => {
    assert.equal(STAGE_TRANSITIONS.IN_PROGRESS.includes('NOT_STARTED'), false);
    for (const from of Object.keys(STAGE_TRANSITIONS) as (keyof typeof STAGE_TRANSITIONS)[]) {
      if (from === 'NOT_STARTED') continue;
      assert.equal(STAGE_TRANSITIONS[from].includes('NOT_STARTED'), false, from);
    }
  });

  it('кнопки экрана — таблица без завершения: оно идёт согласованием', () => {
    assert.deepEqual(stageStateButtons('IN_APPROVAL'), ['IN_PROGRESS']);
    assert.deepEqual(stageStateButtons('IN_PROGRESS'), ['AWAITING_CLIENT', 'IN_APPROVAL']);
    assert.deepEqual(stageStateButtons('DONE'), []);
  });

  it('сервер и экран не держат своих копий таблицы', () => {
    const server = readFileSync(path.join(APP, 'src/lib/cabinet/projects.ts'), 'utf8');
    const screen = readFileSync(path.join(APP, 'src/app/cabinet/stages/[id]/page.tsx'), 'utf8');
    assert.match(server, /STAGE_TRANSITIONS\[from\]/u);
    assert.equal(/NEXT_STATES|const TRANSITIONS/u.test(screen + server), false);
  });
});
