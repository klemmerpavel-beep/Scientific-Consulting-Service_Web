/**
 * Записка куратора остаётся у практики (решение Р-900).
 *
 * Аудит 15.11.2026 (находка П-1): записка куратора при сдаче этапа
 * подставлялась в поле «Итог этапа» формы перевода на согласование. Итог
 * читает клиент — над кнопками согласования и в письме. Менеджер, не
 * поправивший поле, отправлял клиенту внутреннюю записку; на стенде она
 * дошла и на экран, и в письмо «Этап готов к согласованию».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'stages', '[id]', 'page.tsx'),
  'utf8',
);

/** Форма перевода на согласование: от её условия до закрывающего `</Form>`. */
function approvalForm(): string {
  const start = page.indexOf(".filter((next) => next === 'IN_APPROVAL' && stage.materials.length > 0)");
  assert.ok(start > 0, 'форма перевода на согласование не найдена');
  return page.slice(start, page.indexOf('</Form>', start));
}

describe('записка куратора не уходит клиенту по умолчанию (Р-900)', () => {
  it('поле «Итог этапа» подставляет только черновик формы и прежний итог', () => {
    const form = approvalForm();
    assert.match(form, /label="Итог этапа: что сделано и что дальше"/u);
    assert.match(form, /defaultValue=\{draft\.outcome \?\? stage\.outcome \?\? ''\}/u);
    assert.doesNotMatch(form, /handoverNote/u);
  });

  it('записка подставляется только в свою форму — куратору при повторной сдаче', () => {
    const uses = [...page.matchAll(/defaultValue=\{[^}]*handoverNote[^}]*\}/gu)].map((match) => match[0]);
    assert.deepEqual(uses, ["defaultValue={draft.note ?? stage.handoverNote ?? ''}"]);
  });

  it('менеджеру и куратору сказано, что клиент записку не видит', () => {
    assert.match(page, /Записку видит только практика: клиенту она не показывается и в «Итог этапа» не\s+подставляется\./u);
    assert.match(page, /по ней напишет «Итог этапа» для клиента\. Клиенту записка не показывается\./u);
    assert.doesNotMatch(page, /Записка подставлена черновиком/u);
  });
});
