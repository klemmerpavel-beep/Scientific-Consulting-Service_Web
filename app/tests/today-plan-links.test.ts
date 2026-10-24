/**
 * Дела «нет плана», «нет куратора», «срок прошёл» открывают нужную форму
 * сразу, а карточка работы без плана говорит менеджеру о плане один раз и
 * ведёт к форме (решение Р-743; Р-487, Р-304, Р-719).
 *
 * Прежде дело «нет плана этапов» вело на `#manage` без `?manage=1`: экран
 * прокручивался к закрытой свёртке «Управление работой», и форму «Новый
 * этап» приходилось искать. Карточка трижды повторяла «план не заведён»
 * — текстом клиента в заголовке шкалы, ответом и пустым планом — и ни одна
 * строка не вела к форме.
 *
 * Запуск: node --test tests/today-plan-links.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { emptyPlan, PLAN_COMPOSING, PLAN_MISSING_FOR_PRACTICE } from '../src/lib/cabinet/empty-plan.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const planHref = '/cabinet/projects/PD-2026-048?manage=1#manage';
const words = (plan: ReturnType<typeof emptyPlan>) => [plan.title, plan.answer ?? '', plan.roadmap].join(' ');

describe('дела «Сегодня» раскрывают «Управление работой» на своей форме (Р-743)', () => {
  const today = source('src/app/cabinet/manage/page.tsx');

  it('«нет плана этапов» — свёртка раскрыта, первая форма — «Новый этап»', () => {
    assert.match(
      today,
      /mark: row\.noExpert \? 'нет плана этапов и куратора' : 'нет плана этапов',[\s\S]*?href: `\/cabinet\/projects\/\$\{row\.code\}\?manage=1#manage`,/u,
    );
  });

  it('«нет куратора» — сразу форма «Куратор»', () => {
    assert.match(
      today,
      /mark: 'нет куратора',[\s\S]*?href: `\/cabinet\/projects\/\$\{row\.code\}\?manage=1#manage-expert`,/u,
    );
  });

  it('«срок работы прошёл» — форма «Изменить карточку» с полем срока (Р-719)', () => {
    assert.match(today, /href: `\/cabinet\/projects\/\$\{work\.code\}\?manage=1#manage-card`,/u);
  });

  it('ни одно из трёх дел не ведёт на закрытую свёртку', () => {
    for (const mark of ['нет плана этапов', 'нет куратора']) {
      const at = today.indexOf(`mark: '${mark}'`);
      const href = today.slice(at, today.indexOf('})),', at));
      assert.doesNotMatch(href, /\$\{row\.code\}#manage/u, mark);
    }
  });
});

describe('карточка работы без плана глазами практики (Р-743)', () => {
  it('одна фраза о плане — «Плана нет…» ссылкой на форму; ответа нет', () => {
    const plan = emptyPlan({ viewer: 'practice', status: 'ACTIVE', planHref, prepare: null });
    assert.equal(plan.title, 'Плана нет: заведите этапы в «Управлении работой»');
    assert.equal(plan.title, PLAN_MISSING_FOR_PRACTICE);
    assert.equal(plan.titleHref, planHref);
    assert.equal(plan.answer, '');
    assert.equal((words(plan).match(/план/giu) ?? []).length, 1);
  });

  it('клиенту — «План работы ещё составляется», ссылки нет', () => {
    const plan = emptyPlan({ viewer: 'client', status: 'ACTIVE', planHref, prepare: null });
    assert.equal(plan.title, PLAN_COMPOSING);
    assert.equal(plan.titleHref, null);
  });

  it('только у действующей работы и только тому, кто заводит план', () => {
    for (const status of ['PAUSED', 'COMPLETED', 'CANCELLED']) {
      const plan = emptyPlan({ viewer: 'practice', status, planHref, prepare: null });
      assert.notEqual(plan.title, PLAN_MISSING_FOR_PRACTICE, status);
      assert.equal(plan.titleHref, null, status);
    }
    assert.equal(emptyPlan({ viewer: 'practice', status: 'ACTIVE', planHref: null, prepare: null }).title, PLAN_COMPOSING);
    assert.equal(emptyPlan({ viewer: 'curator', status: 'ACTIVE', planHref, prepare: null }).title, PLAN_COMPOSING);
  });

  it('карточка даёт ссылку на форму только при праве завести план', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(
      page,
      /planHref: mayEditStages \? `\/cabinet\/projects\/\$\{encodeURIComponent\(project\.code\)\}\?manage=1#manage` : null,/u,
    );
    assert.match(page, /emptyTitleHref=\{plan\?\.titleHref\}/u);
  });

  it('панель: заголовок — ссылкой, пустой ответ без кнопки — без ряда', () => {
    const ui = source('src/components/cabinet/ui.tsx');
    const start = ui.indexOf('export function ProgressPanel(');
    const body = ui.slice(start, ui.indexOf('\nexport function Disclosure', start));
    assert.match(body, /<a className="cab-mark" href=\{emptyTitleHref\}>\s*\{emptyTitle\}\s*<\/a>/u);
    assert.match(body, /\{answer === '' && actionHref == null \? null : \(/u);
  });
});
