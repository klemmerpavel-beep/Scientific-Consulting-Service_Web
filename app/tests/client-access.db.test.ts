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

  it('у клиента есть работа другого менеджера — вход открывает только руководитель (Р-416)', async () => {
    const own = await work('F', ids.manager!, `client-f-${stamp}@example.org`);
    const second = await prisma.project.create({
      data: {
        code: `PD-CA-${tail}-F2`,
        clientId: own.profileId,
        serviceTypeId: ids.type!,
        title: 'Работа F2',
        managerId: ids.other!,
      },
    });
    projects.push(second.id);
    await assert.rejects(
      openClientAccess(staff(ids.manager!, 'MANAGER'), own.projectId),
      /работы другого менеджера/u,
    );
    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: own.profileId } });
    assert.equal(profile.userId, null, 'отказ завёл учётную запись');

    const issued = await openClientAccess(staff(ids.head!, 'HEAD'), own.projectId);
    assert.match(issued.link, /\/cabinet\/enter\//u);
  });

  it('сессия по ссылке сотрудника — не дольше суток; свой вход клиента и уход выдавшего её гасят (Р-424)', async () => {
    const auth = await import('../src/lib/cabinet/auth.ts');
    const { createRawToken, digest } = await import('../src/lib/cabinet/token.ts');
    const { projectId, profileId } = await work('G', ids.manager!, `client-g-${stamp}@example.org`);
    const enter = async () => {
      const issued = await openClientAccess(staff(ids.manager!, 'MANAGER'), projectId);
      const value = decodeURIComponent(issued.link.split('/cabinet/enter/')[1]!);
      return (await auth.consumeLoginToken(value, '127.0.0.1', 'test'))!;
    };

    // Срок — сутки; старше суток сессия не действует и при продлённом сроке.
    const first = await enter();
    const row = await prisma.session.findFirstOrThrow({ where: { tokenHash: digest(first) } });
    assert.ok(row.expiresAt.getTime() <= Date.now() + 24 * 3_600_000 + 5_000, 'срок сессии по ссылке сотрудника дольше суток');
    await prisma.session.update({
      where: { id: row.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    assert.equal(await auth.resolveSession(first), null, 'сессия по ссылке сотрудника пережила сутки');

    // Свой вход клиента гасит сессию по ссылке сотрудника.
    const second = await enter();
    assert.ok(await auth.resolveSession(second));
    const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { id: profileId } });
    const own = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: own.selector,
        verifierHash: digest(own.verifier),
        userId: profile.userId!,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        requestIp: '127.0.0.1',
      },
    });
    const mine = (await auth.consumeLoginToken(own.value, '127.0.0.1', 'test'))!;
    assert.equal(await auth.resolveSession(second), null, 'сессия по ссылке сотрудника пережила вход клиента');
    assert.equal((await auth.resolveSession(mine))?.viaStaffLink, false);

    // Уход выдавшего: его ссылки за сутки гасят сессии по ним; своя — живёт.
    const third = await enter();
    await auth.revokeStaffIssuedSessions(prisma, ids.manager!);
    assert.equal(await auth.resolveSession(third), null, 'сессия по ссылке ушедшего сотрудника жива');
    assert.ok(await auth.resolveSession(mine), 'погашена своя сессия клиента');
  });

  it('сессия по ссылке куратора помечена; согласование в ней — с пометкой (ОМ-3, Р-292)', async () => {
    const { consumeLoginToken, resolveSession } = await import('../src/lib/cabinet/auth.ts');
    const projectsLib = await import('../src/lib/cabinet/projects.ts');
    const { projectId } = await work('E', ids.manager!, `client-e-${stamp}@example.org`);
    const issued = await openClientAccess(staff(ids.manager!, 'MANAGER'), projectId, '127.0.0.1');
    const value = decodeURIComponent(issued.link.split('/cabinet/enter/')[1]!);
    const raw = await consumeLoginToken(value, '127.0.0.1', 'test');
    assert.ok(raw !== null, 'ссылка куратора не открыла сессию');
    const client = await resolveSession(raw!);
    assert.equal(client?.viaStaffLink, true, 'сессия по ссылке куратора не помечена');

    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Глава 1', state: 'IN_APPROVAL' },
    });
    await projectsLib.setStageState(client!, stage.id, 'DONE');
    const change = await prisma.stageStateChange.findFirstOrThrow({ where: { stageId: stage.id } });
    assert.equal(change.via, 'CLIENT_APPROVE');
    assert.equal(change.reason, projectsLib.STAFF_LINK_NOTE);
    const journal = await prisma.auditEvent.findFirstOrThrow({
      where: { objectId: stage.id, action: 'STAGE_APPROVED' },
    });
    assert.equal((journal.payload as { staffLink?: boolean }).staffLink, true);
  });
});
