/**
 * Смена роли гасит письма прежней роли (решение Р-667): письмо
 * руководителю, накопленное до понижения, менеджеру не уходит; письма
 * куратора — и вошедшие в неотправленную сводку — гаснут при уходе из
 * куратора; повышение менеджера до руководителя писем не трогает;
 * приглашение куратору, погашенное сменой роли, при возврате в куратора
 * снова ждёт отправки.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('смена роли и письма прежней роли (Р-667)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const outbox = await import('../src/lib/cabinet/outbox.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');

  const ids: Record<string, string> = {};
  const head = (): Actor => ({ id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const row = (id: string) => prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
  const letter = async (userId: string, eventKind: 'TRANCHE_OVERDUE' | 'CURATOR_TURN' | 'MODERATION_PENDING', subject: string) => {
    await outbox.enqueue(prisma, { userId, eventKind, subject, body: '—', dedupKey: `rcl:${subject}:${stamp}` });
    return prisma.notificationOutbox.findFirstOrThrow({ where: { userId, eventKind, channel: 'EMAIL' } });
  };

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string, extra = {}) =>
      prisma.user.create({ data: { email: `rcl-${suffix}-${stamp}@example.org`, fullName, role, ...extra } });
    const [headUser, second, manager, curator] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Ролей'),
      make('head2', 'HEAD', 'Второй руководитель'),
      make('mgr', 'MANAGER', 'Менеджер Ролей'),
      make('cur', 'EXPERT', 'Куратор Ролей', { dailyDigest: true }),
    ]);
    await prisma.expertProfile.create({ data: { userId: curator.id, ndaSignedAt: new Date(Date.UTC(2026, 0, 10)) } });
    Object.assign(ids, { head: headUser.id, second: second.id, manager: manager.id, curator: curator.id });
  });

  after(async () => {
    const users = [ids.head!, ids.second!, ids.manager!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: users } }, { objectId: { in: users } }] } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('письмо руководителю, не ушедшее до понижения, менеджеру не уходит', async () => {
    const overdue = await letter(ids.second!, 'TRANCHE_OVERDUE', 'Транш просрочен: PD-RCL');
    assert.equal(overdue.state, 'PENDING');
    await admin.setUserRole(head(), ids.second!, 'MANAGER');
    const done = await row(overdue.id);
    assert.equal(done.state, 'EXPIRED', 'письмо руководителю ушло бы менеджеру');
    assert.equal(done.lastError, admin.ROLE_CHANGED_NOTE);
  });

  it('повышение менеджера до руководителя письма не гасит', async () => {
    const moderation = await letter(ids.manager!, 'MODERATION_PENDING', 'Замечание ждёт модерации');
    await admin.setUserRole(head(), ids.manager!, 'HEAD');
    assert.equal((await row(moderation.id)).state, 'PENDING');
  });

  it('уход из куратора гасит его письма и неотправленную сводку', async () => {
    await letter(ids.curator!, 'CURATOR_TURN', 'Ход за вами: этап «Обзор литературы»');
    assert.equal(await outbox.enqueueCuratorDigest(outbox.nextDigestAt(new Date())) > 0, true);
    const digest = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId: ids.curator, eventKind: 'CURATOR_DIGEST' } });
    assert.equal(digest.state, 'PENDING');

    await admin.setUserRole(head(), ids.curator!, 'MANAGER');
    const gone = await row(digest.id);
    assert.equal(gone.state, 'EXPIRED', 'сводка куратора ушла бы менеджеру');
    assert.equal(gone.lastError, admin.ROLE_CHANGED_NOTE);
    const merged = await prisma.notificationOutbox.count({ where: { userId: ids.curator, state: 'MERGED' } });
    assert.equal(merged, 0, 'письмо осталось в сводке');
  });

  it('возврат в куратора — приглашение снова ждёт отправки', async () => {
    const user = await admin.createUser(head(), { email: `rcl-back-${stamp}@example.org`, fullName: 'Вернувшийся куратор', role: 'EXPERT' });
    ids.back = user.id;
    const invite = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId: user.id, eventKind: 'CURATOR_INVITED', channel: 'EMAIL' } });
    await admin.setUserRole(head(), user.id, 'MANAGER');
    assert.equal((await row(invite.id)).state, 'EXPIRED', 'приглашение куратора ушло бы менеджеру');
    await admin.setUserRole(head(), user.id, 'EXPERT');
    const back = await row(invite.id);
    assert.equal(back.state, 'PENDING', 'вернувшийся куратор остался без приглашения');
    assert.equal(back.lastError, null);
    const invites = await prisma.notificationOutbox.count({ where: { userId: user.id, eventKind: 'CURATOR_INVITED', channel: 'EMAIL' } });
    assert.equal(invites, 1);
    await prisma.notificationOutbox.deleteMany({ where: { userId: user.id } });
    await prisma.auditEvent.deleteMany({ where: { objectId: user.id } });
    await prisma.expertProfile.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
});
