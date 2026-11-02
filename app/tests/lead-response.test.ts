/**
 * Скорость ответа на заявку (п. 2.8 задания, решение Р-766): рабочие часы
 * 10:00–19:00 МСК по производственному календарю — одно рабочее время с
 * сайтом и рекламой (П-18, Р-774); медиана «заявка →
 * первый ответ» за 90 дней и вывод по правилу Р-194; цель —
 * `leadFirstResponseHours` (2 ч); публичное обещание и срок реакции
 * прежние; дело «Заявка ждёт ответа N ч» на «Сегодня» — раньше дела Р-304.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { conclusions, type ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';
import {
  RESPONSE_NEXT,
  responseConclusion,
  responseSpeed,
  workTime,
  type ResponseRow,
} from '../src/lib/cabinet/analytics/response.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';
import { WORK_HOURS, workMinutesBetween } from '../src/lib/cabinet/workdays.ts';

const none = new Map<string, boolean>();
/** Порог «уверенно» практики по умолчанию — «20, 10, 5» в «Справочниках» (Р-349). */
const SURE = 20;
const at = (iso: string) => new Date(iso);
const source = (file: string) => readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');

describe('рабочие часы 10:00–19:00 МСК (Р-766, П-18, Р-774)', () => {
  it('окно — 10:00–19:00, как на сайте; рабочий день — девять часов', () => {
    assert.deepEqual(WORK_HOURS, { from: 10, to: 19 });
    // Подсказка «Справочников» и пояснение «Аналитики» называют то же окно.
    assert.match(source('src/app/cabinet/manage/directory/page.tsx'), /Внутренняя цель, 10:00–19:00 МСК/u);
    assert.match(source('src/app/cabinet/manage/analytics/page.tsx'), /Медиана рабочего времени — 10:00–19:00 МСК/u);
  });

  it('внутри рабочего дня — разница в минутах', () => {
    // Понедельник 12.10.2026, 10:00 → 12:00 МСК.
    assert.equal(workMinutesBetween(at('2026-10-12T07:00:00Z'), at('2026-10-12T09:00:00Z'), none), 120);
  });

  it('до 10:00 и после 19:00 время не идёт', () => {
    // 09:00 → 10:00 и 19:00 → 20:00 МСК понедельника.
    assert.equal(workMinutesBetween(at('2026-10-12T06:00:00Z'), at('2026-10-12T07:00:00Z'), none), 0);
    assert.equal(workMinutesBetween(at('2026-10-12T16:00:00Z'), at('2026-10-12T17:00:00Z'), none), 0);
    // 09:30 → 10:30 и 18:30 → 19:30 — по полчаса.
    assert.equal(workMinutesBetween(at('2026-10-12T06:30:00Z'), at('2026-10-12T07:30:00Z'), none), 30);
    assert.equal(workMinutesBetween(at('2026-10-12T15:30:00Z'), at('2026-10-12T16:30:00Z'), none), 30);
  });

  it('вечер и ночь не считаются: 18:00 понедельника → 11:00 вторника — два часа', () => {
    assert.equal(workMinutesBetween(at('2026-10-12T15:00:00Z'), at('2026-10-13T08:00:00Z'), none), 120);
  });

  it('заявка в 20:00 ждёт с 10:00 следующего рабочего дня', () => {
    assert.equal(workMinutesBetween(at('2026-10-12T17:00:00Z'), at('2026-10-13T07:30:00Z'), none), 30);
  });

  it('ночь по Москве на стыке суток UTC: 01:00 МСК понедельника → 10:45 — 45 минут', () => {
    assert.equal(workMinutesBetween(at('2026-10-11T22:00:00Z'), at('2026-10-12T07:45:00Z'), none), 45);
  });

  it('выходные не считаются: 18:30 пятницы → 10:30 понедельника — час', () => {
    assert.equal(workMinutesBetween(at('2026-10-16T15:30:00Z'), at('2026-10-19T07:30:00Z'), none), 60);
  });

  it('праздник 4 ноября не считается', () => {
    // Вторник 03.11 18:00 → четверг 05.11 11:00 МСК.
    assert.equal(workMinutesBetween(at('2026-11-03T15:00:00Z'), at('2026-11-05T08:00:00Z'), none), 120);
  });

  it('рабочая суббота из производственного календаря считается, перенесённый выходной — нет', () => {
    const calendar = new Map<string, boolean>([
      ['2026-10-17', true],
      ['2026-10-19', false],
    ]);
    // Суббота 17.10, 08:00 → 13:00 МСК: рабочие часы с 10:00.
    assert.equal(workMinutesBetween(at('2026-10-17T05:00:00Z'), at('2026-10-17T10:00:00Z'), calendar), 180);
    // Понедельник 19.10 объявлен нерабочим.
    assert.equal(workMinutesBetween(at('2026-10-19T06:00:00Z'), at('2026-10-19T16:00:00Z'), calendar), 0);
  });

  it('полные сутки рабочего дня — девять часов; конец не позже начала — ноль', () => {
    assert.equal(workMinutesBetween(at('2026-10-11T21:00:00Z'), at('2026-10-12T21:00:00Z'), none), 540);
    assert.equal(workMinutesBetween(at('2026-10-12T09:00:00Z'), at('2026-10-12T09:00:00Z'), none), 0);
    assert.equal(workMinutesBetween(at('2026-10-12T10:00:00Z'), at('2026-10-12T09:00:00Z'), none), 0);
  });
});

describe('медиана «заявка → первый ответ» за 90 дней (Р-766)', () => {
  const CONTROL = at('2026-10-20T12:00:00Z');
  const rows: ResponseRow[] = [
    // 60 минут.
    { createdAt: at('2026-10-12T07:00:00Z'), firstResponseAt: at('2026-10-12T08:00:00Z') },
    // 18:00 → 11:00 следующего дня: 120 минут.
    { createdAt: at('2026-10-12T15:00:00Z'), firstResponseAt: at('2026-10-13T08:00:00Z') },
    // 20:00 → 11:00: 60 минут — вечер не в счёт.
    { createdAt: at('2026-10-12T17:00:00Z'), firstResponseAt: at('2026-10-13T08:00:00Z') },
    // 300 минут.
    { createdAt: at('2026-10-14T07:00:00Z'), firstResponseAt: at('2026-10-14T12:00:00Z') },
    // Вне окна 90 дней.
    { createdAt: at('2026-06-01T07:00:00Z'), firstResponseAt: at('2026-06-03T07:00:00Z') },
    { createdAt: at('2026-05-01T07:00:00Z'), waiting: true },
    // Ждёт ответа сейчас.
    { createdAt: at('2026-10-19T07:00:00Z'), waiting: true },
    // Без ответа и не ждёт (разобрана иначе) — не считается.
    { createdAt: at('2026-10-15T07:00:00Z'), firstResponseAt: null },
  ];

  it('медиана в рабочих минутах, доля в цели и ждущие — только по окну', () => {
    const speed = responseSpeed(rows, CONTROL, 2, none, SURE);
    assert.equal(speed.answered, 4);
    assert.equal(speed.medianMinutes, 90);
    assert.equal(speed.withinTarget, 3);
    assert.equal(speed.waiting, 1);
    assert.equal(speed.targetHours, 2);
    assert.equal(speed.from.toISOString().slice(0, 10), '2026-07-23');
    assert.equal(speed.to.toISOString().slice(0, 10), '2026-10-20');
  });

  it('ответов нет — медианы нет, вывода нет', () => {
    const speed = responseSpeed([{ createdAt: at('2026-10-19T07:00:00Z'), waiting: true }], CONTROL, 2, none, SURE);
    assert.equal(speed.medianMinutes, null);
    assert.equal(speed.answered, 0);
    assert.equal(responseConclusion(speed), null);
  });

  it('рабочее время словами', () => {
    assert.equal(workTime(0), '0 мин');
    assert.equal(workTime(45), '45 мин');
    assert.equal(workTime(120), '2 ч');
    assert.equal(workTime(90), '1 ч 30 мин');
    assert.equal(workTime(605), '10 ч 5 мин');
  });

  it('медиана в цели — вывода нет; дольше цели — вывод с действием, сроком и уверенностью (Р-194)', () => {
    assert.equal(responseConclusion(responseSpeed(rows, CONTROL, 2, none, SURE)), null);
    const advice = responseConclusion(responseSpeed(rows, CONTROL, 1, none, SURE));
    assert.ok(advice !== null);
    assert.equal(advice.area, 'Заявки');
    assert.equal(advice.title, 'Сократить время первого ответа на заявку');
    assert.equal(
      advice.text,
      'Медиана первого ответа за 90 дней — 1 ч 30 мин рабочего времени по 4 заявкам при цели 1 ч. ' +
        'Не дольше цели ответили на 2 из 4. Ждут первого ответа сейчас: 1.',
    );
    assert.match(advice.action, /«Заявка ждёт ответа» на «Сегодня»/u);
    assert.equal(advice.term, 'две недели');
    assert.equal(advice.effect, null, 'деньги от быстрого ответа из своих чисел не выводятся');
    assert.equal(advice.confidence, 'likely', 'четыре ответа — меньше порога «уверенно»');
    assert.deepEqual(advice.next, RESPONSE_NEXT);
    for (const text of [advice.title, advice.text, advice.action]) assert.deepEqual(findForbidden(text), [], text);
  });

  it('с порога «уверенно» практики — «подтверждено числами»; число заявок согласовано', () => {
    const answers = (count: number): ResponseRow[] =>
      Array.from({ length: count }, (_, index) => ({
        createdAt: at(`2026-10-${String(1 + (index % 9)).padStart(2, '0')}T06:00:00Z`),
        firstResponseAt: at(`2026-10-${String(1 + (index % 9)).padStart(2, '0')}T11:00:00Z`),
      }));
    const advice = responseConclusion(responseSpeed(answers(21), CONTROL, 2, none, SURE));
    assert.ok(advice !== null);
    assert.equal(advice.confidence, 'sure');
    assert.match(advice.text, /по 21 заявке при цели 2 ч/u);
    assert.doesNotMatch(advice.text, /Ждут первого ответа/u);
    // Порог — общий «уверенно» из «Справочников», а не своё число модуля:
    // 19 ответов при пороге 20 — «вероятно», 20 — «подтверждено числами».
    assert.equal(responseConclusion(responseSpeed(answers(19), CONTROL, 2, none, SURE))?.confidence, 'likely');
    assert.equal(responseConclusion(responseSpeed(answers(20), CONTROL, 2, none, SURE))?.confidence, 'sure');
    // Руководитель поставил «12, 6, 3» — двенадцати ответов достаточно.
    assert.equal(responseConclusion(responseSpeed(answers(12), CONTROL, 2, none, 12))?.confidence, 'sure');
    assert.equal(responseConclusion(responseSpeed(answers(11), CONTROL, 2, none, 12))?.confidence, 'likely');
  });

  it('порог берётся из настроек практики, своей константы у модуля нет', () => {
    assert.doesNotMatch(source('src/lib/cabinet/analytics/response.ts'), /RESPONSE_SURE_FROM|>= 10\b/u);
    const leads = source('src/lib/cabinet/analytics/leads.ts');
    assert.match(leads, /confidenceThresholds\(\)/u);
    assert.match(leads, /responseSpeed\(leads, controlDate, target, calendar, thresholds\.sure\)/u);
  });

  it('вывод встаёт в «Что делать» после сорванных сроков и не вытесняет их', () => {
    const DAY = 86_400_000;
    const project = {
      id: 'r1',
      code: 'PD-R-1',
      title: 'Работа',
      clientId: 'c1',
      clientName: 'Клиент',
      typeCode: 'article',
      typeName: 'Научные публикации',
      status: 'ACTIVE',
      startedOn: new Date(CONTROL.getTime() - 100 * DAY),
      dueOn: new Date(Date.UTC(2026, 8, 1)),
      closedOn: null,
      closedOnPlanned: false,
      firstClosedOn: null,
      signedOn: null,
      cost: 0n,
      paid: 0n,
      writtenOff: 0n,
      payments: [],
    } as ProjectRow;
    const advice = responseConclusion(responseSpeed(rows, CONTROL, 1, none, SURE))!;
    const titles = conclusions([project], CONTROL, undefined, [advice]).map((item) => item.title);
    assert.deepEqual(titles.slice(0, 2), ['Разобрать сорванные сроки', 'Сократить время первого ответа на заявку']);
    assert.ok(!conclusions([project], CONTROL).some((item) => item.area === 'Заявки'), 'без медианы вывода нет');
  });
});

describe('цель, обещание и дело на «Сегодня» (Р-766)', () => {
  it('цель по умолчанию — 2 рабочих часа, не длиннее рабочего дня; срок реакции прежний', () => {
    const settings = source('src/lib/cabinet/practice-settings.ts');
    assert.match(settings, /const LEAD_RESPONSE_KEY = 'leadFirstResponseHours'/u);
    assert.match(settings, /export const LEAD_RESPONSE_DEFAULT = 2;/u);
    assert.match(settings, /export const LEAD_RESPONSE_MAX = 9;/u);
    assert.match(settings, /export const REACTION_DEFAULT = 1;/u);
  });

  it('публичное обещание «в течение рабочего дня» в письме «Заявка получена» прежнее', () => {
    assert.match(source('src/lib/cabinet/lead-letter.ts'), /ответит в течение рабочего дня/u);
  });

  it('дело «Заявка ждёт ответа N ч» стоит перед делом Р-304 и ведёт на заявку', () => {
    const page = source('src/app/cabinet/manage/page.tsx');
    const waiting = page.indexOf('...parts.waitingLeads.map(');
    const late = page.indexOf('...parts.lateLeads.map(');
    assert.ok(waiting > 0 && late > waiting, 'дело «ждёт ответа» — раньше дела Р-304');
    const block = page.slice(waiting, late);
    assert.match(block, /mark: `заявка ждёт ответа \$\{lead\.hours\} ч`/u);
    assert.match(block, /href: `\/cabinet\/manage\/leads\/\$\{lead\.id\}`/u);
    // Время прихода — по Москве (Р-470).
    assert.match(block, /formatDay\(lead\.createdAt\)/u);
    assert.match(block, /formatTime\(lead\.createdAt\)\} МСК/u);
    const parts = source('src/lib/cabinet/attention.ts');
    assert.ok(parts.indexOf('waitingLeads: today.waitingLeads') < parts.indexOf('lateLeads: today.lateLeads'));
  });

  it('первый ответ пишется при смене из «Новой», одобрении и отказе — один раз', () => {
    const work = source('src/lib/cabinet/lead-work.ts');
    assert.match(work, /lead\.status === 'NEW' && lead\.firstResponseAt === null \? \{ firstResponseAt: at \}/u);
    const projects = source('src/lib/cabinet/projects.ts');
    assert.equal(projects.match(/where: \{ id: [a-zA-Z.]+, firstResponseAt: null \}/gu)?.length, 2);
  });
});
