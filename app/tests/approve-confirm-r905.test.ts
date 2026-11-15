/**
 * Согласование этапа клиентом — с отметкой и по моменту отправки (решение
 * Р-905; аудит 15.11.2026, находки Ф-4 и Ф-1; ответ владельца на вопрос 1).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'stages', '[id]', 'page.tsx'), 'utf8');
const actions = readFileSync(path.join(SRC, 'app', 'cabinet', 'actions.ts'), 'utf8');

describe('форма согласования этапа (Р-905)', () => {
  const start = page.indexOf('<Form action={approveStage}>');
  const form = page.slice(start, page.indexOf('</Form>', start));

  it('форма несёт этап, момент отправки и обязательную отметку', () => {
    assert.ok(start > 0, 'форма согласования не найдена');
    assert.match(form, /name="stageId" value=\{stage\.id\}/u);
    assert.match(form, /name="sentAt" value=\{stage\.approvalSentAt\?\.toISOString\(\) \?\? ''\}/u);
    assert.match(form, /<Checkbox name="seen" required label="Я посмотрел последнюю версию материалов и итог этапа" \/>/u);
    assert.match(form, /<Button>Согласовать этап<\/Button>/u);
  });

  it('форма возврата с замечаниями несёт тот же момент отправки', () => {
    const back = page.slice(page.indexOf('<Form action={returnStageWithRemarks}>'));
    assert.match(back.slice(0, 400), /name="sentAt" value=\{stage\.approvalSentAt\?\.toISOString\(\) \?\? ''\}/u);
  });
});

describe('действие согласования (Р-905)', () => {
  const start = actions.indexOf('export async function approveStage(');
  const body = actions.slice(start, actions.indexOf('\n}\n', start));

  it('без отметки этап не согласуется — отказ до обращения к службе', () => {
    assert.match(body, /if \(form\.get\('seen'\) !== 'on'\) \{\s*failure = 'Отметьте, что посмотрели последнюю версию материалов, — и согласуйте этап';/u);
    assert.ok(body.indexOf("form.get('seen')") < body.indexOf('setStageState('));
  });

  it('момент отправки уходит в службу', () => {
    assert.match(body, /setStageState\(actor, stageId, 'DONE', null, typeof sentAt === 'string' \? sentAt : null\)/u);
  });
});
