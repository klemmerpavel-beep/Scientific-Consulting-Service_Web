/**
 * Поля работы ограничены под роль в данных, а не в разметке (решение
 * Р-903; аудит 15.11.2026, находка П-2).
 *
 * Документ обещал, что закрытые поля «не попадают в объект», но
 * `presentProject` вызывался только в тестах: куратор получал в объекте
 * карточки телефон и почту клиента, клиент и куратор — ФИО куратора из
 * книги заказов, клиент — события, скрытые от него на экране.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CLIENT_HIDDEN_EVENTS, narrowProjectFields, type Actor } from '../src/lib/cabinet/access.ts';

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: role === 'CLIENT' ? 'cp-1' : null,
  expertNdaSignedAt: null,
});

const project = () => ({
  id: 'p-1',
  code: 'PD-2026-001',
  expertId: null as string | null,
  expertNameRaw: 'Иванов Пётр Сергеевич' as string | null,
  client: { id: 'cp-1', fullName: 'Заказчик А.', phone: '+7 900 000-00-00' as string | null, email: 'client@example.org' as string | null, university: 'Вуз' },
  events: [
    { id: 'e1', kind: 'STAGE_STATE_CHANGED', payload: {} },
    { id: 'e2', kind: 'EXPERT_ASSIGNED', payload: { expertId: 'u-EXPERT' } },
    { id: 'e3', kind: 'STAGE_HANDED_BACK', payload: { reason: 'переделать' } },
    { id: 'e4', kind: 'CLIENT_CHANGED', payload: {} },
  ],
});

describe('narrowProjectFields (Р-903)', () => {
  it('менеджеру и руководителю работа отдаётся как есть', () => {
    for (const role of ['MANAGER', 'HEAD'] as const) {
      const view = narrowProjectFields(actor(role), project());
      assert.equal(view.expertNameRaw, 'Иванов Пётр Сергеевич');
      assert.equal(view.client.phone, '+7 900 000-00-00');
      assert.equal(view.client.email, 'client@example.org');
      assert.equal(view.events.length, 4);
      assert.equal(view.expertNamed, true);
    }
  });

  it('куратор не получает контактов клиента и ФИО куратора из книги заказов', () => {
    const view = narrowProjectFields(actor('EXPERT'), project());
    assert.equal(view.client.phone, null);
    assert.equal(view.client.email, null);
    assert.equal(view.client.fullName, 'Заказчик А.');
    assert.equal(view.client.university, 'Вуз');
    assert.equal(view.expertNameRaw, null);
    // «Куратор у работы назван» остаётся признаком: по нему пишется, чей ход.
    assert.equal(view.expertNamed, true);
    // Свои события сдачи куратор видит.
    assert.equal(view.events.length, 4);
  });

  it('клиент не получает ФИО куратора из книги, контактов в объекте работы и скрытых событий', () => {
    const view = narrowProjectFields(actor('CLIENT'), project());
    assert.equal(view.expertNameRaw, null);
    assert.equal(view.client.phone, null);
    assert.equal(view.client.email, null);
    assert.deepEqual(view.events.map((event) => event.kind), ['STAGE_STATE_CHANGED']);
    assert.equal(JSON.stringify(view).includes('Иванов'), false);
    assert.equal(JSON.stringify(view).includes('переделать'), false);
  });

  it('признак «куратор назван» пуст, когда имени в книге нет', () => {
    const bare = { ...project(), expertNameRaw: '  ' };
    assert.equal(narrowProjectFields(actor('CLIENT'), bare).expertNamed, false);
    assert.equal(narrowProjectFields(actor('HEAD'), { ...project(), expertNameRaw: null }).expertNamed, false);
  });

  it('строка перечня без клиента и событий проходит без добавленных полей', () => {
    const row = { id: 'p-2', expertNameRaw: 'Петров' as string | null, client: { fullName: 'Заказчик Б.' } };
    const view = narrowProjectFields(actor('EXPERT'), row);
    assert.deepEqual(Object.keys(view).sort(), ['client', 'expertNameRaw', 'expertNamed', 'id']);
    assert.deepEqual(view.client, { fullName: 'Заказчик Б.' });
    assert.equal(view.expertNameRaw, null);
  });

  it('скрытые от клиента события — один перечень для выборки и экрана', () => {
    assert.deepEqual([...CLIENT_HIDDEN_EVENTS].sort(), [
      'CLIENT_CHANGED',
      'EXPERT_ASSIGNED',
      'STAGE_HANDED_BACK',
      'STAGE_HANDED_OVER',
      'STAGE_HANDOVER_RECALLED',
    ]);
    const page = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
      'utf8',
    );
    assert.doesNotMatch(page, /const CLIENT_HIDDEN_EVENTS = /u);
    assert.match(page, /hasExpert=\{project\.expertId !== null \|\| project\.expertNamed\}/u);
  });

  it('выборки карточки и перечня работ пропускают результат через ограничение', () => {
    const queries = readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet', 'queries.ts'), 'utf8');
    assert.match(queries, /return cleared === null \? null : narrowProjectFields\(actor, cleared\);/u);
    assert.match(queries, /withoutStaffNames\(actor, rows\)\.map\(\(row\) => narrowProjectFields\(actor, row\)\)/u);
  });
});
