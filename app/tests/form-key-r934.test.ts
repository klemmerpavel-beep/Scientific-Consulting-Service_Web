/**
 * Одноразовый ключ формы — часть без базы и разметка (решение Р-934).
 * Занятие ключа на настоящей базе — `form-once.db.test.ts`.
 *
 * Аудит 15.11.2026, находка Ф-9: одна форма, отправленная из двух вкладок,
 * давала два поступления по 7 777 ₽.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { FORM_KEY_FIELD, FORM_KEY_TTL_MS, FORM_REPLAY, formKeyOf, newFormKey } from '../src/lib/cabinet/form-key.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const actions = read('app', 'cabinet', 'actions.ts');

describe('ключ формы (Р-934)', () => {
  it('новый ключ — 32 шестнадцатеричных знака, каждый раз другой', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newFormKey()));
    assert.equal(keys.size, 200);
    for (const key of keys) assert.match(key, /^[0-9a-f]{32}$/u);
  });

  it('из поля принимается только ключ своего вида; иное — отправка без защиты, не отказ', () => {
    const key = newFormKey();
    assert.equal(formKeyOf(key), key);
    for (const value of [null, undefined, '', 'abc', key.toUpperCase(), `${key}0`, key.slice(1), 42, ['x']]) {
      assert.equal(formKeyOf(value), null, String(value));
    }
  });

  it('ключ живёт двое суток; отказ повторной отправки говорит, что делать', () => {
    assert.equal(FORM_KEY_TTL_MS, 172_800_000);
    assert.match(FORM_REPLAY, /уже отправлена.*обновите страницу/u);
    assert.deepEqual(findForbidden(FORM_REPLAY), []);
    assert.equal(FORM_KEY_FIELD, 'formKey');
  });
});

describe('где ключ стоит (Р-934)', () => {
  it('четыре записи выполняются один раз на ключ', () => {
    for (const call of ['recordReceipt(actor,', 'addPayout(actor,', 'createManualOrder(actor,', 'createCabinetRequest(']) {
      const pattern = new RegExp(`once\\(actor\\.id, form\\.get\\(FORM_KEY_FIELD\\), (?:async )?\\(\\) =>\\s*${call.replace(/[()]/gu, '\\$&')}`, 'u');
      assert.match(actions, pattern, call);
    }
    assert.equal((actions.match(/once\(actor\.id, form\.get\(FORM_KEY_FIELD\)/gu) ?? []).length, 4);
  });

  it('поле с ключом стоит в четырёх формах', () => {
    assert.match(read('components', 'cabinet', 'FormKey.tsx'), /<input type="hidden" name=\{FORM_KEY_FIELD\} value=\{newFormKey\(\)\} \/>/u);
    assert.match(read('components', 'cabinet', 'OrderMoney.tsx'), /<FormKey \/>/u);
    const payments = read('app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx');
    assert.match(payments, /action=\{accruePayout\}\s*>\s*<FormKey \/>/u);
    assert.match(read('app', 'cabinet', 'manage', 'orders', 'new', 'page.tsx'), /<Form action=\{createOrder\}>\s*<FormKey \/>/u);
    assert.match(read('app', 'cabinet', 'request', 'page.tsx'), /<Form action=\{submitCabinetRequest\}>\s*<FormKey \/>/u);
  });

  it('отказ записи освобождает ключ: исправленную форму отправляют снова', () => {
    const service = read('lib', 'cabinet', 'form-once.ts');
    assert.match(service, /catch \(error\) \{\s*await releaseFormKey\(key\)\.catch\(\(\) => undefined\);\s*throw error;/u);
    assert.match(service, /if \(key === null\) return run\(\);/u);
  });
});
