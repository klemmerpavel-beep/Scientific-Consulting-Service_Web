/**
 * «Чек-лист сдачи» открывается у формы сдачи и не стирает записку
 * менеджеру (решение Р-733). Прежде кнопка «Чек-лист сдачи» под
 * запиской уводила на экран чек-листов: записку можно было потерять, а
 * назад к этапу вели три перехода. Теперь семь шагов «Проверки версии
 * перед сдачей этапа» — свёрткой в самой форме, над запиской; текст шагов —
 * из того же определения `checklists.ts`, ссылка на полный экран — внутри
 * свёртки (вход у формы — Р-552).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CHECKLISTS, stepText } from '../src/lib/cabinet/checklists.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'),
  'utf8',
);

describe('чек-лист сдачи в форме сдачи (Р-733)', () => {
  const start = page.indexOf('<Form action={handOverStageAction}>');
  const form = page.slice(start, page.indexOf('</Form>', start));

  it('порядок в форме: чек-лист — записка — «Сдать этап менеджеру»', () => {
    const fold = form.indexOf('<Disclosure title="Чек-лист сдачи"');
    const note = form.indexOf('name="note"');
    const button = form.indexOf('<Button>Сдать этап менеджеру</Button>');
    assert.ok(fold > 0 && note > fold && button > note, `свёртка ${fold}, записка ${note}, кнопка ${button}`);
  });

  it('шаги — из определения «expert-handover», ссылка на экран чек-листов — внутри свёртки', () => {
    assert.match(page, /CHECKLISTS\.find\(\(list\) => list\.key === 'expert-handover'\)\?\.steps \?\? \[\]\)\.map\(stepText\)/u);
    assert.match(form, /\{HANDOVER_STEPS\.map\(\(step\) => \(/u);
    const fold = form.slice(form.indexOf('<Disclosure title="Чек-лист сдачи"'), form.indexOf('</Disclosure>'));
    assert.match(fold, /href="\/cabinet\/manage\/checklists\?view=own#expert-handover"/u);
    const steps = CHECKLISTS.find((list) => list.key === 'expert-handover')?.steps.map(stepText) ?? [];
    assert.equal(steps.length, 7);
  });

  it('кнопки-перехода к чек-листу в ряду действий формы больше нет', () => {
    assert.doesNotMatch(form, /<ButtonLink href="\/cabinet\/manage\/checklists/u);
  });
});
