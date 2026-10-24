/**
 * Почта менеджера в выборке этапа на настоящей базе (решение Р-749):
 * куратору с договором поручения — адрес; клиенту — пусто; куратору без
 * договора этап не отдаётся вовсе.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('почта менеджера у этапа (Р-749)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { stageById } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const actor = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `mm-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, clientUser, curatorUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('cur', 'EXPERT'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `mm клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `mm-${stamp}`, name: 'Проверка почты' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-MM-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки почты',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Редактура', state: 'IN_PROGRESS' },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      managerEmail: managerUser.email,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    const users = [ids.manager!, ids.clientUser!, ids.curator!];
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('куратору с договором — адрес менеджера', async () => {
    const stage = await stageById(actor(ids.curator!, 'EXPERT', { expertNdaSignedAt: NDA }), ids.stage!);
    assert.equal(stage?.project.manager.email, ids.managerEmail);
  });

  it('клиенту — пусто', async () => {
    const stage = await stageById(actor(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), ids.stage!);
    assert.ok(stage !== null);
    assert.equal(stage.project.manager.email, '');
  });

  it('куратору без договора этап не отдаётся', async () => {
    assert.equal(await stageById(actor(ids.curator!, 'EXPERT'), ids.stage!), null);
  });
});
