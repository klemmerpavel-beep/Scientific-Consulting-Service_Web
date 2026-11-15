/**
 * Необратимые денежные действия подтверждаются одной отметкой (решение
 * Р-909; аудит 15.11.2026, находка Ф-8; ответ владельца на вопрос 5).
 *
 * Прежде «Удалить транш» и «Отметить выплату» срабатывали одним нажатием,
 * «Списать» и «Сторнировать» просили только причину, а то же списание в
 * «Должниках» — отметку.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const page = readFileSync(path.join(SRC, 'projects', '[code]', 'payments', 'page.tsx'), 'utf8');
const actions = readFileSync(path.join(SRC, 'actions.ts'), 'utf8');

/** Тело действия от объявления до закрывающей скобки. */
function action(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start > 0, name);
  return actions.slice(start, actions.indexOf('\n}\n', start));
}

/** Форма с данным действием: от открывающего тега до закрывающего. */
function forms(name: string): string[] {
  const out: string[] = [];
  let at = page.indexOf(`action={${name}}`);
  while (at > 0) {
    out.push(page.slice(at, page.indexOf('</Form>', at)));
    at = page.indexOf(`action={${name}}`, at + 1);
  }
  return out;
}

describe('формы «Оплат и документов» несут отметку (Р-909)', () => {
  it('удаление транша', () => {
    const [form] = forms('dropTranche');
    assert.match(form!, /<Checkbox name="confirm" required nowrap label="Подтверждаю удаление" \/>\s*<Button tone="quiet">Удалить транш<\/Button>/u);
  });

  it('отметка выплаты', () => {
    const [form] = forms('payPayout');
    assert.match(form!, /<Checkbox name="confirm" required nowrap label="Подтверждаю выплату" \/>\s*<Button tone="quiet">Отметить выплату<\/Button>/u);
  });

  it('сторно и списание — отметка рядом с причиной; оплата и счёт — без неё', () => {
    const status = forms('changeTrancheStatus');
    const risky = status.filter((form) => form.includes("next === 'REVERSED' ? 'Причина сторно'"));
    assert.equal(risky.length, 1);
    assert.match(risky[0]!, /label=\{next === 'REVERSED' \? 'Подтверждаю сторно' : 'Подтверждаю списание'\}/u);
    assert.equal(status.filter((form) => form.includes('name="confirm"')).length, 1);
  });
});

describe('сервер не верит форме: без отметки действие не выполняется (Р-909)', () => {
  it('удаление транша', () => {
    const body = action('dropTranche');
    assert.ok(body.indexOf("form.get('confirm') !== 'on'") > 0);
    assert.ok(body.indexOf("form.get('confirm') !== 'on'") < body.indexOf('removeTranche('));
  });

  it('выплата куратору', () => {
    const body = action('payPayout');
    assert.ok(body.indexOf("form.get('confirm') !== 'on'") > 0);
    assert.ok(body.indexOf("form.get('confirm') !== 'on'") < body.indexOf('markPayoutPaid('));
  });

  it('сторно и списание — до смены статуса; прочие статусы отметки не требуют', () => {
    const body = action('changeTrancheStatus');
    assert.match(body, /\(status === 'REVERSED' \|\| status === 'WRITTEN_OFF'\) && form\.get\('confirm'\) !== 'on'/u);
    assert.ok(body.indexOf("form.get('confirm') !== 'on'") < body.indexOf('setTrancheStatus('));
  });

  it('списание в «Должниках» — прежняя отметка', () => {
    assert.match(actions, /if \(form\.get\('confirm'\) !== 'on'\) throw new Error\('Подтвердите списание: долг больше не будет ждать оплаты'\);/u);
  });
});
