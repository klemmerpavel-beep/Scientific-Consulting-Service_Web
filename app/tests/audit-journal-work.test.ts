/**
 * Журнал действий называет работу события и не печатает машинного
 * (решение Р-758). Прежде столбец «Объект» стоял с идентификатором
 * («учётная запись cmvmg0c…»), подробности заведения записи — «роль
 * MANAGER», а работы у строки не было, хотя событие хранит projectId:
 * по каким из десятков одноимённых работ (Р-245) опубликован комментарий
 * или сохранён договор, без выгрузки CSV было не узнать. Теперь работа —
 * названием и клиентом, ссылкой на карточку (код — только в адресе,
 * Р-189); роль — словом; идентификаторы — только в выгрузке, как и
 * машинный код действия (Р-179). Фильтры и выгрузка не менялись (Р-136).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { detailsLabel, isRecordId } from '../src/lib/cabinet/journal-labels.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const page = read('app', 'cabinet', 'manage', 'audit', 'page.tsx');
const exportRoute = read('app', 'cabinet', 'manage', 'audit', 'export', 'route.ts');
const journals = read('lib', 'cabinet', 'journals.ts');

const ID = 'cmvmg0c3400043z7dtvszgs70';
const ID2 = 'cmvmfnlgv006t3j7dj4lm2yik';

describe('подробности журнала — словами, без идентификаторов (Р-758)', () => {
  it('идентификатор записи узнаётся, обычные значения — нет', () => {
    assert.equal(isRecordId(ID), true);
    for (const value of ['PD-2026-047', 'Книга заказов (образец).xlsx', 'client19@artboard.example', 'MANAGER', 'clean', 12]) {
      assert.equal(isRecordId(value), false, String(value));
    }
  });

  it('роль учётной записи — словом', () => {
    assert.equal(detailsLabel({ role: 'MANAGER' }, 'USER_CREATED'), 'роль менеджер');
    assert.equal(detailsLabel({ role: 'EXPERT', profile: ['degree'] }, 'USER_CREATED'), 'роль куратор · profile degree');
    assert.equal(detailsLabel({ from: 'EXPERT', to: 'HEAD' }, 'USER_ROLE_CHANGED'), 'было куратор · стало руководитель');
  });

  it('идентификаторы в подробностях не печатаются', () => {
    assert.equal(detailsLabel({ from: ID, to: ID2 }, 'EXPERT_ASSIGNED'), '—');
    assert.equal(detailsLabel({ from: ID, to: ID2, reason: 'отпуск' }, 'MANAGER_ASSIGNED'), 'причина отпуск');
    assert.equal(detailsLabel({ stageId: ID, position: 2, reason: 'нет главы' }), 'номер 2 · причина нет главы');
    assert.equal(detailsLabel({ rows: 3, filter: { actorId: ID, projectTitle: true } }), 'строк 3 · projectTitle да');
    assert.equal(detailsLabel({ ids: [ID, ID2] }), '—');
    // У поля со своим правилом остаётся имя: отбор был, по кому — в выгрузке.
    assert.equal(detailsLabel({ rows: 4, manager: ID }, 'PROJECTS_EXPORTED'), 'строк 4 · отбор по менеджеру');
  });

  it('код работы в подробностях не печатается: работа названа в строке (Р-189)', () => {
    assert.equal(detailsLabel({ code: 'PD-2026-047', managerId: ID }, 'LEAD_APPROVED'), '—');
    assert.equal(detailsLabel({ code: 'PD-2026-048' }, 'ORDER_CREATED'), '—');
    assert.doesNotMatch(
      detailsLabel({ assigneeId: ID, dueOn: '2026-09-30', project: 'PD-2026-047' }, 'ASSIGNMENT_CREATED'),
      /PD-|cmv/u,
    );
    // Код позиции справочника — не код работы, он остаётся.
    assert.equal(detailsLabel({ code: 'dissertation', name: 'Диссертация' }, 'SERVICE_TYPE_SAVED'), 'код dissertation · name Диссертация');
  });

  it('прежние подписи не изменились', () => {
    assert.equal(
      detailsLabel({ rows: 6, counts: { SKIP: 0, CREATE: 6, UPDATE: 0 }, fileName: 'Книга.xlsx' }, 'IMPORT_PREVIEWED'),
      'строк 6 · уже перенесено 0 · к заведению 6 · к обновлению 0 · файл Книга.xlsx',
    );
    assert.equal(detailsLabel({ from: 'ACTIVE', to: 'SUSPENDED' }, 'USER_STATUS_CHANGED'), 'было ACTIVE · стало SUSPENDED');
  });
});

describe('экран журнала: работа события и объект без идентификатора (Р-758)', () => {
  it('работы строк добираются по projectId одной выборкой', () => {
    assert.match(page, /const works = await journalWorks\(actor, events\.map\(\(event\) => event\.projectId\)\);/u);
    const body = /export async function journalWorks[\s\S]*?\n\}/u.exec(journals)?.[0] ?? '';
    assert.match(body, /ensure\(actor, 'AUDIT_VIEW'\);/u);
    assert.match(body, /select: \{ id: true, code: true, title: true, client: \{ select: \{ fullName: true \} \} \}/u);
  });

  it('столбец «Работа»: название ссылкой на карточку и клиент', () => {
    assert.match(page, /<th style=\{TABLE_HEAD\} scope="col">Работа<\/th>/u);
    assert.match(page, /<a href=\{`\/cabinet\/projects\/\$\{work\.code\}`\}[^>]*>\s*\{work\.title\}\s*<\/a>/u);
    assert.match(page, />клиент \{work\.client\}<\/div>/u);
    // Код — только в адресе ссылки.
    assert.doesNotMatch(page, />\s*\{work\.code\}/u);
  });

  it('идентификатор объекта на экран не выводится', () => {
    assert.doesNotMatch(page, /event\.objectId/u);
    assert.match(page, /<td style=\{TABLE_CELL\}>\{objectLabel\(event\.objectType\)\}<\/td>/u);
  });

  it('выгрузка CSV — прежняя: коды, роль кодом, идентификаторы и содержимое как есть (Р-136)', () => {
    assert.match(exportRoute, /\['Когда', 'Кто', 'Роль', 'Адрес', 'Действие', 'Тип объекта', 'Объект', 'Проект', 'Подробности'\]/u);
    assert.match(exportRoute, /event\.actorRole \?\? '',/u);
    assert.match(exportRoute, /event\.objectId \?\? '',\s*event\.projectId \?\? '',/u);
    assert.match(exportRoute, /JSON\.stringify\(event\.payload\)/u);
    assert.doesNotMatch(exportRoute, /journalWorks|detailsLabel|roleLabel/u);
  });

  it('фильтры экрана — прежние (Р-136)', () => {
    for (const name of ['from', 'to', 'actorId', 'action', 'projectTitle']) {
      assert.match(page, new RegExp(`name="${name}"`, 'u'), name);
    }
  });
});
