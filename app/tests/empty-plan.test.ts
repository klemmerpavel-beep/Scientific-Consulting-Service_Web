/**
 * Работа без этапов: шкала хода и «План работ» по роли и состоянию работы
 * (решение Р-742; Р-182, Р-206, Р-564).
 *
 * Прежде клиент завершённой работы без этапов читал «План работы ещё
 * составляется» и «менеджер добавит их после согласования плана», а
 * клиент новой работы — ту же мысль трижды, и ответ панели не вёл на «Что
 * подготовить».
 *
 * Запуск: node --test tests/empty-plan.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { emptyPlan, NO_STAGES, PLAN_COMPOSING, PREPARE_WHILE_PLANNING, type PlanViewer } from '../src/lib/cabinet/empty-plan.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

const VIEWERS: readonly PlanViewer[] = ['client', 'practice', 'curator'];
const prepare = { done: 0, total: 4, href: '/cabinet/projects/PD-2026-056/prepare' };
const words = (plan: ReturnType<typeof emptyPlan>) => [plan.title, plan.answer ?? '', plan.roadmap].join(' ');

describe('закрытая работа без этапов (Р-742)', () => {
  it('всем ролям — «Работа завершена» / «Работа отменена» и «Этапов у работы нет»', () => {
    for (const viewer of VIEWERS) {
      for (const [status, title] of [
        ['COMPLETED', 'Работа завершена'],
        ['CANCELLED', 'Работа отменена'],
      ] as const) {
        const plan = emptyPlan({ viewer, status, prepare: null });
        assert.equal(plan.title, title, `${viewer} ${status}`);
        assert.equal(plan.roadmap, NO_STAGES, `${viewer} ${status}`);
        assert.doesNotMatch(words(plan), /составля|добавит/iu, `${viewer} ${status}`);
        assert.equal(plan.actionHref, null);
      }
    }
  });

  it('клиенту и куратору фраза о закрытой работе прежняя, практике — как вернуть работу к правке', () => {
    assert.equal(emptyPlan({ viewer: 'client', status: 'COMPLETED', prepare: null }).answer, null);
    assert.equal(emptyPlan({ viewer: 'curator', status: 'CANCELLED', prepare: null }).answer, null);
    assert.equal(
      emptyPlan({ viewer: 'practice', status: 'COMPLETED', prepare: null }).answer,
      'Работа закрыта: чтобы изменить, возобновите её.',
    );
  });
});

describe('новая работа без этапов глазами клиента (Р-742)', () => {
  it('«план составляется» — один раз; ответ ведёт на «Что подготовить»', () => {
    const plan = emptyPlan({ viewer: 'client', status: 'ACTIVE', prepare });
    assert.equal(plan.title, PLAN_COMPOSING);
    assert.equal(plan.answer, PREPARE_WHILE_PLANNING);
    assert.equal(plan.answer, 'Пока менеджер составляет план, приложите материалы для старта.');
    assert.equal(plan.actionHref, prepare.href);
    assert.equal(plan.actionLabel, 'Что подготовить · 0 из 4');
    assert.equal((words(plan).match(/составляется/giu) ?? []).length, 1);
    assert.doesNotMatch(plan.roadmap, /составля|добавит|план/iu);
  });

  it('без перечня «Что подготовить» — «Сейчас от вас ничего не требуется», без кнопки', () => {
    const plan = emptyPlan({ viewer: 'client', status: 'ACTIVE', prepare: null });
    assert.equal(plan.title, PLAN_COMPOSING);
    assert.equal(plan.answer, 'Сейчас от вас ничего не требуется — работа идёт.');
    assert.equal(plan.actionHref, null);
    assert.equal((words(plan).match(/составля/giu) ?? []).length, 1);
  });

  it('приостановленная работа и куратор — как прежде', () => {
    const paused = emptyPlan({ viewer: 'client', status: 'PAUSED', prepare: null });
    assert.equal(paused.title, PLAN_COMPOSING);
    assert.equal(paused.answer, null);
    const curator = emptyPlan({ viewer: 'curator', status: 'ACTIVE', prepare: null });
    assert.equal(curator.title, PLAN_COMPOSING);
    assert.equal(curator.roadmap, 'План работ ещё не заведён.');
  });
});

describe('карточка работы берёт тексты пустого плана из таблицы (Р-742)', () => {
  const page = source('src/app/cabinet/projects/[code]/page.tsx');

  it('шкала: заголовок, ответ и кнопка — из emptyPlan', () => {
    assert.match(page, /const plan =\s*stages\.length === 0\s*\? emptyPlan\(\{/u);
    assert.match(page, /emptyTitle=\{plan\?\.title\}/u);
    assert.match(page, /action=\{action \?\? plan\?\.answer \?\? null\}/u);
    assert.match(page, /actionHref=\{first === null \? \(plan\?\.actionHref \?\? null\) : `\/cabinet\/stages\/\$\{first\.id\}`\}/u);
  });

  it('«План работ»: пустой план — из той же таблицы', () => {
    assert.match(page, /<Roadmap items=\{roadmap\} staff=\{staff\} empty=\{plan\?\.roadmap\} \/>/u);
  });

  it('панель и план выводят переданный текст вместо прежнего', () => {
    const ui = source('src/components/cabinet/ui.tsx');
    assert.match(ui, /\? \(emptyTitle \?\? 'План работы ещё составляется'\)/u);
    assert.match(ui, /\{empty \?\?\s*\(staff/u);
  });
});
