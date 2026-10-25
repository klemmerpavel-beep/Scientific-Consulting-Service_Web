/**
 * Ответ руководителя и внутреннее сообщение по работе видны на «Сегодня»
 * менеджера (решение Р-739, дополняет Р-304; Р-336).
 *
 * Дело «Ответ руководителя» — пока ветка менеджера с руководителем не
 * прочитана; дело по работе — пока не открыта вкладка «Внутренняя». Счёт —
 * тот же, что у экрана «Руководитель» и вкладки (`staffThreadUnread`,
 * `internalUnread`). Своё сообщение дела не даёт; клиенту и куратору
 * выборка пуста; у руководителя таких дел нет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'i'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('ответ руководителя и внутренняя переписка на «Сегодня» (Р-739)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');
  const { attentionCount, attentionParts, attentionSources } = await import('../src/lib/cabinet/attention.ts');

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
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const parts = async (actor: Actor) => attentionParts(await attentionSources(actor));
  const code = `PD-MI-${String(stamp).slice(-6)}`;

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `mi-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, curatorUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Сегодня'),
      make('mgr', 'MANAGER', 'Менеджер Сегодня'),
      make('cur', 'EXPERT', 'Куратор Сегодня'),
      make('cl', 'CLIENT', 'Клиент Сегодня'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Сегодня', normalizedName: `mi клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `mi-${stamp}`, name: 'Проверка дел' } });
    const project = await prisma.project.create({
      data: {
        code,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Научные публикации и патентные материалы',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!, ids.clientUser!];
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

  it('ответ руководителя — дело менеджера; прочтение ветки его гасит', async () => {
    assert.deepEqual((await parts(manager())).headReply, []);
    await messages.sendStaff(manager(), ids.manager!, 'Пересматриваем договор?');
    assert.deepEqual((await parts(manager())).headReply, [], 'своё сообщение дала дело');
    await messages.sendStaff(head(), ids.manager!, 'Без моего согласия цену не меняйте.');
    const sources = await attentionSources(manager());
    assert.deepEqual(attentionParts(sources).headReply, [{ count: 1 }]);
    assert.equal(sources.headReplies, await messages.staffThreadUnread(manager(), ids.manager!), 'счёт не тот, что у ветки');
    await messages.readStaffThread(manager(), ids.manager!);
    assert.deepEqual((await parts(manager())).headReply, []);
  });

  it('внутреннее сообщение руководителя — дело по работе с названием и клиентом; вкладка его гасит', async () => {
    await messages.sendInternal(head(), ids.project!, 'Клиент оставил телефон: напомните про кабинет.');
    await messages.sendInternal(head(), ids.project!, 'И проверьте срок главы 3.');
    const internal = (await parts(manager())).internal.filter((row) => row.code === code);
    assert.deepEqual(internal, [
      { code, title: 'Научные публикации и патентные материалы', client: 'Клиент Сегодня', count: 2 },
    ]);
    assert.equal(internal[0]!.count, await messages.internalUnread(manager(), ids.project!), 'счёт не тот, что у вкладки');
    await messages.readInternal(manager(), ids.project!);
    assert.deepEqual((await parts(manager())).internal.filter((row) => row.code === code), []);
  });

  it('своё сообщение во внутренней ветке дела не даёт', async () => {
    await messages.sendInternal(manager(), ids.project!, 'Напомнил клиенту.');
    assert.deepEqual((await parts(manager())).internal.filter((row) => row.code === code), []);
  });

  it('число дел — с новыми делами', async () => {
    await messages.sendInternal(head(), ids.project!, 'Ещё одно указание.');
    const sources = await attentionSources(manager());
    const all = attentionParts(sources);
    assert.equal(attentionCount(sources), Object.values(all).reduce((acc, part) => acc + part.length, 0));
    assert.equal(all.internal.filter((row) => row.code === code).length, 1);
  });

  it('клиенту и куратору выборка пуста; у руководителя этих дел нет', async () => {
    assert.deepEqual(await messages.internalInbox(client()), []);
    assert.deepEqual(await messages.internalInbox(curator()), []);
    const own = await parts(head());
    assert.deepEqual(own.headReply, []);
    assert.deepEqual(own.internal, []);
  });
});
