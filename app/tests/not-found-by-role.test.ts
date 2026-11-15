/**
 * Экран «Такой страницы нет» и экран сбоя оставляют вошедшего в кабинете
 * (решение Р-896; аудит 15.11.2026, находка Н-8).
 *
 * Прежде «не найдено» рисовалось без меню и звало «к моим работам» любую
 * роль — и руководителя, у которого такого пункта нет; на начальный экран
 * менеджера и руководителя выхода не было. У экрана сбоя выход был один.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { homeFor, menuLabel } from '../src/lib/cabinet/nav.ts';

const CABINET = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const read = (name: string): string => readFileSync(path.join(CABINET, name), 'utf8');

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: null,
});

describe('«Такой страницы нет» — по роли (Р-896)', () => {
  const page = read('not-found.tsx');

  it('экран читает сеанс и отдаёт действующее лицо каркасу: меню на месте', () => {
    assert.match(page, /const actor = await currentActor\(\);/u);
    assert.match(page, /<Shell actor=\{actor\}>/u);
    assert.doesNotMatch(page, /<Shell actor=\{null\}>/u);
  });

  it('первая кнопка — перечень работ под названием пункта меню роли', () => {
    assert.match(page, /\{actor === null \? 'К моим работам' : \(menuLabel\(actor, WORKS_HREF\) \?\? 'Работы'\)\}/u);
    assert.equal(menuLabel(actor('CLIENT'), '/cabinet/projects'), 'Мои работы');
    assert.equal(menuLabel(actor('EXPERT'), '/cabinet/projects'), 'Назначенные работы');
    assert.equal(menuLabel(actor('HEAD'), '/cabinet/projects'), 'Работы');
  });

  it('вторая кнопка — начальный экран менеджера и руководителя, иначе вход', () => {
    assert.match(page, /home !== WORKS_HREF\s*\? \{ href: home, label: menuLabel\(actor, home\) \?\? 'На начальный экран' \}\s*: \{ href: '\/cabinet', label: 'Войти заново' \}/u);
    assert.equal(homeFor(actor('MANAGER')), '/cabinet/manage');
    assert.equal(menuLabel(actor('MANAGER'), homeFor(actor('MANAGER'))), 'Сегодня');
    assert.equal(menuLabel(actor('HEAD'), homeFor(actor('HEAD'))), 'Сводка');
    assert.equal(homeFor(actor('CLIENT')), '/cabinet/projects');
  });
});

describe('экран сбоя — два выхода (Р-896)', () => {
  const page = read('error.tsx');

  it('повторить и уйти на начальный экран роли', () => {
    assert.match(page, /<Button type="button" onClick=\{reset\}>/u);
    assert.match(page, /<Button type="button" tone="quiet" onClick=\{\(\) => window\.location\.assign\('\/cabinet'\)\}>\s*На начальный экран\s*<\/Button>/u);
  });
});
