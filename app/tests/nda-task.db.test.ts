/**
 * Учётная запись и профиль куратора, дело «Нужен договор поручения»
 * (требование РК-09, решение Р-335) — шаги H.10 и H.11 приёмочного обхода:
 * новая учётная запись куратора даёт письмо-приглашение; правка профиля
 * сразу видна клиенту; куратор без договора, назначенный на работу, даёт
 * руководителю дело по всем работам; отметка договора дело закрывает, а
 * куратору уходит письмо.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'd'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('дело «Нужен договор поручения» (РК-09)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { expertLine } = await import('../src/lib/cabinet/access.ts');
  const { projectByCode, todayItems } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const letters = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.count({ where: { userId, eventKind, channel: 'EMAIL' } });
  const task = async () => (await todayItems(head())).ndaWaiting.find((row) => row.id === ids.curator);

  before(async () => {
    const [chief, manager, clientUser] = await Promise.all([
      prisma.user.create({ data: { email: `nt-head-${stamp}@example.org`, fullName: 'Руководитель Договоров', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `nt-mgr-${stamp}@example.org`, fullName: 'Менеджер Договоров', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `nt-cl-${stamp}@example.org`, fullName: 'Клиент Договоров', role: 'CLIENT' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Договоров', normalizedName: `nt клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `nt-${stamp}`, name: 'Проверка договора поручения' } });
    // Работа чужого менеджера: дело руководителя — по всем работам.
    const project = await prisma.project.create({
      data: {
        code: `PD-NT-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки договора',
        managerId: manager.id,
      },
    });
    Object.assign(ids, {
      head: chief.id,
      manager: manager.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    const users = [ids.head, ids.manager, ids.clientUser, ids.curator].filter((id): id is string => id !== undefined);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({
      where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }, { objectId: { in: users } }] },
    });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.10: учётная запись куратора — приглашение; правка профиля сразу видна клиенту', async () => {
    const user = await admin.createUser(head(), { email: `nt-cur-${stamp}@example.org`, fullName: 'Куратор Договоров', role: 'EXPERT' });
    ids.curator = user.id;
    assert.equal(await letters(user.id, 'CURATOR_INVITED'), 1);
    await admin.saveCuratorProfile(head(), user.id, {
      degree: 'к.т.н.',
      academicTitle: '',
      position: '',
      specialtyCode: '2.8.6',
      specialization: 'Геомеханика',
      university: '',
      defaultPayout: '',
    });
    await projects.assignExpert(who(ids.manager!, 'MANAGER'), ids.project!, user.id);
    const seen = await projectByCode(who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), ids.code!);
    assert.equal(expertLine(seen!.expert!.expertProfile), 'к.т.н., 2.8.6');
  });

  it('H.11: назначен без договора — дело у руководителя по чужой работе', async () => {
    const row = await task();
    assert.ok(row !== undefined, 'дела «Нужен договор поручения» нет');
    assert.equal(row.works, 1);
    assert.equal(row.requestedAt, null);
    // Менеджеру работы — прежнее дело по работе, руководителю оно не дублируется.
    const managerToday = await todayItems(who(ids.manager!, 'MANAGER'));
    assert.ok(managerToday.noNda.some((item) => item.code === ids.code));
    assert.ok(!(await todayItems(head())).noNda.some((item) => item.code === ids.code));
  });

  it('H.11: отметка договора — дело закрыто, куратору письмо', async () => {
    await admin.signExpertNda(head(), ids.curator!, new Date(Date.UTC(2026, 9, 1)));
    assert.equal(await task(), undefined);
    assert.equal(await letters(ids.curator!, 'NDA_SIGNED'), 1);
  });
});
