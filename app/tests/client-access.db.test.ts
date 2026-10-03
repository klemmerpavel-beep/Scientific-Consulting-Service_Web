/**
 * «Открыть клиенту вход» с карточки работы (требование М-03, решение Р-285).
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'a'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('открыть клиенту вход', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { openClientAccess } = await import('../src/lib/cabinet/admin.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const users: string[] = [];
  const profiles: string[] = [];
  const projects: string[] = [];

  const staff = (id: string, role: 'MANAGER' | 'HEAD'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const user = async (email: string, role: 'MANAGER' | 'HEAD' | 'CLIENT') => {
    const row = await prisma.user.create({ data: { email, fullName: `${role} ${stamp}`, role } });
    users.push(row.id);
    return row.id;
  };

  const work = async (suffix: string, managerId: string, email: string | null) => {
    const profile = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${suffix}`, normalizedName: `ca ${suffix} ${stamp}`, email },
    });
    profiles.push(profile.id);
    const project = await prisma.project.create({
      data: {
        code: `PD-CA-${tail}-${suffix}`,
        clientId: profile.id,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId,
      },
    });
    projects.push(project.id);
    return { projectId: project.id, profileId: profile.id };
  };

  before(async () => {
    ids.manager = await user(`ca-m1-${stamp}@example.org`, 'MANAGER');
    ids.other = await user(`ca-m2-${stamp}@example.org`, 'MANAGER');
    ids.head = await user(`ca-h-${stamp}@example.org`, 'HEAD');
    const type = await prisma.serviceType.create({ data: { code: `ca-${stamp}`, name: 'Проверка входа' } });
    ids.type = type.id;
  });

  after(async () => {
    const linked = await prisma.clientProfile.findMany({
      where: { id: { in: profiles } },
      select: { userId: true },
    });
    for (const row of linked) if (row.userId !== null) users.push(row.userId);
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { objectId: { in: users } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: profiles } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('куратор открывает вход: запись заводится по почте и привязывается к карточке', async () => {
    const { projectId, profileId } = await work('A', ids.manager!, `client-a-${stamp}@example.org`);
    const issued = await openClientAccess(staff(ids.manager!, 'MANAGER'), projectId, '127.0.0.1');
    assert.match(issued.link, /\/cabinet\/enter\//u);

    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: profileId } });
    assert.ok(profile.userId !== null, 'карточка не привязана к учётной записи');
    const client = await prisma.user.findUniqueOrThrow({ where: { id: profile.userId } });
    assert.equal(client.role, 'CLIENT');

    const journal = await prisma.auditEvent.findMany({ where: { projectId }, select: { action: true } });
    assert.deepEqual(journal.map((row) => row.action).sort(), ['ACCESS_LINK_ISSUED', 'USER_CREATED']);

    const notice = await prisma.notificationOutbox.count({
      where: { projectId, userId: ids.head!, eventKind: 'CLIENT_ACCESS_OPENED' },
    });
    assert.ok(notice >= 1, 'руководитель не узнал о выдаче куратором');

    // Повторная выдача гасит прежнюю ссылку: живой остаётся одна.
    await openClientAccess(staff(ids.manager!, 'MANAGER'), projectId, '127.0.0.1');
    const alive = await prisma.loginToken.count({
      where: { userId: profile.userId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    assert.equal(alive, 1);

    // Предел — три ссылки клиенту в сутки.
    await openClientAccess(staff(ids.manager!, 'MANAGER'), projectId, '127.0.0.1');
    await assert.rejects(
      openClientAccess(staff(ids.manager!, 'MANAGER'), projectId, '127.0.0.1'),
      /уже выдано 3/u,
    );
  });

  it('без почты, с адресом сотрудника и в чужой работе — отказ', async () => {
    const noEmail = await work('B', ids.manager!, null);
    await assert.rejects(
      openClientAccess(staff(ids.manager!, 'MANAGER'), noEmail.projectId),
      /нет адреса почты/u,
    );

    const staffEmail = await work('C', ids.manager!, `ca-m2-${stamp}@example.org`);
    await assert.rejects(
      openClientAccess(staff(ids.manager!, 'MANAGER'), staffEmail.projectId),
      /принадлежит сотруднику/u,
    );

    const foreign = await work('D', ids.other!, `client-d-${stamp}@example.org`);
    await assert.rejects(openClientAccess(staff(ids.manager!, 'MANAGER'), foreign.projectId), AccessDenied);
  });
});
