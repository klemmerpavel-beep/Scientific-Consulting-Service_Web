/**
 * В мессенджер уходит сигнал, а не содержание.
 *
 * Политика называет использование мессенджеров трансграничной передачей и
 * обязует не прибегать к ней до подтверждения перечня сервисов. Значит, имя,
 * контакт, организация, тема работы и текст сообщения в Telegram уйти не
 * могут — ни из заявки с сайта, ни из уведомления кабинета.
 *
 * Проверка идёт без базы и без сети: оба текста собираются чистыми функциями.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const { telegramSignal } = await import('../src/lib/notify.ts');
const { telegramNote } = await import('../src/lib/cabinet/events.ts');

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

  it('не выносит в мессенджер ничего о заявителе', () => {
    for (const secret of [
      lead.name,
      lead.contact,
      lead.organization,
      lead.topic,
      lead.speciality,
      lead.need,
      lead.message,
      lead.deadline,
    ]) {
      assert.ok(!text.includes(secret), `в сигнал попало: ${secret}`);
    }
  });

  it('говорит, откуда заявка и что открывать', () => {
    assert.ok(text.includes('Компаниям') || text.includes('Бизнесу'), text);
    assert.ok(text.includes('hero'), 'не указана форма');
    assert.ok(text.includes('cmu8f230k00054y7d7vdfg843'), 'нет номера заявки');
    assert.ok(text.includes('/cabinet/manage/leads'), 'нет пути к содержанию');
  });
});

describe('сигнал об уведомлении кабинета', () => {
  it('несёт род события и код работы, но не тему и не суммы', () => {
    const text = telegramNote('STAGE_AWAITING_CLIENT', 'PD-2026-001');
    assert.ok(text.includes('этап ждёт клиента'), text);
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
