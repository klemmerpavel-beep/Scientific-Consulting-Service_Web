/**
 * Ответ в шапке «Моих работ» и «Назначенных работ», когда дел нет
 * (решение Р-651): приостановленная работа — действующая
 * (Р-245, Р-257, Р-342), и над её плашкой не пишется «Действующих работ
 * нет» с приглашением к новой заявке. Числа на настоящей базе — в
 * `works-answer.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { idleAnswer } from '../src/lib/cabinet/works-answer.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'),
  'utf8',
);

describe('ответ без дел — клиенту (Р-651)', () => {
  it('одна приостановленная работа — о приостановке, без новой заявки', () => {
    const answer = idleAnswer({ forClient: true, live: 0, paused: 1 });
    assert.equal(answer.lead, 'Работа приостановлена — сейчас от вас ничего не требуется.');
    assert.notEqual(answer.lead, 'Действующих работ нет.');
    assert.equal(answer.request, false);
  });

  it('несколько приостановленных — во множественном числе', () => {
    const answer = idleAnswer({ forClient: true, live: 0, paused: 2 });
    assert.equal(answer.lead, 'Работы приостановлены — сейчас от вас ничего не требуется.');
    assert.equal(answer.request, false);
  });

  it('ни идущих, ни приостановленных — «Действующих работ нет» и новая заявка', () => {
    const answer = idleAnswer({ forClient: true, live: 0, paused: 0 });
    assert.equal(answer.lead, 'Действующих работ нет.');
    assert.equal(answer.request, true);
  });

  it('идущая работа — «работа идёт» и ближайший срок, приостановленные не мешают', () => {
    const due = 'Ближайший срок — 30 октября 2026, этап «Глава 2».';
    assert.deepEqual(idleAnswer({ forClient: true, live: 1, paused: 1, due }), {
      lead: 'Сейчас от вас ничего не требуется — работа идёт.',
      detail: due,
      request: false,
    });
    assert.equal(idleAnswer({ forClient: true, live: 2, paused: 0 }).lead, 'Сейчас от вас ничего не требуется — работы идут.');
  });
});

describe('ответ без дел — куратору (Р-651)', () => {
  it('все работы приостановлены — о приостановке, а не «назначений нет»', () => {
    const one = idleAnswer({ forClient: false, live: 0, paused: 1 });
    assert.equal(one.lead, 'Сейчас ход не за вами.');
    assert.notEqual(one.detail, 'Действующих назначений нет.');
    assert.equal(one.detail, 'Ваша работа приостановлена: менеджер сообщит, когда продолжать.');
    assert.equal(
      idleAnswer({ forClient: false, live: 0, paused: 3 }).detail,
      'Ваши работы приостановлены: менеджер сообщит, когда продолжать.',
    );
    assert.equal(one.request, false);
  });

  it('ни идущих, ни приостановленных — «Действующих назначений нет»', () => {
    assert.equal(idleAnswer({ forClient: false, live: 0, paused: 0 }).detail, 'Действующих назначений нет.');
  });

  it('идущие работы — прежнее пояснение', () => {
    assert.match(idleAnswer({ forClient: false, live: 1, paused: 0 }).detail ?? '', /^Этапы ваших работ сданы менеджеру/u);
  });
});

describe('экран «Мои работы» берёт ответ из правила (Р-651)', () => {
  it('приостановленные считаются, ответ — `idleAnswer`', () => {
    assert.match(page, /await pausedWorksCount\(actor\)/u);
    assert.match(page, /idleAnswer\(\{ forClient: true, live: live\.length, paused/u);
    assert.match(page, /idleAnswer\(\{ forClient: false, live: live\.length, paused/u);
  });

  it('«Действующих … нет» на экране не пишется мимо правила', () => {
    assert.ok(!page.includes("'Действующих работ нет.'"));
    assert.ok(!page.includes("'Действующих назначений нет.'"));
  });
});
