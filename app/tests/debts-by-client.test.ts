/**
 * Итог «Должников» по клиенту (улучшение УР-06, решение Р-389): только
 * клиенты с несколькими просроченными платежами, крупные долги сверху.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { debtsByClient } from '../src/lib/cabinet/money.ts';

describe('должники по клиенту (УР-06)', () => {
  it('один платёж — без итога; несколько — число и сумма; крупные сверху', () => {
    const rows = [
      { client: 'Иванов', amount: 10_000n },
      { client: 'Петров', amount: 50_000n },
      { client: 'Иванов', amount: 5_000n },
      { client: 'Сидоров', amount: 30_000n },
      { client: 'Сидоров', amount: 30_000n },
    ];
    assert.deepEqual(debtsByClient(rows), [
      { client: 'Сидоров', count: 2, total: 60_000n },
      { client: 'Иванов', count: 2, total: 15_000n },
    ]);
    assert.deepEqual(debtsByClient([{ client: 'Петров', amount: 1n }]), []);
  });

  it('однофамильцы и обезличенные карточки — разные должники (Р-445)', () => {
    const erased = '[удалено по требованию субъекта]';
    const rows = [
      { client: 'Иванов Иван', clientId: 'a', amount: 10_000n },
      { client: 'Иванов Иван', clientId: 'b', amount: 20_000n },
      { client: erased, clientId: 'c', amount: 1_000n },
      { client: erased, clientId: 'd', amount: 2_000n },
      { client: 'Иванов Иван', clientId: 'a', amount: 5_000n },
    ];
    assert.deepEqual(debtsByClient(rows), [{ client: 'Иванов Иван', count: 2, total: 15_000n }]);
  });
});
