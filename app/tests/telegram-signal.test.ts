/**
 * В мессенджер уходит сигнал, а не содержание заявки.
 *
 * С решения владельца Р-547 сигнал о заявке с сайта несёт имя и контакт
 * заявителя — чтобы связаться сразу. Организация, тема работы, срок и текст
 * сообщения в Telegram по-прежнему не уходят: им место на почте и в
 * карточке. Уведомление кабинета не несёт ни темы, ни сумм.
 *
 * Проверка идёт без базы и без сети: оба текста собираются чистыми функциями.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const { telegramSignal } = await import('../src/lib/notify.ts');
const { eventLabel, telegramNote } = await import('../src/lib/cabinet/events.ts');

const lead = {
  source: 'business' as const,
  form: 'hero',
  contactKind: 'email' as const,
  contact: 'ivanov@zavod.example',
  name: 'Иванов Иван Иванович',
  organization: 'АО «Квант»',
  topic: 'Оценка готовности квантового сенсора',
  speciality: '05.13.18',
  need: 'Сопровождение НИР',
  deadline: 'декабрь',
  direction: 'business',
  message: 'Нужна помощь с отчётом по этапу',
  consent: true,
  terms: true,
  marketing: false,
};

describe('сигнал о заявке с сайта', () => {
  const text = telegramSignal(lead as never, 'cmu8f230k00054y7d7vdfg843');

  it('несёт имя и контакт заявителя, чтобы связаться сразу (Р-547)', () => {
    assert.ok(text.includes(`<b>Имя:</b> ${lead.name}`), text);
    assert.ok(text.includes(`<b>Почта:</b> ${lead.contact}`), text);
  });

  it('телефон назван телефоном', () => {
    const phone = telegramSignal({ ...lead, contactKind: 'phone', contact: '+7 916 123-45-67' } as never, 'x1');
    assert.ok(phone.includes('<b>Телефон:</b> +7 916 123-45-67'), phone);
    assert.ok(!phone.includes('<b>Почта:</b>'), phone);
  });

  it('без имени — «не указано», а не пустая строка', () => {
    const anonymous = telegramSignal({ ...lead, name: undefined } as never, 'x2');
    assert.ok(anonymous.includes('<b>Имя:</b> не указано'), anonymous);
  });

  it('имя и контакт экранированы: разметку из формы Telegram не исполняет', () => {
    const tricky = telegramSignal({ ...lead, name: '<b>Х</b> & Ко', contact: 'a<b>@x.ru' } as never, 'x3');
    assert.ok(tricky.includes('&lt;b&gt;Х&lt;/b&gt; &amp; Ко'), tricky);
    assert.ok(tricky.includes('a&lt;b&gt;@x.ru'), tricky);
  });

  it('содержание заявки в мессенджер не уходит', () => {
    for (const secret of [lead.organization, lead.topic, lead.speciality, lead.need, lead.message, lead.deadline]) {
      assert.ok(!text.includes(secret), `в сигнал попало: ${secret}`);
    }
  });

  it('отзыв — с подписью автора и без контакта (Р-110)', () => {
    const review = telegramSignal({ ...lead, form: 'review', name: 'аспирант', contact: '' } as never, 'x4');
    assert.ok(review.includes('<b>Новый отзыв</b>'), review);
    assert.ok(review.includes('<b>Автор:</b> аспирант'), review);
    assert.ok(!review.includes('<b>Почта:</b>') && !review.includes('<b>Телефон:</b>'), review);
  });

  it('говорит, откуда заявка и что открывать', () => {
    assert.ok(text.includes('Компаниям') || text.includes('Бизнесу'), text);
    assert.ok(text.includes('hero'), 'не указана форма');
    assert.ok(text.includes('cmu8f230k00054y7d7vdfg843'), 'нет номера заявки');
    assert.ok(
      text.includes('/cabinet/manage/leads/cmu8f230k00054y7d7vdfg843'),
      'нет прямой ссылки на карточку заявки (Р-276)',
    );
  });
});

describe('сигнал об уведомлении кабинета', () => {
  it('несёт род события и код работы, но не тему и не суммы', () => {
    const text = telegramNote('STAGE_AWAITING_CLIENT', 'PD-2026-001');
    // Клиенту — на «вы» (УК-07, Р-363); на экране очереди — прежнее название.
    assert.ok(text.includes('этап ждёт ваших материалов'), text);
    assert.equal(eventLabel('STAGE_AWAITING_CLIENT'), 'этап ждёт клиента');
    assert.ok(text.includes('PD-2026-001'), text);
    assert.ok(text.includes('/cabinet'), 'нет пути в кабинет');
    assert.ok(!text.includes('Глава'), 'название этапа не должно уходить');
  });

  it('обходится без кода работы, когда события к работе не привязано', () => {
    const text = telegramNote('REQUEST_CREATED', null);
    assert.ok(text.includes('новая заявка'), text);
    assert.ok(!text.includes('·  '), 'остался пустой разделитель');
  });

  it('неизвестное событие называется своим кодом, а не «событием»', () => {
    assert.ok(telegramNote('SOMETHING_NEW', null).includes('SOMETHING_NEW'));
  });
});
