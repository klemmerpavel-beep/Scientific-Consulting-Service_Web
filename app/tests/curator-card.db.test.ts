/**
 * Карточка работы куратора на настоящей базе (решение Р-744): дела
 * берутся по одной работе, замечания возврата клиентом — последние и
 * только по своей работе.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('карточка работы куратора (Р-744)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { curatorTasksData, lastClientReturn } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string): Actor => ({
    id,
    role: 'EXPERT',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: NDA,
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `cc-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, curatorUser, otherUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cur', 'EXPERT'),
      make('oth', 'EXPERT'),
    ]);
    await prisma.expertProfile.createMany({
      data: [
        { userId: curatorUser.id, ndaSignedAt: NDA },
        { userId: otherUser.id, ndaSignedAt: NDA },
      ],
    });
    const profile = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `cc клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cc-${stamp}`, name: 'Проверка карточки' } });
    const work = (suffix: string, title: string) =>
      prisma.project.create({
        data: {
          code: `PD-C${suffix}-${String(stamp).slice(-6)}`,
          clientId: profile.id,
          serviceTypeId: type.id,
          title,
          managerId: managerUser.id,
          expertId: curatorUser.id,
        },
      });
    const [first, second] = await Promise.all([work('A', 'Первая работа'), work('B', 'Вторая работа')]);
    const [returned, other] = await Promise.all([
      prisma.stage.create({
        data: { projectId: first.id, position: 1, title: 'Глава 2', state: 'IN_PROGRESS', returnedAt: new Date(Date.UTC(2026, 9, 20)) },
      }),
      prisma.stage.create({ data: { projectId: second.id, position: 1, title: 'Глава 5', state: 'IN_PROGRESS' } }),
    ]);
    await prisma.stageStateChange.createMany({
      data: [
        {
          stageId: returned.id,
          fromState: 'IN_APPROVAL',
          toState: 'IN_PROGRESS',
          via: 'CLIENT_RETURN',
          reason: 'Прежние замечания',
          createdAt: new Date(Date.UTC(2026, 9, 10)),
        },
        {
          stageId: returned.id,
          fromState: 'IN_APPROVAL',
          toState: 'IN_PROGRESS',
          via: 'CLIENT_RETURN',
          reason: 'Нет ссылок на источники 2024 года',
          createdAt: new Date(Date.UTC(2026, 9, 20)),
        },
        {
          stageId: returned.id,
          fromState: 'IN_PROGRESS',
          toState: 'IN_PROGRESS',
          via: 'MANUAL',
          reason: 'Не возврат клиентом',
          createdAt: new Date(Date.UTC(2026, 9, 21)),
        },
      ],
    });
    Object.assign(ids, {
      manager: managerUser.id,
      curator: curatorUser.id,
      other: otherUser.id,
      client: profile.id,
      type: type.id,
      first: first.id,
      second: second.id,
      firstCode: first.code,
      secondCode: second.code,
      returned: returned.id,
      otherStage: other.id,
    });
  });

  after(async () => {
    const projects = [ids.first!, ids.second!];
    const users = [ids.manager!, ids.curator!, ids.other!];
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: { in: projects } } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('с кодом — дела только этой работы', async () => {
    const all = await curatorTasksData(who(ids.curator!));
    assert.deepEqual(new Set(all.map((task) => task.code)), new Set([ids.firstCode, ids.secondCode]));
    const one = await curatorTasksData(who(ids.curator!), ids.firstCode);
    assert.deepEqual(
      one.map((task) => [task.kind, task.stageId]),
      [['CLIENT_RETURN', ids.returned]],
    );
  });

  it('замечания возврата клиентом — последние, только возвраты клиентом', async () => {
    const change = await lastClientReturn(who(ids.curator!), ids.returned!);
    assert.equal(change?.reason, 'Нет ссылок на источники 2024 года');
    assert.equal(await lastClientReturn(who(ids.curator!), ids.otherStage!), null);
  });

  it('чужому куратору замечания не отдаются', async () => {
    assert.equal(await lastClientReturn(who(ids.other!), ids.returned!), null);
  });
});
