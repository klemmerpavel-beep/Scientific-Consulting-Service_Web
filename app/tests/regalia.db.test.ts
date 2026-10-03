/**
 * Куратор и эксперт для клиента (требование Т-11, решение Р-297): регалии
 * правит руководитель, роль эксперта задаётся при назначении, данные
 * экрана клиента не содержат ФИО эксперта, а куратор виден со степенью.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('регалии и роль эксперта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { projectByCode } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.manager!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `rg-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, manager, clientUser, expertUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Регалий'),
      make('mgr', 'MANAGER', 'Нечаева Ксения Ильинична'),
      make('cl', 'CLIENT', 'Клиент Регалий'),
      make('exp', 'EXPERT', 'Григорьев Антон Эдуардович'),
    ]);
    await prisma.expertProfile.create({ data: { userId: expertUser.id, ndaSignedAt: new Date() } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Регалий', normalizedName: `rg клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `rg-${stamp}`, name: 'Проверка регалий' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-RG-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки регалий',
        managerId: manager.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: manager.id,
      clientUser: clientUser.id,
      expert: expertUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.head!, ids.manager!, ids.clientUser!, ids.expert!, ...(ids.fresh ? [ids.fresh] : [])];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('регалии правит руководитель; куратору профиль заводится; пустое — null', async () => {
    const regalia = { degree: 'к.т.н.', specialization: 'горные машины', specialtyCode: '2.8.6' };
    await assert.rejects(admin.saveRegalia(curator(), ids.manager!, regalia), /не разрешено/u);
    await assert.rejects(admin.saveRegalia(head(), ids.clientUser!, regalia), /только у сотрудников/u);
    await assert.rejects(
      admin.saveRegalia(head(), ids.manager!, { ...regalia, specialtyCode: 'шифр' }),
      /цифрами через точку/u,
    );
    await admin.saveRegalia(head(), ids.manager!, regalia);
    await admin.saveRegalia(head(), ids.expert!, { degree: 'д.т.н.', specialization: ' ', specialtyCode: '2.8.6' });
    const managerProfile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.manager } });
    assert.equal(managerProfile.degree, 'к.т.н.');
    const expertProfile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.expert } });
    assert.equal(expertProfile.specialization, null);
    assert.ok(expertProfile.ndaSignedAt !== null, 'регалии стёрли договор поручения');
  });

  it('роль эксперта задаётся при назначении; по умолчанию — эксперт по специальности', async () => {
    await projects.assignExpert(curator(), ids.project!, ids.expert!);
    let project = await prisma.project.findUniqueOrThrow({ where: { id: ids.project } });
    assert.equal(project.expertRole, 'SUBJECT_EXPERT');
    await projects.assignExpert(curator(), ids.project!, ids.expert!, 'METHODOLOGIST');
    project = await prisma.project.findUniqueOrThrow({ where: { id: ids.project } });
    assert.equal(project.expertRole, 'METHODOLOGIST');
    await assert.rejects(
      projects.assignExpert(curator(), ids.project!, ids.expert!, 'BOSS' as never),
      /Неизвестная роль/u,
    );
  });

  it('эксперт без договора: вопрос руководителю, если назначил куратор (М-16, Р-298)', async () => {
    const { executorNames } = await import('../src/lib/cabinet/queries.ts');
    const fresh = await prisma.user.create({
      data: { email: `rg-nonda-${stamp}@example.org`, fullName: 'Петров Без Договора', role: 'EXPERT' },
    });
    ids.fresh = fresh.id;
    await projects.assignExpert(curator(), ids.project!, fresh.id);
    // Эксперту без договора — нейтральное письмо: код работы, без названия
    // и данных клиента (М-08, ОМ-13, Р-301).
    const assigned = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: fresh.id, eventKind: 'WORK_ASSIGNED', channel: 'EMAIL' },
    });
    assert.match(assigned.body, /откроется после договора поручения/u);
    assert.doesNotMatch(assigned.body, /Работа для проверки регалий/u, 'название работы ушло эксперту без договора');
    const asked = await prisma.notificationOutbox.findMany({
      where: { projectId: ids.project, userId: ids.head, eventKind: 'NDA_NEEDED', channel: 'EMAIL' },
    });
    assert.equal(asked.length, 1);
    assert.match(asked[0]!.subject, /Нужен договор поручения: Петров Без Договора, работа PD-RG-/u);

    // Назначил руководитель — вопроса себе нет.
    await projects.assignExpert(curator(), ids.project!, ids.expert!);
    await projects.assignExpert(head(), ids.project!, fresh.id);
    assert.equal(
      await prisma.notificationOutbox.count({ where: { projectId: ids.project, eventKind: 'NDA_NEEDED' } }),
      1,
    );

    // Имена исполнителей для истории — практике, клиенту — нет.
    assert.equal((await executorNames(curator(), [fresh.id])).get(fresh.id), 'Петров Без Договора');
    assert.equal((await executorNames(client(), [fresh.id])).size, 0);
    await projects.assignExpert(head(), ids.project!, ids.expert!, 'METHODOLOGIST');
  });

  it('данные экрана клиента — без ФИО эксперта; куратор — со степенью', async () => {
    const seen = await projectByCode(client(), ids.code!);
    const text = JSON.stringify(seen, (_key, value) => (typeof value === 'bigint' ? String(value) : value));
    assert.ok(!text.includes('Григорьев'), 'ФИО эксперта попало в данные клиента');
    assert.equal(seen?.manager.expertProfile?.degree, 'к.т.н.');
    assert.equal(seen?.expert?.expertProfile?.specialtyCode, '2.8.6');
    const staff = await projectByCode(curator(), ids.code!);
    assert.equal(staff?.expert?.fullName, 'Григорьев Антон Эдуардович');
  });
});
