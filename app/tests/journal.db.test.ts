/**
 * Журнал действий на настоящей базе (решение Р-184).
 *
 * Запись в журнал идёт из всех сценариев кабинета, а чтение — предмет
 * руководителя: по журналу устанавливают, кто и когда изменил спорную
 * величину. Ни на запись, ни на чтение проверок не было.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('журнал действий', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { record } = await import('../src/lib/cabinet/audit.ts');
  const { auditEvents, journalActors } = await import('../src/lib/cabinet/journals.ts');

  const stamp = Date.now();
  const ACTION = `TEST_ACTION_${stamp}`;
  const ids: Record<string, string> = {};

  const actorOf = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `jr-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `jr-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    Object.assign(ids, { boss: boss.id, manager: manager.id });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [ids.boss!, ids.manager!] } },
    });
    await prisma.auditEvent.deleteMany({ where: { action: ACTION } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.boss!, ids.manager!] } } });
    await prisma.$disconnect();
  });

  it('запись сохраняет автора, роль и содержимое', async () => {
    await record(actorOf(ids.manager!, 'MANAGER'), {
      action: ACTION,
      objectType: 'Test',
      objectId: 'one',
      payload: { было: '10', стало: '20' },
      ip: '198.51.100.7',
    });
    const rows = await auditEvents(actorOf(ids.boss!, 'HEAD'), { action: ACTION });
    const mine = rows.find((row) => row.objectId === 'one');
    assert.ok(mine !== undefined, 'запись не попала в журнал');
    assert.equal(mine.actorRole, 'MANAGER');
    assert.equal(mine.actor?.fullName, 'Куратор');
    assert.equal(mine.actorIp, '198.51.100.7');
    assert.deepEqual(mine.payload, { было: '10', стало: '20' });
  });

  it('действие без автора записывается: так уходят события расписания', async () => {
    await record(null, { action: ACTION, objectType: 'Test', objectId: 'system' });
    const rows = await auditEvents(actorOf(ids.boss!, 'HEAD'), { action: ACTION });
    const row = rows.find((item) => item.objectId === 'system');
    assert.ok(row !== undefined);
    assert.equal(row.actor, null);
    assert.equal(row.actorRole, null);
  });

  it('отбор по автору оставляет только его записи', async () => {
    await record(actorOf(ids.boss!, 'HEAD'), { action: ACTION, objectType: 'Test', objectId: 'two' });
    const rows = await auditEvents(actorOf(ids.boss!, 'HEAD'), {
      action: ACTION,
      actorId: ids.manager!,
    });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.actor?.id === ids.manager));
  });

  it('отбор по несуществующей работе не отдаёт чужих записей', async () => {
    // Код работы, которого нет, не должен вырождаться в «показать всё».
    const rows = await auditEvents(actorOf(ids.boss!, 'HEAD'), {
      projectTitle: `нет такой работы ${stamp}`,
    });
    assert.deepEqual(rows, []);
  });

  it('верхняя граница периода включает весь указанный день', async () => {
    const today = new Date();
    const rows = await auditEvents(actorOf(ids.boss!, 'HEAD'), {
      action: ACTION,
      from: new Date(today.getTime() - 86_400_000),
      to: today,
    });
    assert.ok(rows.length > 0, 'записи сегодняшнего дня выпали из периода');
  });

  it('перечень авторов journalActors называет тех, кто писал', async () => {
    const people = await journalActors(actorOf(ids.boss!, 'HEAD'));
    assert.ok(people.some((person) => person.id === ids.manager), 'автор записей не назван');
  });

  it('журнал закрыт всем, кроме руководителя', async () => {
    await assert.rejects(() => auditEvents(actorOf(ids.manager!, 'MANAGER')), AccessDenied);
  });
});
