/**
 * Ветка «куратор — менеджер»: право, экран и ссылки (решение Р-935).
 * Служба на настоящей базе — `curator-thread.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { can, type Actor } from '../src/lib/cabinet/access.ts';
import { CURATOR_WELCOME } from '../src/lib/cabinet/curator-welcome.ts';
import { LATEST_MIGRATION } from '../src/lib/schema-version.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (...parts: string[]) => readFileSync(path.join(APP, ...parts), 'utf8');
const page = read('src', 'app', 'cabinet', 'projects', '[code]', 'messages', 'page.tsx');
const card = read('src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx');

const NDA = new Date('2026-01-10T09:00:00Z');
const actor = (role: Actor['role'], id: string, nda: Date | null = null): Actor => ({
  id,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'card' : null,
  expertNdaSignedAt: nda,
});
const work = { id: 'p', clientId: 'card', managerId: 'm', expertId: 'e' };

describe('право на ветку (Р-935)', () => {
  it('назначенный куратор с договором, менеджер работы и руководитель — да', () => {
    assert.equal(can(actor('EXPERT', 'e', NDA), 'CURATOR_MESSAGE', work), true);
    assert.equal(can(actor('MANAGER', 'm'), 'CURATOR_MESSAGE', work), true);
    assert.equal(can(actor('HEAD', 'h'), 'CURATOR_MESSAGE', work), true);
  });

  it('клиент, чужой куратор, куратор без договора, чужой менеджер и без работы — нет', () => {
    assert.equal(can(actor('CLIENT', 'c'), 'CURATOR_MESSAGE', work), false);
    assert.equal(can(actor('EXPERT', 'x', NDA), 'CURATOR_MESSAGE', work), false);
    assert.equal(can(actor('EXPERT', 'e'), 'CURATOR_MESSAGE', work), false);
    assert.equal(can(actor('MANAGER', 'm2'), 'CURATOR_MESSAGE', work), false);
    assert.equal(can(actor('HEAD', 'h'), 'CURATOR_MESSAGE', null), false);
  });

  it('во внутреннюю ветку и в переписку с клиентом куратор по-прежнему не входит', () => {
    assert.equal(can(actor('EXPERT', 'e', NDA), 'INTERNAL_MESSAGE', work), false);
    assert.equal(can(actor('EXPERT', 'e', NDA), 'MESSAGE_READ', work), false);
  });
});

describe('экран переписки (Р-935)', () => {
  it('куратору экран открыт ради одной ветки; без неё работа — «не найдено»', () => {
    assert.match(page, /const mayCurator = can\(actor, 'CURATOR_MESSAGE', ref\) && project\.expertId !== null;/u);
    assert.match(page, /if \(!mayClientThread && !mayCurator\) notFound\(\);/u);
    assert.match(page, /const curatorTab = mayCurator && \(!mayClientThread \|\| askedTab === 'curator'\);/u);
  });

  it('форма ветки говорит, что клиент её не видит, и держит предел длины', () => {
    const branch = page.slice(page.indexOf('if (curatorTab) {'), page.indexOf('const internalNew ='));
    assert.match(branch, /action=\{postCuratorMessage\}/u);
    assert.match(branch, /Клиент этой переписки не видит\./u);
    assert.match(branch, /maxLength=\{MESSAGE_MAX\}/u);
    assert.match(branch, /forCurator \? 'с менеджером работы; клиент её не видит' : 'с куратором работы; клиент её не видит'/u);
  });

  it('практике — третья вкладка «С куратором» с числом нового', () => {
    assert.match(page, /curatorNew === 0 \? 'С куратором' : `С куратором · \$\{curatorNew\}`/u);
  });
});

describe('куда ведут ссылки (Р-935)', () => {
  it('куратору на карточке — «вопрос менеджеру», практике — новое от куратора', () => {
    assert.match(card, /: 'вопрос менеджеру',/u);
    assert.match(card, /label: `куратор · \$\{curatorNew\} /u);
  });

  it('памятка куратора ведёт в кабинет, а не в почту', () => {
    assert.match(CURATOR_WELCOME.lines[2]!, /в кабинете: «вопрос менеджеру» на карточке работы/u);
  });

  it('миграция ветки — не новее той, что ждёт проверка здоровья', () => {
    // После Р-952 за ней стоит миграция разбора замечаний (данные, без схемы):
    // последняя миграция — та или более поздняя, имена сортируются по времени.
    assert.ok(LATEST_MIGRATION >= '20261115130000_curator_thread', LATEST_MIGRATION);
    assert.match(read('prisma', 'migrations', '20261115130000_curator_thread', 'migration.sql'), /ALTER TYPE "MessageThread" ADD VALUE 'WORK_CURATOR';/u);
  });
});
