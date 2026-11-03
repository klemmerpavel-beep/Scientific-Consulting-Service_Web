/**
 * Текст письма об отказе (решение Р-217). Проверяется без базы: здесь
 * решается, что уходит человеку, которому ответили «нет».
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { declineLetter, declineLetterNote, leadAddress, receivedLetter } from '../src/lib/cabinet/lead-letter.ts';
import { PRACTICE_EMAIL, PRACTICE_PHONE } from '../src/lib/practice-contacts.ts';
import { CHANNEL_OFF } from '../src/lib/cabinet/events.ts';
import { EVENT_LABEL } from '../src/lib/cabinet/events.ts';

describe('письмо об отказе', () => {
  it('называет человека, номер заявки, тему и причину словами менеджера', () => {
    const { subject, body } = declineLetter(17, 'Анна', 'Моделирование кубитов', 'Тема вне наших направлений.');
    // Номер — тот же, что в письме «Заявка получена» (П-3, решение Р-763).
    assert.equal(subject, 'Ответ на заявку № 17 — ProDisser');
    assert.ok(body.startsWith('Здравствуйте, Анна.'));
    assert.ok(body.includes('Спасибо за заявку № 17 по теме «Моделирование кубитов».'));
    assert.ok(body.includes('Причина: Тема вне наших направлений.'));
  });

  it('без имени и темы письмо остаётся связным и называет номер', () => {
    const { body } = declineLetter(5, null, '  ', 'Сроки не позволяют.');
    assert.ok(body.startsWith('Здравствуйте.\n'));
    assert.ok(body.includes('Спасибо за заявку № 5. Взяться'));
  });

  it('ссылки входа в письме нет: кабинета у заявителя нет', () => {
    const { body } = declineLetter(1, 'Анна', null, 'Причина.');
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

describe('судьба письма на экране заявки', () => {
  const mail = { contactKind: 'email', contact: 'a@b.ru' };
  const phone = { contactKind: 'phone', contact: '+7 900 000-00-00' };

  it('телефону — звонок, почте без письма — объяснение', () => {
    assert.match(declineLetterNote(phone, null), /звонком/u);
    assert.match(declineLetterNote(mail, null), /не ставилось/u);
  });

  it('Р-642: телефон, исправленный на почту после отказа, не выдаётся за машинную заявку', () => {
    // Отказ при телефоне письма не ставит; правка контакта (Р-374) делает
    // заявку «почтовой», и письма при ней по-прежнему нет.
    const note = declineLetterNote(mail, null);
    assert.doesNotMatch(note, /заявка была помечена как машинная либо отклонена до 24\.09\.2026/u);
    assert.match(note, /при отказе в заявке был телефон, а не почта/u);
  });

  it('ожидание канала отличается от обычной очереди и от отказа', () => {
    const waiting = declineLetterNote(mail, { state: 'PENDING', lastError: CHANNEL_OFF });
    const queued = declineLetterNote(mail, { state: 'PENDING', lastError: null });
    const failed = declineLetterNote(mail, { state: 'FAILED', lastError: '550 ящик не существует' });
    assert.match(waiting, /почтового канала/u);
    assert.match(queued, /в очереди/u);
    assert.match(failed, /не доставлено: 550 ящик не существует/u);
    // Повтор — кнопкой на карточке заявки, а не на закрытом менеджеру
    // экране очереди (требование М-19, решение Р-307).
    assert.match(failed, /Исправьте адрес в сведениях заявки и отправьте ещё раз\.$/u);
    assert.doesNotMatch(failed, /очереди уведомлений/u);
    assert.match(declineLetterNote(mail, { state: 'SENT', lastError: null }), /ушло/u);
  });
});

describe('письмо «Заявка получена» (Т-05, Р-312)', () => {
  it('что дальше, срок ответа, контакты; без имени, темы и ссылок', () => {
    const { subject, body } = receivedLetter(17);
    // Номер заявки — в теме, а значит в первой строке письма (её набирает
    // `renderLetter`), и в тексте (П-3, решение Р-763).
    assert.equal(subject, 'Заявка № 17 получена — ProDisser');
    assert.match(body, /^Здравствуйте\.\nВаша заявка № 17 получена\./u);
    assert.match(body, /ответит в течение рабочего дня/u);
    assert.ok(body.includes(PRACTICE_EMAIL) && body.includes(PRACTICE_PHONE));
    assert.match(body, /Если вы не оставляли заявку, удалите это письмо\./u);
    assert.doesNotMatch(body, /https?:|\/cabinet|войти|вход/iu, 'в письме ссылка или вход');
    assert.ok(body.startsWith('Здравствуйте.\n'), 'обращение по имени из неподтверждённой заявки');
  });

  it('событие названо для журнала и экрана очереди', () => {
    assert.equal(EVENT_LABEL.LEAD_RECEIVED, 'заявка получена');
  });
});
