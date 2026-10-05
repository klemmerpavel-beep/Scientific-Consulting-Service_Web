/**
 * Подписи перечня «Что и когда отправлено» (часть F, П-04, решение Р-402).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { notifyMoment, notifyStatus, type NotifyLogRow } from '../src/lib/cabinet/notify-log.ts';

const at = new Date('2026-10-05T06:00:00Z');
const row = (patch: Partial<NotifyLogRow>): NotifyLogRow => ({
  id: 'n',
  channel: 'EMAIL',
  subject: 'Этап ждёт согласования',
  state: 'SENT',
  failure: null,
  createdAt: at,
  scheduledAt: at,
  sentAt: new Date('2026-10-05T06:01:00Z'),
  ...patch,
});

describe('перечень уведомлений (П-04)', () => {
  it('исход словами, без кодов очереди', () => {
    assert.equal(notifyStatus(row({})), 'отправлено');
    assert.equal(notifyStatus(row({ state: 'PENDING', sentAt: null })), 'в очереди на отправку');
    assert.equal(
      notifyStatus(row({ state: 'PENDING', sentAt: null, scheduledAt: new Date('2026-10-06T06:00:00Z') })),
      'отправка назначена',
    );
    assert.equal(notifyStatus(row({ state: 'MERGED', sentAt: null })), 'вошло в утреннюю сводку');
    assert.equal(notifyStatus(row({ state: 'EXPIRED', sentAt: null })), 'не отправлено: событие устарело');
    assert.equal(notifyStatus(row({ state: 'FAILED', failure: 'RECIPIENT_OFF' })), 'не отправлено: канал отключён');
    assert.equal(notifyStatus(row({ state: 'FAILED', failure: 'NO_ADDRESS' })), 'не отправлено: нет адреса');
    assert.equal(notifyStatus(row({ state: 'FAILED', failure: 'DELIVERY' })), 'не доставлено');
  });

  it('время: отправки, назначенной отправки или постановки', () => {
    assert.equal(notifyMoment(row({})).toISOString(), '2026-10-05T06:01:00.000Z');
    const later = new Date('2026-10-06T06:00:00Z');
    assert.equal(notifyMoment(row({ state: 'PENDING', sentAt: null, scheduledAt: later })), later);
    assert.equal(notifyMoment(row({ state: 'FAILED', failure: 'DELIVERY', sentAt: null })), at);
  });
});
