/**
 * Сверка заказчика при ручном заказе (требование М-18, решение Р-308):
 * почта проверяется по формату, о карточках, найденных только по ФИО,
 * менеджер видит маски контактов и число работ (ОМ-5).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { candidateLine, maskEmail, maskPhone, orderEmail, orderRetryDraft } from '../src/lib/cabinet/client-match.ts';
import { packDraft } from '../src/lib/cabinet/flash-value.ts';

describe('сверка заказчика', () => {
  it('почта — по формату, в нижнем регистре', () => {
    assert.equal(orderEmail('  Ivanov@Mail.RU '), 'ivanov@mail.ru');
    assert.equal(orderEmail('ivanov@mail'), null);
    assert.equal(orderEmail('иванов mail.ru'), null);
    assert.equal(orderEmail(''), null);
  });

  it('маски: почта — первая буква и зона, телефон — две последние цифры', () => {
    assert.equal(maskEmail('ivanov@mail.ru'), 'i***@m***.ru');
    assert.equal(maskPhone('+7 (900) 123-45-67'), '*** ***-**-67');
    assert.equal(maskEmail(null), null);
    assert.equal(maskPhone('12'), null);
  });

  it('строка выбора — без адреса и номера целиком', () => {
    const line = candidateLine({
      id: 'c1',
      fullName: 'Иванов Иван Иванович',
      email: 'ivanov@mail.ru',
      phone: '+7 900 123-45-67',
      works: 2,
    });
    assert.equal(line, 'Иванов Иван Иванович · i***@m***.ru · *** ***-**-67 · работ: 2');
    assert.doesNotMatch(line, /ivanov@|123-45/u);
  });
});

describe('повтор «Нового заказа» после совпадения по ФИО (Р-645)', () => {
  const form = (summary: string): Record<string, string> => ({
    customer: 'Иванов Иван Иванович',
    email: '',
    phone: '',
    serviceTypeId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
    title: 'Диссертация',
    topic: 'Тема работы, цель, особые условия',
    summary,
    university: 'МГУ имени М. В. Ломоносова',
    speciality: '5.2.3. Региональная и отраслевая экономика',
    orderedOn: '2026-10-21',
    dueOn: '2026-12-01',
    cost: '125 000',
    paid: '0',
    status: 'ACTIVE',
    managerId: '7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  });

  it('длинная суть задачи уступает место выбору карточки, причина об этом говорит', () => {
    const { draft, note } = orderRetryDraft(form('я'.repeat(1500)), true);
    assert.notEqual(packDraft('0123456789ab', draft), null);
    assert.equal(draft.clientChoiceNeeded, '1');
    assert.equal(draft.customer, 'Иванов Иван Иванович');
    assert.equal(draft.summary, undefined);
    assert.equal(draft.topic, 'Тема работы, цель, особые условия');
    assert.equal(note, 'Поле «Суть задачи» не сохранено — вставьте его снова после выбора карточки.');
  });

  it('при пределе службы в 2000 знаков уступают и соседние длинные поля, все названы', () => {
    const fields = { ...form('я'.repeat(2000)), topic: 'т'.repeat(1400) };
    const { draft, note } = orderRetryDraft(fields, true);
    assert.notEqual(packDraft('0123456789ab', draft), null);
    assert.equal(draft.clientChoiceNeeded, '1');
    assert.equal(draft.summary, undefined);
    assert.equal(draft.topic, undefined);
    assert.equal(draft.university, 'МГУ имени М. В. Ломоносова');
    assert.equal(note, 'Поля «Суть задачи» и «Описание работы» не сохранены — вставьте их снова после выбора карточки.');
  });

  it('короткий черновик сохраняется целиком; без выбора карточки черновик не меняется', () => {
    const short = orderRetryDraft(form('Цель и задачи'), true);
    assert.deepEqual(short.draft, { ...form('Цель и задачи'), clientChoiceNeeded: '1' });
    assert.equal(short.note, null);
    const plain = orderRetryDraft(form('я'.repeat(1500)), false);
    assert.deepEqual(plain.draft, form('я'.repeat(1500)));
    assert.equal(plain.note, null);
  });

  it('действие «Завести заказ» собирает черновик повтора и дописывает причину', () => {
    const actions = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'actions.ts'), 'utf8');
    const body = actions.slice(actions.indexOf('export async function createOrder('), actions.indexOf('export async function saveProjectContract('));
    assert.match(body, /orderRetryDraft\(values, choiceNeeded\)/u);
    assert.match(body, /withError\(back, note === null \? reason : `\$\{reason\} \$\{note\}`, \{ draft \}\)/u);
  });
});
