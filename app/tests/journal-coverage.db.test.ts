/**
 * Журнал действий называет то, что предлагает в отборе (решение Р-239).
 *
 * Экран журнала предлагал отбор «Заведён этап», «Изменено состояние
 * этапа», «Этап согласован», «Отправлено сообщение», а таких записей не
 * было: согласование этапа клиентом нигде, кроме истории этапа, следа не
 * оставляло. Проверки держат записи и то, что тексты в журнал не попадают.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'j'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('журнал этапов и переписки', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { addStage, setStageState } = await import('../src/lib/cabinet/projects.ts');
  const { sendMessage } = await import('../src/lib/cabinet/messages.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const actor = (id: string, role: Actor['role'], clientProfileId: string | null = null): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `jr-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const client = await prisma.user.create({
      data: { email: `jr-client-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id, fullName: 'Клиент', normalizedName: `jr-${stamp}` },
    });
    const type = await prisma.serviceType.create({
      data: { code: `jr-${stamp}`, name: 'Проверка журнала' },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-JR-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа',
        managerId: manager.id,
      },
    });
    Object.assign(ids, {
      manager: manager.id,
      client: client.id,
      profile: profile.id,
      type: type.id,
      project: project.id,
    });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.delete({ where: { id: ids.project } });
    await prisma.clientProfile.delete({ where: { id: ids.profile } });
    await prisma.serviceType.delete({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.client!] } } });
    await prisma.$disconnect();
  });

  const entries = (action: string) =>
    prisma.auditEvent.findMany({ where: { projectId: ids.project, action } });

  it('заведение этапа и смена его состояния пишутся без текстов', async () => {
    const curator = actor(ids.manager!, 'MANAGER');
    const stage = await addStage(curator, { projectId: ids.project!, title: 'Глава Иванова' });
    ids.stage = stage.id;
    await setStageState(curator, stage.id, 'IN_PROGRESS');
    await setStageState(curator, stage.id, 'IN_APPROVAL');

    const created = await entries('STAGE_CREATED');
    assert.equal(created.length, 1);
    assert.doesNotMatch(JSON.stringify(created[0]!.payload), /Иванова/u, 'название этапа в журнале');
    const changed = await entries('STAGE_STATE_CHANGED');
    assert.deepEqual(
      changed.map((entry) => entry.payload).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      [
        { from: 'IN_PROGRESS', to: 'IN_APPROVAL' },
        { from: 'NOT_STARTED', to: 'IN_PROGRESS' },
      ],
    );
  });

  it('согласование клиентом — отдельная запись «этап согласован»', async () => {
    await setStageState(actor(ids.client!, 'CLIENT', ids.profile!), ids.stage!, 'DONE');
    const approved = await entries('STAGE_APPROVED');
    assert.equal(approved.length, 1);
    assert.equal(approved[0]!.actorId, ids.client);
  });

  it('сообщение пишется фактом, без текста', async () => {
    const message = await sendMessage(actor(ids.manager!, 'MANAGER'), ids.project!, 'Олег, ждём главу');
    const sent = await entries('MESSAGE_SENT');
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.objectId, message.id);
    assert.doesNotMatch(JSON.stringify(sent[0]!.payload), /Олег/u, 'текст сообщения в журнале');
  });
});
