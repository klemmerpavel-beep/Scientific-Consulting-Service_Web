/**
 * Чек-листы практики (решение Р-494): кому какие видны, куда ведут ссылки
 * и что кнопки, названные в шагах, на экранах есть — текст чек-листа не
 * расходится с кабинетом.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { AccessDenied, can, type Actor } from '../src/lib/cabinet/access.ts';
import { CHECKLISTS, CHECKLIST_GROUPS, checklistsFor } from '../src/lib/cabinet/checklists.ts';

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

describe('чек-листы практики (Р-494)', () => {
  it('руководителю — все, менеджеру — свои, клиенту и куратору экран закрыт', () => {
    assert.equal(checklistsFor(actor('HEAD')).length, CHECKLISTS.length);
    const manager = checklistsFor(actor('MANAGER')).map((list) => list.key);
    assert.deepEqual(manager, ['lead', 'start', 'stage', 'close']);
    assert.throws(() => checklistsFor(actor('CLIENT')), AccessDenied);
    assert.throws(() => checklistsFor(actor('EXPERT')), AccessDenied);
  });

  it('менеджер не получает ссылок на экраны руководителя', () => {
    for (const list of checklistsFor(actor('MANAGER'))) {
      for (const link of list.links) assert.ok(can(actor('MANAGER'), link.action), `${list.key}: ${link.href}`);
    }
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
    ];
    const text = CHECKLISTS.flatMap((list) => list.steps).join('\n');
    for (const label of labels) {
      assert.ok(text.includes(`«${label}»`), `в шагах нет «${label}»`);
      assert.ok(CODE.includes(label), `на экранах нет «${label}»`);
    }
  });

  it('экран чек-листов есть в «Управлении», у менеджера — ссылка на «Сегодня»', () => {
    const tools = readFileSync(path.join(APP, 'cabinet', 'manage', 'tools', 'page.tsx'), 'utf8');
    assert.match(tools, /href: '\/cabinet\/manage\/checklists',[\s\S]{0,400}action: 'CHECKLIST_VIEW'/u);
    const today = readFileSync(path.join(APP, 'cabinet', 'manage', 'page.tsx'), 'utf8');
    assert.match(today, /<ButtonLink href="\/cabinet\/manage\/checklists">Чек-листы<\/ButtonLink>/u);
  });
});
