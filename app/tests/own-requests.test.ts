/**
 * Строка «Заявка № N на рассмотрении» над перечнем работ клиента
 * (решение Р-914) — тексты и место без базы. Отбор на настоящей базе —
 * `own-requests.db.test.ts`.
 *
 * Аудит 15.11.2026, находка Ф-6: после экрана «Заявка принята» заявка не
 * была видна в кабинете нигде.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { OWN_REQUESTS_MAX, OWN_REQUEST_OPEN, ownRequestLine, ownRequestState } from '../src/lib/cabinet/own-requests.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const day = () => '21 сентября 2026';
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const request = (over: Partial<{ topic: string | null; status: string }> = {}) => ({
  number: 17,
  createdAt: new Date('2026-09-21T09:00:00Z'),
  topic: 'Сопровождение диссертации',
  status: 'NEW',
  ...over,
});

describe('строка своей заявки (Р-914)', () => {
  it('номер, день, тема и состояние — одной фразой', () => {
    assert.equal(
      ownRequestLine(request(), day, clip),
      'Заявка № 17 от 21 сентября 2026 — «Сопровождение диссертации»: на рассмотрении у менеджера.',
    );
  });

  it('без темы — без пустых кавычек', () => {
    assert.equal(ownRequestLine(request({ topic: null }), day, clip), 'Заявка № 17 от 21 сентября 2026: на рассмотрении у менеджера.');
    assert.equal(ownRequestLine(request({ topic: '  ' }), day, clip), 'Заявка № 17 от 21 сентября 2026: на рассмотрении у менеджера.');
  });

  it('длинная тема режется до 80 знаков', () => {
    const line = ownRequestLine(request({ topic: 'т'.repeat(200) }), day, clip);
    assert.ok(line.includes(`«${'т'.repeat(79)}…»`));
  });

  it('ход за клиентом назван прямо', () => {
    assert.equal(ownRequestState('AWAITING_REPLY'), 'менеджер ждёт вашего ответа — проверьте почту');
    assert.equal(ownRequestState('IN_PROGRESS'), 'на рассмотрении у менеджера');
  });

  it('в перечень входят только заявки без ответа, не больше пяти', () => {
    assert.deepEqual([...OWN_REQUEST_OPEN], ['NEW', 'IN_PROGRESS', 'AWAITING_REPLY']);
    assert.equal(OWN_REQUESTS_MAX, 5);
  });

  it('клиент видит сотрудника словом «менеджер»; тексты проходят text-guard', () => {
    for (const status of ['NEW', 'AWAITING_REPLY']) {
      const line = ownRequestLine(request({ status }), day, clip);
      assert.doesNotMatch(line, /руководител|куратор|эксперт/iu);
      assert.deepEqual(findForbidden(line), [], line);
    }
  });

  it('блок стоит на перечне работ клиента, под ответом экрана', () => {
    const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');
    assert.match(page, /const ownRequests = forClient \? await ownOpenRequests\(actor\) : \[\];/u);
    assert.match(page, /ownRequests\.length === 1 \? 'Заявка на рассмотрении' : 'Заявки на рассмотрении'/u);
    assert.ok(page.indexOf('<ScreenHead') < page.indexOf('ownRequests.map('));
  });
});
