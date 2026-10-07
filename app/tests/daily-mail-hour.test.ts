/**
 * Плановые письма дня — с 09:00 по Москве (улучшение УК-14, решение
 * Р-393): час считается по Москве, а маршрут расписания ставит письма дня
 * только с этого часа.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DAILY_MAIL_HOUR, moscowHour } from '../src/lib/cabinet/clock.ts';

describe('письма дня — с 09:00 по Москве (УК-14)', () => {
  it('час — московский', () => {
    assert.equal(moscowHour(new Date('2026-10-05T05:59:00Z')), 8);
    assert.equal(moscowHour(new Date('2026-10-05T06:00:00Z')), 9);
    assert.equal(moscowHour(new Date('2026-10-04T21:01:00Z')), 0);
    assert.equal(DAILY_MAIL_HOUR, 9);
  });
  it('маршрут расписания ставит напоминания, автозакрытие и сводку только утром', () => {
    const route = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'api', 'outbox', 'route.ts'),
      'utf8',
    );
    for (const call of ['autoAcceptExpired', 'enqueueApprovalReminders', 'enqueueDeadlineReminders', 'enqueueHeadDigest']) {
      // Каждый шаг — через cronStep: сбой шага не останавливает отправку (Р-438).
      assert.match(route, new RegExp(`morning \\? await cronStep\\('${call}', ${call}, stepsFailed\\)`, 'u'), call);
    }
    // Отправка готового и сроки согласования — в каждом прогоне.
    assert.match(route, /const report = await dispatch\(\);/u);
    assert.match(route, /const deadlinesStarted = await cronStep\('startMissingDeadlines', startMissingDeadlines, stepsFailed\);/u);
  });
});
