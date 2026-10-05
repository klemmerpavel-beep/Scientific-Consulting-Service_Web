/**
 * Подписи срока согласования для практики (требование М-13, решение
 * Р-291): автозакрытие включено и выключено, пауза, клиент без входа.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { approvalStaffLine, formatDay, workdaysPhrase } from '../src/lib/cabinet/approval-text.ts';

const due = new Date('2026-09-28T00:00:00Z');

describe('срок согласования глазами практики', () => {
  it('дата — та же, что у клиента', () => {
    assert.equal(formatDay(due), '28 сентября 2026');
  });

  it('автозакрытие включено: срок и дата закрытия', () => {
    assert.equal(
      approvalStaffLine({ dueOn: due, daysLeft: null, clientHasLogin: true, autoAccept: true }),
      'Срок согласования — до 28 сентября 2026 включительно; без ответа клиента этап закроется после 28 сентября 2026 (п. 7.3 оферты)',
    );
  });

  it('автозакрытие выключено: срок без последствия', () => {
    assert.equal(
      approvalStaffLine({ dueOn: due, daysLeft: null, clientHasLogin: true, autoAccept: false }),
      'Срок согласования — до 28 сентября 2026 включительно; автозакрытие не включено',
    );
  });

  it('пауза: остаток рабочих дней', () => {
    assert.match(
      approvalStaffLine({ dueOn: null, daysLeft: 3, clientHasLogin: true, autoAccept: true }) ?? '',
      /остановлен.*осталось 3 рабочих дня/u,
    );
  });

  it('у клиента нет входа: срок не идёт', () => {
    assert.match(
      approvalStaffLine({ dueOn: null, daysLeft: null, clientHasLogin: false, autoAccept: true }) ?? '',
      /не идёт: у клиента нет входа/u,
    );
    assert.equal(approvalStaffLine({ dueOn: null, daysLeft: null, clientHasLogin: true, autoAccept: true }), null);
  });

  it('склонение рабочих дней', () => {
    assert.equal(workdaysPhrase(1), '1 рабочий день');
    assert.equal(workdaysPhrase(4), '4 рабочих дня');
    assert.equal(workdaysPhrase(5), '5 рабочих дней');
    assert.equal(workdaysPhrase(11), '11 рабочих дней');
    assert.equal(workdaysPhrase(21), '21 рабочий день');
  });
});
