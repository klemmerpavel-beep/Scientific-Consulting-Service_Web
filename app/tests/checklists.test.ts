/**
 * Чек-листы практики (решения Р-494, Р-552): кому какие видны, куда ведут
 * ссылки и что кнопки, названные в шагах, на экранах есть — текст
 * чек-листа не расходится с кабинетом.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { AccessDenied, can, type Actor } from '../src/lib/cabinet/access.ts';
import { CHECKLISTS, CHECKLIST_GROUPS, audienceLabel, checklistsFor, stepText } from '../src/lib/cabinet/checklists.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const APP = path.join(SRC, 'app');

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'c-1' : null,
  expertNdaSignedAt: null,
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sources(full);
    return /\.(tsx?|mjs)$/u.test(name) && !full.endsWith(path.join('lib', 'cabinet', 'checklists.ts')) ? [full] : [];
  });
}
const CODE = sources(SRC).map((file) => readFileSync(file, 'utf8')).join('\n');

describe('чек-листы практики (Р-494, Р-552, Р-553)', () => {
  it('руководителю — все, менеджеру и куратору — свои, клиенту экран закрыт', () => {
    assert.equal(checklistsFor(actor('HEAD')).length, CHECKLISTS.length);
    const manager = checklistsFor(actor('MANAGER')).map((list) => list.key);
    assert.deepEqual(manager, [
      'lead',
      'first-call',
      'repeat',
      'start',
      'stage',
      'silent',
      'reschedule',
      'pause',
      'handover',
      'dispute',
      'close',
      'expert-brief',
    ]);
    const curator = checklistsFor(actor('EXPERT')).map((list) => list.key);
    assert.deepEqual(curator, ['expert-accept', 'expert-brief', 'expert-handover', 'expert-remarks']);
    assert.throws(() => checklistsFor(actor('CLIENT')), AccessDenied);
  });

  it('куратор видит чек-листы и до подписания договора поручения', () => {
    // В чек-листах нет ни работ, ни людей; первый шаг «Приёма работы» —
    // как раз о договоре.
    assert.ok(can({ ...actor('EXPERT'), expertNdaSignedAt: null }, 'CHECKLIST_VIEW'));
    assert.ok(!can({ ...actor('EXPERT'), status: 'SUSPENDED' }, 'CHECKLIST_VIEW'));
  });

  it('менеджер и куратор не получают ссылок на закрытые им экраны', () => {
    for (const role of ['MANAGER', 'EXPERT'] as const) {
      for (const list of checklistsFor(actor(role))) {
        for (const link of list.links) assert.ok(can(actor(role), link.action), `${role} ${list.key}: ${link.href}`);
        assert.ok(list.links.length > 0, `${role} ${list.key}: ссылки отсеялись все`);
      }
    }
  });

  it('руководителю видно, кому адресован чек-лист', () => {
    assert.equal(audienceLabel(['HEAD']), 'руководителю');
    assert.equal(audienceLabel(['MANAGER', 'HEAD']), 'менеджеру и руководителю');
    assert.equal(audienceLabel(['EXPERT', 'MANAGER', 'HEAD']), 'куратору, менеджеру и руководителю');
    for (const list of CHECKLISTS) assert.ok(list.roles.includes('HEAD'), `${list.key}: руководитель видит все`);
  });

  it('каждая ссылка ведёт на существующий экран и открыта ролям чек-листа', () => {
    for (const list of CHECKLISTS) {
      assert.ok(CHECKLIST_GROUPS.some((group) => group.key === list.group), list.key);
      assert.ok(list.steps.length >= 3, `${list.key}: меньше трёх шагов`);
      for (const link of list.links) {
        const route = link.href.split(/[?#]/u)[0]!.replace(/^\//u, '');
        assert.ok(existsSync(path.join(APP, route, 'page.tsx')), `${list.key}: нет экрана ${route}`);
        assert.ok(can(actor('HEAD'), link.action), `${list.key}: ${link.href}`);
      }
    }
  });

  it('кнопки, названные в шагах, на экранах есть', () => {
    // Кавычками в шагах названы и кнопки, и экраны; проверяются кнопки и
    // состояния — их подписи меняются чаще экранов.
    const labels = [
      'Одобрить и создать работу',
      'Консультация проведена',
      'Отработана, ждёт ответа',
      'Вернуть куратору',
      'Отметить оплату',
      'Начислить',
      'Отметить выплату',
      'Внести расход',
      'Завершить',
      'Добавить в команду',
      'Передать работы',
      'Приостановить',
      'Зарегистрировать требование',
      'Исполнить',
      // Процессные чек-листы менеджера (Р-553).
      'Отказ',
      'Напоминание о материалах',
      'Напоминание о согласовании',
      'Сохранить срок',
      'Перенос срока',
      'Возобновить',
      'Сохранить менеджера',
      'Новый заказ',
      // Куратору (Р-552).
      'Сообщить руководителю',
      'Загрузить',
      'Сдать этап менеджеру',
      'Замечания приняты в работу',
    ];
    const text = CHECKLISTS.flatMap((list) => list.steps.map(stepText)).join('\n');
    for (const label of labels) {
      assert.ok(text.includes(`«${label}»`), `в шагах нет «${label}»`);
      assert.ok(CODE.includes(label), `на экранах нет «${label}»`);
    }
  });

  it('экран чек-листов — первым блоком «Управления» (Р-559), у менеджера — ссылка и на «Сегодня»', () => {
    const tools = readFileSync(path.join(APP, 'cabinet', 'manage', 'tools', 'page.tsx'), 'utf8');
    // Куратору — перечнем, остальным — свёрнутым блоком (Р-572).
    assert.match(tools, /<MaterialsList[\s\S]{0,80}title="Чек-листы и материалы"/u);
    assert.match(tools, /<FoldCard[\s\S]{0,80}title="Чек-листы и материалы"/u);
    const today = readFileSync(path.join(APP, 'cabinet', 'manage', 'page.tsx'), 'utf8');
    assert.match(today, /<ButtonLink href="\/cabinet\/manage\/checklists">Чек-листы<\/ButtonLink>/u);
  });

  it('куратор открывает чек-листы с «Назначенных работ» и со сдачи этапа (Р-552)', () => {
    const works = readFileSync(path.join(APP, 'cabinet', 'projects', 'page.tsx'), 'utf8');
    assert.match(works, /forExpert && can\(actor, 'CHECKLIST_VIEW'\)[\s\S]{0,80}<ButtonLink href="\/cabinet\/manage\/checklists">Чек-листы<\/ButtonLink>/u);
    const stage = readFileSync(path.join(APP, 'cabinet', 'stages', '[id]', 'page.tsx'), 'utf8');
    assert.match(stage, /<ButtonLink href="\/cabinet\/manage\/checklists\?view=own#expert-handover">Чек-лист сдачи<\/ButtonLink>/u);
    assert.ok(CHECKLISTS.some((list) => list.key === 'expert-handover'));
  });
});
