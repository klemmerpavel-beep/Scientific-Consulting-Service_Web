/**
 * Текст письма об отказе (решение Р-217). Проверяется без базы: здесь
 * решается, что уходит человеку, которому ответили «нет».
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { declineLetter, leadAddress } from '../src/lib/cabinet/lead-letter.ts';
import { EVENT_LABEL } from '../src/lib/cabinet/events.ts';

describe('письмо об отказе', () => {
  it('называет человека, тему и причину словами менеджера', () => {
    const { subject, body } = declineLetter('Анна', 'Моделирование кубитов', 'Тема вне наших направлений.');
    assert.equal(subject, 'Ответ на заявку ProDisser');
    assert.ok(body.startsWith('Здравствуйте, Анна.'));
    assert.ok(body.includes('по теме «Моделирование кубитов»'));
    assert.ok(body.includes('Причина: Тема вне наших направлений.'));
  });

  it('без имени и темы письмо остаётся связным', () => {
    const { body } = declineLetter(null, '  ', 'Сроки не позволяют.');
    assert.ok(body.startsWith('Здравствуйте.\n'));
    assert.ok(body.includes('Спасибо за обращение. Взяться'));
  });

  it('ссылки входа в письме нет: кабинета у заявителя нет', () => {
    const { body } = declineLetter('Анна', null, 'Причина.');
    assert.ok(!body.includes('/cabinet'));
  });

  it('у события есть человеческое название для экрана очереди', () => {
    assert.equal(typeof EVENT_LABEL.LEAD_DECLINED, 'string');
  });
});

describe('адрес заявителя', () => {
  it('почта берётся, телефон и обезличенное — нет', () => {
    assert.equal(leadAddress({ contactKind: 'email', contact: ' a@b.ru ' }), 'a@b.ru');
    assert.equal(leadAddress({ contactKind: 'phone', contact: '+7 900 000-00-00' }), null);
    assert.equal(leadAddress({ contactKind: 'email', contact: '[удалено]' }), null);
  });
});
