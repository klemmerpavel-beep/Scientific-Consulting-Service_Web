/**
 * Отказ действия называет поле (аудит 15.11.2026, находка Д-2; решение
 * Р-936): экран ставит полю `aria-invalid` и ссылку на текст отказа.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { faultField } from '../src/lib/cabinet/fault-field.ts';
import { packFlash, unpackFlashEntry } from '../src/lib/cabinet/flash-value.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const DUE = { 'due-reason': 'reason', 'due-dueOn': 'date' } as const;
const RECEIPT = { 'receipt-paidOn': 'date', 'receipt-amount': 'amount' } as const;

describe('поле, к которому относится отказ', () => {
  it('отказ, назвавший предмет поля, относится к этому полю', () => {
    assert.equal(faultField('Укажите новый срок этапа', DUE), 'due-dueOn');
    assert.equal(faultField('Новый срок совпадает с прежним', DUE), 'due-dueOn');
    assert.equal(faultField('Укажите дату поступления', RECEIPT), 'receipt-paidOn');
    assert.equal(faultField('Сумма поступления — число больше нуля', RECEIPT), 'receipt-amount');
    assert.equal(faultField('Пустое сообщение не отправляется', { body: 'text' }), 'body');
    assert.equal(faultField('Учётная запись с таким адресом уже есть', { email: 'email', fullName: 'person' }), 'email');
    assert.equal(faultField('Укажите название работы.', { email: 'email', title: 'title' }), 'title');
  });

  it('фраза с двумя предметами относится к полю, стоящему в перечне первым', () => {
    const reason = 'Срок этапа переносится с причиной: её получит клиент';
    assert.equal(faultField(reason, DUE), 'due-reason');
  });

  it('отказ о состоянии поля не помечает: ложный признак ошибки хуже его отсутствия', () => {
    assert.equal(faultField('Этап уже согласован клиентом', { 'handback-reason': 'reason' }), undefined);
    assert.equal(faultField('Это уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите', DUE), undefined);
    assert.equal(faultField('Запись не найдена или недоступна для вашей роли', RECEIPT), undefined);
    // «Кандидат» и «мандат» слова «дата» не содержат.
    assert.equal(faultField('Кандидат уже назначен', RECEIPT), undefined);
  });

  it('поле едет в одноразовом сообщении и принимается только как идентификатор', () => {
    const id = '0123456789ab';
    assert.deepEqual(unpackFlashEntry(packFlash(id, 'Укажите дату', 'receipt', 'receipt-paidOn'), id), {
      text: 'Укажите дату',
      slot: 'receipt',
      field: 'receipt-paidOn',
    });
    assert.deepEqual(unpackFlashEntry(packFlash(id, 'x', undefined, 'a"] , body'), id), { text: 'x' });
    assert.deepEqual(unpackFlashEntry(packFlash(id, 'x'), id), { text: 'x' });
  });
});

describe('поля отказа стоят на своих экранах', () => {
  /** Идентификатор поля — имя или «область-имя», как у `fieldId` формы. */
  const FIELDS: readonly { file: string; scope?: string; name: string }[] = [
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'for-client', name: 'basis' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'return', name: 'remarks' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'handback', name: 'reason' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'reopen', name: 'reason' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'reopen', name: 'dueOn' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'due', name: 'reason' },
    { file: 'src/app/cabinet/stages/[id]/page.tsx', scope: 'due', name: 'dueOn' },
    { file: 'src/app/cabinet/projects/[code]/status/page.tsx', name: 'reason' },
    { file: 'src/components/cabinet/OrderMoney.tsx', scope: 'receipt', name: 'paidOn' },
    { file: 'src/components/cabinet/OrderMoney.tsx', scope: 'receipt', name: 'amount' },
    { file: 'src/app/cabinet/projects/[code]/messages/page.tsx', name: 'body' },
    { file: 'src/app/cabinet/manage/users/page.tsx', name: 'email' },
    { file: 'src/app/cabinet/manage/users/page.tsx', name: 'fullName' },
    { file: 'src/app/cabinet/manage/orders/new/page.tsx', name: 'email' },
    { file: 'src/app/cabinet/manage/orders/new/page.tsx', name: 'title' },
    { file: 'src/app/cabinet/manage/orders/new/page.tsx', name: 'customer' },
  ];

  it('у каждого идентификатора из действий есть поле с тем же именем и областью', () => {
    const actions = read('src/app/cabinet/actions.ts');
    for (const { file, scope, name } of FIELDS) {
      const id = scope === undefined ? name : `${scope}-${name}`;
      assert.match(actions, new RegExp(`faultField\\([a-z]+, \\{[^}]*(?:'${id}'|\\b${id}): '`, 'u'), `действия называют ${id}`);
      const source = read(file);
      const field = new RegExp(
        scope === undefined
          ? `<Field\\b[^>]*?\\bname="${name}"(?![^>]*?\\bscope=)`
          : `<Field\\b[^>]*?\\bname="${name}"[^>]*?\\bscope="${scope}"`,
        'su',
      );
      assert.match(source, field, `${file}: поле ${id}`);
    }
  });

  it('блок отказа несёт идентификатор, поле получает признак и рамку отказа', () => {
    const error = read('src/components/cabinet/ActionError.tsx');
    assert.match(read('src/lib/cabinet/fault-field.ts'), /export const FAULT_ID = 'action-fault'/u);
    // Экран учётных записей выводит отказ сам, без общего блока.
    assert.match(read('src/app/cabinet/manage/users/page.tsx'), /<FieldFault field=\{fault\.field\} by=\{FAULT_ID\}/u);
    assert.match(error, /<FieldFault field=\{entry\.field\} by=\{FAULT_ID\}/u);
    const fault = read('src/components/cabinet/FieldFault.tsx');
    assert.match(fault, /setAttribute\('aria-invalid', 'true'\)/u);
    assert.match(fault, /setAttribute\('aria-describedby'/u);
    assert.match(read('src/components/cabinet/tokens.ts'), /:is\(input,textarea,select\)\[aria-invalid="true"\]\{border-color:var\(--pd-err-ink\)/u);
  });
});
