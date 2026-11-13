/**
 * Перенос работы к другому клиенту на настоящей базе (решение Р-873): кто
 * переносит, подтверждение, прежний клиент сразу теряет доступ, его
 * неотправленные письма по работе гасятся, новый клиент работу видит;
 * работа с материалами, перепиской или действиями клиента не переносится;
 * менеджер не переносит к клиенту другого менеджера.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('перенос работы к другому клиенту', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied, can } = await import('../src/lib/cabinet/access.ts');
  const orders = await import('../src/lib/cabinet/orders.ts');
  const { projectByCode } = await import('../src/lib/cabinet/queries.ts');
  const { projectRef } = await import('../src/lib/cabinet/projects.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const works: string[] = [];
  const users: string[] = [];
  const cards: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-01T00:00:00Z') : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');
  const curator = () => who(ids.expert!, 'EXPERT');
  const oldClient = () => who(ids.oldUser!, 'CLIENT', { clientProfileId: ids.oldCard! });
  const newClient = () => who(ids.newUser!, 'CLIENT', { clientProfileId: ids.newCard! });

  const newWork = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-OC-${tail}-${suffix}`,
        clientId: ids.oldCard!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        expertId: ids.expert!,
        source: 'IMPORT',
        ...extra,
      },
    });
    works.push(project.id);
    return project;
  };

  before(async () => {
    const make = async (suffix: string, role: Actor['role'], fullName: string) => {
      const user = await prisma.user.create({
        data: { email: `oc-${suffix}-${stamp}@example.org`, fullName, role, notifyEmail: true },
      });
      users.push(user.id);
      return user.id;
    };
    ids.head = await make('head', 'HEAD', 'Руководитель Переноса');
    ids.manager = await make('mgr', 'MANAGER', 'Менеджер Переноса');
    ids.stranger = await make('other', 'MANAGER', 'Другой Менеджер Переноса');
    ids.expert = await make('exp', 'EXPERT', 'Куратор Переноса');
    ids.oldUser = await make('old', 'CLIENT', 'Прежний Клиент');
    ids.newUser = await make('new', 'CLIENT', 'Новый Клиент');
    const card = async (key: string, data: Record<string, unknown>) => {
      const row = await prisma.clientProfile.create({ data: data as never });
      cards.push(row.id);
      ids[key] = row.id;
    };
    await card('oldCard', { userId: ids.oldUser, fullName: 'Прежний Клиент', normalizedName: `oc прежний ${stamp}` });
    await card('newCard', { userId: ids.newUser, fullName: 'Новый Клиент', normalizedName: `oc новый ${stamp}`, email: `oc-new-${stamp}@example.org` });
    await card('foreignCard', { fullName: 'Клиент Другого', normalizedName: `oc другого ${stamp}` });
    await card('erasedCard', { fullName: 'Удалено', normalizedName: `oc удалено ${stamp}`, erasedAt: new Date() });
    await card('mergedCard', { fullName: 'Сведённая', normalizedName: `oc сведённая ${stamp}`, mergedIntoId: ids.newCard });
    const type = await prisma.serviceType.create({ data: { code: `oc-${stamp}`, name: 'Проверка переноса' } });
    ids.type = type.id;
    // Работа другого менеджера держит карточку «Клиент Другого» за ним (Р-419).
    const foreignWork = await prisma.project.create({
      data: {
        code: `PD-OC-${tail}-FW`,
        clientId: ids.foreignCard!,
        serviceTypeId: type.id,
        title: 'Чужая работа',
        managerId: ids.stranger!,
      },
    });
    works.push(foreignWork.id);
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: works } }, { userId: { in: users } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: works } }, { actorId: { in: users } }] } });
    await prisma.message.deleteMany({ where: { projectId: { in: works } } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: { in: works } } } });
    await prisma.material.deleteMany({ where: { projectId: { in: works } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: works } } });
    await prisma.project.deleteMany({ where: { id: { in: works } } });
    await prisma.clientProfile.updateMany({ where: { id: { in: cards } }, data: { mergedIntoId: null } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: cards } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('переносят руководитель и менеджер своей работы; клиент, куратор и чужой менеджер — нет', async () => {
    const work = await newWork('R');
    const input = { projectId: work.id, clientId: ids.newCard!, confirm: true };
    for (const actor of [oldClient(), curator(), stranger()]) {
      await assert.rejects(orders.moveOrderToClient(actor, input), AccessDenied, actor.role);
    }
    await assert.rejects(orders.moveOrderToClient(manager(), { ...input, confirm: false }), /Подтвердите перенос/u);
    await orders.moveOrderToClient(manager(), input);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: work.id } })).clientId, ids.newCard);
  });

  it('прежний клиент сразу теряет доступ, новый видит работу; письма прежнему гасятся; история — без имён', async () => {
    const work = await newWork('A');
    const pending = await prisma.notificationOutbox.create({
      data: {
        userId: ids.oldUser!,
        projectId: work.id,
        channel: 'EMAIL',
        eventKind: 'PROJECT_STATUS_CHANGED',
        subject: 'Работа возобновлена',
        body: 'Работа снова идёт.',
        dedupKey: `oc-pending-${stamp}`,
      },
    });
    assert.ok((await projectByCode(oldClient(), work.code)) !== null, 'прежний клиент не видел работу до переноса');
    await orders.moveOrderToClient(head(), { projectId: work.id, clientId: ids.newCard!, confirm: true });
    assert.equal(await projectByCode(oldClient(), work.code), null, 'прежний клиент видит работу после переноса');
    const ref = await projectRef(work.id);
    assert.equal(can(oldClient(), 'PROJECT_VIEW', ref), false);
    assert.equal(can(oldClient(), 'CONTRACT_VIEW', ref), false);
    assert.equal(can(oldClient(), 'MESSAGE_READ', ref), false);
    assert.equal(can(oldClient(), 'MATERIAL_VIEW', ref), false);
    assert.ok((await projectByCode(newClient(), work.code)) !== null, 'новый клиент не видит работу');
    const letter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(letter.state, 'EXPIRED', 'неотправленное письмо прежнему клиенту не погашено');
    assert.equal(letter.lastError, orders.CLIENT_MOVED_NOTE);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: work.id, kind: 'CLIENT_CHANGED' } });
    assert.doesNotMatch(JSON.stringify(event.payload), /Клиент/u, 'имя клиента в истории');
    const entry = await prisma.auditEvent.findFirstOrThrow({ where: { projectId: work.id, action: 'PROJECT_CLIENT_CHANGED' } });
    assert.deepEqual(entry.payload, { from: ids.oldCard, to: ids.newCard });
    assert.equal(
      await prisma.notificationOutbox.count({ where: { projectId: work.id, userId: ids.newUser } }),
      0,
      'новому клиенту ушло письмо о переносе',
    );
  });

  it('работа с перепиской, материалами или действиями клиента не переносится', async () => {
    const talked = await newWork('M', { source: 'WEB' });
    await prisma.message.create({ data: { projectId: talked.id, authorId: ids.manager!, body: 'Здравствуйте!' } });
    assert.deepEqual(await orders.transferBlockers(manager(), talked.id), ['переписка с клиентом — 1']);
    await assert.rejects(
      orders.moveOrderToClient(head(), { projectId: talked.id, clientId: ids.newCard!, confirm: true }),
      /не переносится/u,
    );
    const filed = await newWork('F', { source: 'WEB' });
    await prisma.material.create({ data: { projectId: filed.id, title: 'Глава 1', createdById: ids.manager! } });
    await assert.rejects(
      orders.moveOrderToClient(head(), { projectId: filed.id, clientId: ids.newCard!, confirm: true }),
      /материалы работы — 1/u,
    );
    const approved = await newWork('E', { source: 'WEB' });
    await prisma.projectEvent.create({ data: { projectId: approved.id, actorId: ids.oldUser!, kind: 'STAGE_STATE_CHANGED' } });
    await assert.rejects(
      orders.moveOrderToClient(head(), { projectId: approved.id, clientId: ids.newCard!, confirm: true }),
      /согласования и возвраты клиента/u,
    );
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: approved.id } })).clientId, ids.oldCard);
  });

  it('менеджер не переносит к клиенту другого менеджера; руководитель — может; сведённая и удалённая карточки — нет', async () => {
    const work = await newWork('G');
    const toForeign = { projectId: work.id, clientId: ids.foreignCard!, confirm: true };
    await assert.rejects(orders.moveOrderToClient(manager(), toForeign), /другого менеджера/u);
    assert.equal(
      (await orders.clientCandidates(manager(), work.id, 'другого')).some((row) => row.id === ids.foreignCard),
      false,
      'менеджеру предложена карточка чужого клиента',
    );
    assert.ok((await orders.clientCandidates(head(), work.id, 'другого')).some((row) => row.id === ids.foreignCard));
    for (const clientId of [ids.erasedCard!, ids.mergedCard!]) {
      await assert.rejects(orders.moveOrderToClient(head(), { ...toForeign, clientId }), /не найдена/u);
    }
    await orders.moveOrderToClient(head(), toForeign);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: work.id } })).clientId, ids.foreignCard);
  });

  it('поиск находит карточку по почте и не предлагает текущую', async () => {
    const work = await newWork('S');
    const found = await orders.clientCandidates(manager(), work.id, `oc-new-${stamp}`);
    assert.deepEqual(found.map((row) => row.id), [ids.newCard]);
    assert.deepEqual(await orders.clientCandidates(manager(), work.id, 'Прежний'), []);
  });
});
