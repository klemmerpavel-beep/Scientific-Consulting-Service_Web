/**
 * Внутренняя переписка и ветка «руководитель — сотрудник» (требование
 * РК-07, решение Р-336) — шаги H.6, H.7: клиент не получает внутреннее ни
 * на экране, ни в данных, ни в очереди, ни в счётчиках; куратор в ветки не
 * допускается (С-2); вопрос менеджера даёт руководителю сигнал и дело,
 * ответ — сигнал менеджеру; повторный сигнал не ставится, пока прежнее не
 * прочитано; чужую ветку менеджер не читает.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'i'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('внутренняя переписка (РК-07)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const other = () => who(ids.other!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const outbox = (userId: string, eventKind?: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, ...(eventKind === undefined ? {} : { eventKind }) } });
  const SECRET = `внутреннее-${stamp}`;

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `ht-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, otherUser, curatorUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Переписки'),
      make('mgr', 'MANAGER', 'Менеджер Переписки'),
      make('oth', 'MANAGER', 'Другой Менеджер'),
      make('cur', 'EXPERT', 'Куратор Переписки'),
      make('cl', 'CLIENT', 'Клиент Переписки'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Переписки', normalizedName: `ht клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `ht-${stamp}`, name: 'Проверка переписки' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-HT-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки переписки',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      other: otherUser.id,
      curator: curatorUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.other!, ids.curator!, ids.clientUser!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.messageThreadRead.deleteMany({ where: { userId: { in: users } } });
    await prisma.message.deleteMany({ where: { OR: [{ projectId: ids.project }, { staffId: { in: users } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.7: руководитель пишет во внутреннюю ветку — менеджер получает сигнал', async () => {
    await messages.sendInternal(head(), ids.project!, `Проверьте договор: ${SECRET}`);
    const rows = await outbox(ids.manager!, 'INTERNAL_MESSAGE');
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((row) => !row.body.includes(SECRET)), 'текст сообщения в уведомлении');
    assert.equal((await messages.listInternal(manager(), ids.project!)).length, 1);
    assert.equal(await messages.internalUnread(manager(), ids.project!), 1);
    await messages.readInternal(manager(), ids.project!);
    assert.equal(await messages.internalUnread(manager(), ids.project!), 0);
  });

  it('H.7: клиенту внутреннее не отдаётся ни в выборке, ни в счётчике, ни в очереди', async () => {
    const seen = await messages.listMessages(client(), ids.project!);
    assert.ok(!JSON.stringify(seen).includes(SECRET), 'внутреннее сообщение в данных клиента');
    assert.equal(await messages.unreadCount(client(), ids.project!), 0);
    const rows = await outbox(ids.clientUser!);
    assert.ok(rows.every((row) => !row.body.includes(SECRET) && row.eventKind !== 'INTERNAL_MESSAGE'));
    await assert.rejects(messages.listInternal(client(), ids.project!), /не разрешено/u);
  });

  it('барьер «клиент — куратор» не затронут: куратор во внутреннюю ветку не допускается', async () => {
    await assert.rejects(messages.listInternal(curator(), ids.project!), /не разрешено/u);
    await assert.rejects(messages.sendInternal(curator(), ids.project!, 'Привет'), /не разрешено/u);
    await assert.rejects(messages.listStaffThread(curator(), ids.curator!), /не разрешено/u);
  });

  it('менеджер чужой работы во внутреннюю ветку не допускается', async () => {
    await assert.rejects(messages.listInternal(other(), ids.project!), /не разрешено/u);
  });

  it('H.6: вопрос менеджера — сигнал и дело руководителю; повтор без сигнала, пока не прочитано', async () => {
    await messages.sendStaff(manager(), ids.manager!, 'Клиент просит перенести защиту');
    await messages.sendStaff(manager(), ids.manager!, 'И сменить тему');
    const signals = await outbox(ids.head!, 'STAFF_QUESTION');
    assert.equal(signals.filter((row) => row.channel === 'EMAIL').length, 1, 'второй сигнал при непрочитанном');
    assert.equal(signals[0]!.path, `/cabinet/manage/team/${ids.manager}`);
    assert.ok(!signals[0]!.body.includes('защиту'));
    const [thread] = (await messages.staffThreads(head())).filter((row) => row.staffId === ids.manager);
    assert.equal(thread?.unread, 2);
  });

  it('H.6: ответ руководителя — сигнал менеджеру; прочтение гасит дело', async () => {
    await messages.readStaffThread(head(), ids.manager!);
    const [thread] = (await messages.staffThreads(head())).filter((row) => row.staffId === ids.manager);
    assert.equal(thread?.unread, 0);
    await messages.sendStaff(head(), ids.manager!, 'Переносите, договор не меняем');
    const replies = await outbox(ids.manager!, 'HEAD_REPLY');
    assert.equal(replies.filter((row) => row.channel === 'EMAIL').length, 1);
    assert.equal(replies[0]!.path, '/cabinet/head');
    assert.equal(await messages.staffThreadUnread(manager(), ids.manager!), 1);
  });

  it('чужую ветку менеджер не читает и не пишет в неё; предел длины', async () => {
    await assert.rejects(messages.listStaffThread(other(), ids.manager!), /не разрешено/u);
    await assert.rejects(messages.sendStaff(other(), ids.manager!, 'Вопрос'), /не разрешено/u);
    await assert.rejects(messages.sendStaff(manager(), ids.manager!, 'я'.repeat(10_001)), /длиннее 10000/u);
    await assert.rejects(messages.sendStaff(head(), ids.curator!, 'Куратору'), /Сотрудник не найден/u);
  });
});
