/**
 * Ветка переписки «куратор — менеджер» на настоящей базе (решение Р-935).
 *
 * Аудит 15.11.2026, находка Н-6: куратору нечем было задать вопрос
 * менеджеру в кабинете. Ветка отдельная: во внутреннюю (менеджер и
 * руководитель) и в переписку с клиентом куратор по-прежнему не входит.
 *
 * Запуск: DATABASE_URL=… node --test tests/curator-thread.db.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('ветка «куратор — менеджер» (Р-935)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');

  const stamp = Date.now();
  const NDA = new Date('2026-01-10T09:00:00Z');
  const ids: Record<string, string> = {};

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.curator!, 'EXPERT', { expertNdaSignedAt: NDA });
  const stranger = () => who(ids.other!, 'EXPERT', { expertNdaSignedAt: NDA });
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const letters = (userId: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, eventKind: 'CURATOR_MESSAGE' }, orderBy: { createdAt: 'asc' } });

  before(async () => {
    const make = async (key: string, role: Actor['role'], name: string) => {
      const user = await prisma.user.create({ data: { email: `ct-${key}-${stamp}@example.org`, fullName: name, role } });
      ids[key] = user.id;
    };
    await make('manager', 'MANAGER', 'Менеджер Ветки');
    await make('head', 'HEAD', 'Руководитель Ветки');
    await make('curator', 'EXPERT', 'Куратор Ветки');
    await make('other', 'EXPERT', 'Чужой Куратор');
    await make('clientUser', 'CLIENT', 'Клиент Ветки');
    await prisma.expertProfile.createMany({
      data: [
        { userId: ids.curator!, ndaSignedAt: NDA },
        { userId: ids.other!, ndaSignedAt: NDA },
      ],
    });
    const type = await prisma.serviceType.create({ data: { code: `ct-${stamp}`, name: 'Проверка ветки куратора' } });
    const profile = await prisma.clientProfile.create({
      data: { userId: ids.clientUser, fullName: 'Клиент Ветки', normalizedName: `ct клиент ${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-CT-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа с куратором',
        managerId: ids.manager!,
        expertId: ids.curator!,
      },
    });
    const bare = await prisma.project.create({
      data: {
        code: `PD-CN-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа без куратора',
        managerId: ids.manager!,
      },
    });
    Object.assign(ids, { type: type.id, client: profile.id, project: project.id, bare: bare.id });
  });

  after(async () => {
    const users = [ids.manager!, ids.head!, ids.curator!, ids.other!, ids.clientUser!];
    const projects = [ids.project!, ids.bare!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { userId: { in: users } }] } });
    await prisma.messageThreadRead.deleteMany({ where: { userId: { in: users } } });
    await prisma.message.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('куратор пишет — сообщение в своей ветке, письмо менеджеру без текста и без клиента', async () => {
    const sent = await messages.sendCurator(curator(), ids.project!, 'Уточните объём второй главы: телефон клиента не нужен.');
    assert.equal(sent.thread, 'WORK_CURATOR');
    const mail = await letters(ids.manager!);
    assert.equal(mail.length, 1);
    assert.match(mail[0]!.subject, /^Вопрос куратора по работе PD-CT-/u);
    assert.doesNotMatch(mail[0]!.body, /Уточните|Клиент Ветки|Работа с куратором/u);
    assert.equal(mail[0]!.path?.endsWith('/messages?tab=curator'), true);
    // Куратору письма о собственном сообщении нет.
    assert.equal((await letters(ids.curator!)).length, 0);
  });

  it('менеджер видит вопрос и число непрочитанного; чтение его гасит', async () => {
    assert.equal(await messages.curatorUnread(manager(), ids.project!), 1);
    const thread = await messages.listCurator(manager(), ids.project!);
    assert.deepEqual(thread.map((row) => row.body), ['Уточните объём второй главы: телефон клиента не нужен.']);
    await messages.readCurator(manager(), ids.project!);
    assert.equal(await messages.curatorUnread(manager(), ids.project!), 0);
  });

  it('менеджер отвечает — письмо куратору; руководитель тоже читает и пишет', async () => {
    await messages.sendCurator(manager(), ids.project!, 'Объём — сорок страниц.');
    const mail = await letters(ids.curator!);
    assert.equal(mail.length, 1);
    assert.match(mail[0]!.subject, /^Сообщение менеджера по работе PD-CT-/u);
    assert.equal(await messages.curatorUnread(curator(), ids.project!), 1);
    await messages.sendCurator(head(), ids.project!, 'Согласен.');
    assert.equal((await messages.listCurator(head(), ids.project!)).length, 3);
  });

  it('клиенту, чужому куратору и куратору без договора ветка закрыта', async () => {
    for (const actor of [client(), stranger(), who(ids.curator!, 'EXPERT')]) {
      await assert.rejects(() => messages.listCurator(actor, ids.project!), AccessDenied, actor.role);
      await assert.rejects(() => messages.sendCurator(actor, ids.project!, 'Пустите.'), AccessDenied, actor.role);
      await assert.rejects(() => messages.curatorUnread(actor, ids.project!), AccessDenied, actor.role);
    }
  });

  it('ветки не смешиваются: куратору закрыты внутренняя и переписка с клиентом', async () => {
    await messages.sendInternal(manager(), ids.project!, 'Только для руководителя.');
    await assert.rejects(() => messages.listInternal(curator(), ids.project!), AccessDenied);
    await assert.rejects(() => messages.listMessages(curator(), ids.project!), AccessDenied);
    const forClient = await messages.listMessages(client(), ids.project!);
    assert.equal(forClient.some((row) => /Объём|Уточните|Только для руководителя/u.test(row.body)), false);
    const forCurator = await messages.listCurator(curator(), ids.project!);
    assert.equal(forCurator.some((row) => row.body === 'Только для руководителя.'), false);
    const internal = await messages.listInternal(head(), ids.project!);
    assert.deepEqual(internal.map((row) => row.body), ['Только для руководителя.']);
  });

  it('у работы нет куратора — писать некому', async () => {
    await assert.rejects(() => messages.sendCurator(manager(), ids.bare!, 'Есть кто?'), new RegExp(messages.NO_CURATOR, 'u'));
    assert.equal(await prisma.message.count({ where: { projectId: ids.bare, thread: 'WORK_CURATOR' } }), 0);
  });
});
