/**
 * Сверка заказчика при ручном заказе (требование М-18, решение Р-308):
 * почта проверяется по формату, о карточках, найденных только по ФИО,
 * менеджер видит маски контактов и число работ (ОМ-5).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { candidateLine, maskEmail, maskPhone, orderEmail } from '../src/lib/cabinet/client-match.ts';

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
