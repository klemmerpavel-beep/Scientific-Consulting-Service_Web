/**
 * Запрос клиента на удаление данных из «Настроек» (часть F, П-08, решение
 * Р-400): требование ложится руководителю с письмом, второе до исполнения
 * не принимается, сотруднику действие закрыто.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'e'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('запрос клиента на удаление данных (П-08)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const erasure = await import('../src/lib/cabinet/erasure.ts');
  const ids: Record<string, string> = {};
  const client = (): Actor => ({
    id: ids.user!,
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfileId: ids.profile!,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const [user, head] = await Promise.all([
      prisma.user.create({ data: { email: `er-cl-${stamp}@example.org`, fullName: 'Клиент Удаления', role: 'CLIENT' } }),
      prisma.user.create({ data: { email: `er-head-${stamp}@example.org`, fullName: 'Руководитель Удаления', role: 'HEAD', notifyEmail: true } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id, fullName: 'Клиент Удаления', normalizedName: `er клиент ${stamp}` },
    });
    Object.assign(ids, { user: user.id, head: head.id, profile: profile.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.user } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.profile } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.user!, ids.head!] } } });
  });

  it('запрос ложится требованием, руководителю — письмо; второй до исполнения не принимается', async () => {
    assert.equal(await erasure.ownErasureRequest(client()), null);
    const at = await erasure.requestOwnErasure(client());
    assert.equal((await erasure.ownErasureRequest(client()))?.getTime(), at.getTime());
    const request = await prisma.erasureRequest.findFirstOrThrow({ where: { clientId: ids.profile } });
    assert.equal(request.executedAt, null);
    const audit = await prisma.auditEvent.findFirst({
      where: { actorId: ids.user, action: 'ERASURE_REQUESTED', objectId: request.id },
    });
    assert.equal((audit?.payload as { byClient?: boolean } | null)?.byClient, true);
    const letter = await prisma.notificationOutbox.findFirst({
      where: { userId: ids.head, eventKind: 'CLIENT_ERASURE_REQUEST', channel: 'EMAIL' },
    });
    assert.ok(letter !== null, 'руководителю не ушло письмо');
    assert.equal(letter.path, '/cabinet/manage/erasure');
    await assert.rejects(erasure.requestOwnErasure(client()), /уже отправлен/u);
  });

  it('двойная отправка — одно требование и одно письмо; второе требование руководителя — отказ (Р-468)', async () => {
    const head: Actor = { id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
    await assert.rejects(erasure.requestErasure(head, ids.profile!), /неисполненное требование/u);
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.profile } });
    const results = await Promise.allSettled([erasure.requestOwnErasure(client()), erasure.requestOwnErasure(client())]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.erasureRequest.count({ where: { clientId: ids.profile } }), 1);
    assert.equal(
      await prisma.notificationOutbox.count({ where: { userId: ids.head, eventKind: 'CLIENT_ERASURE_REQUEST', channel: 'EMAIL' } }),
      1,
    );
  });

  it('требование из входа по ссылке сотрудника помечено в журнале, письме и перечне (аудит 09.10.2026)', async () => {
    const head: Actor = { id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.profile } });

    await erasure.requestOwnErasure({ ...client(), viaStaffLink: true });
    const request = await prisma.erasureRequest.findFirstOrThrow({ where: { clientId: ids.profile } });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { actorId: ids.user, action: 'ERASURE_REQUESTED', objectId: request.id },
    });
    assert.equal((audit.payload as { staffLink?: boolean }).staffLink, true);
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { userId: ids.head, eventKind: 'CLIENT_ERASURE_REQUEST', channel: 'EMAIL' },
    });
    assert.match(letter.body, /по ссылке, которую выдал сотрудник/u);
    const listed = (await erasure.listErasureRequests(head)).rows.find((row) => row.id === request.id);
    assert.equal(listed?.viaStaffLink, true, 'перечень не помечает требование');

    // Своя сессия клиента — без пометки.
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.profile } });
    await erasure.requestOwnErasure(client());
    const own = await prisma.erasureRequest.findFirstOrThrow({ where: { clientId: ids.profile } });
    const ownLetter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { userId: ids.head, eventKind: 'CLIENT_ERASURE_REQUEST', channel: 'EMAIL' },
    });
    assert.doesNotMatch(ownLetter.body, /сотрудник/u);
    const ownListed = (await erasure.listErasureRequests(head)).rows.find((row) => row.id === own.id);
    assert.equal(ownListed?.viaStaffLink, false);
  });

  it('сотруднику и заблокированному клиенту действие закрыто', async () => {
    await assert.rejects(erasure.requestOwnErasure({ ...client(), status: 'SUSPENDED' }), /не разрешено/u);
    await assert.rejects(
      erasure.requestOwnErasure({ id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null }),
      /не разрешено/u,
    );
  });
});
