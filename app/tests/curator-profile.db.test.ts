/**
 * Профиль куратора у руководителя (требование Э-11, решение Р-324):
 * степень, звание, должность, специальность (шифр и название), вуз,
 * ставка по умолчанию. Правка сразу видна клиенту в «О работе», пустые
 * поля клиенту не выводятся; менеджер и сам куратор профиль не правят;
 * в журнал пишется перечень изменённых полей.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('профиль куратора (Э-11)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const { expertLine } = await import('../src/lib/cabinet/access.ts');
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
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const full = {
    degree: 'д.т.н.',
    academicTitle: 'профессор',
    position: 'заведующий кафедрой',
    specialtyCode: '2.8.6',
    specialization: 'Геомеханика, разрушение горных пород',
    university: 'Горный университет',
    defaultPayout: '15 000',
  };

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `cp-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, manager, clientUser, curator] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Профиля'),
      make('mgr', 'MANAGER', 'Менеджер Профиля'),
      make('cl', 'CLIENT', 'Клиент Профиля'),
      make('cur', 'EXPERT', 'Куратор Профиля'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curator.id, ndaSignedAt: new Date() } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Профиля', normalizedName: `cp клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cp-${stamp}`, name: 'Проверка профиля' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CP-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки профиля',
        managerId: manager.id,
        expertId: curator.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: manager.id,
      clientUser: clientUser.id,
      curator: curator.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.clientUser!, ids.curator!];
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: users } }, { objectId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('руководитель правит все поля; ставка — в копейках', async () => {
    await admin.saveCuratorProfile(head(), ids.curator!, full);
    const saved = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.equal(saved.degree, 'д.т.н.');
    assert.equal(saved.academicTitle, 'профессор');
    assert.equal(saved.position, 'заведующий кафедрой');
    assert.equal(saved.specialtyCode, '2.8.6');
    assert.equal(saved.specialization, 'Геомеханика, разрушение горных пород');
    assert.equal(saved.university, 'Горный университет');
    assert.equal(saved.defaultPayout, 1_500_000n);
  });

  it('правка сразу видна клиенту в «О работе»; пустые поля не выводятся', async () => {
    const seen = await projectByCode(client(), ids.code!);
    assert.equal(expertLine(seen!.expert!.expertProfile), 'д.т.н., 2.8.6');
    await admin.saveCuratorProfile(head(), ids.curator!, { ...full, degree: '  ' });
    const after = await projectByCode(client(), ids.code!);
    assert.equal(after!.expert!.expertProfile?.degree, null, 'пустая степень записана строкой');
    assert.equal(expertLine(after!.expert!.expertProfile), '2.8.6');
  });

  it('в журнал — перечень изменённых полей; без изменений записи нет', async () => {
    const count = () => prisma.auditEvent.count({ where: { action: 'CURATOR_PROFILE_SAVED', objectId: ids.curator } });
    const before = await count();
    await admin.saveCuratorProfile(head(), ids.curator!, { ...full, degree: '', defaultPayout: '20 000' });
    const last = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'CURATOR_PROFILE_SAVED', objectId: ids.curator },
      orderBy: { occurredAt: 'desc' },
    });
    assert.deepEqual((last.payload as { changed: string[] }).changed, ['defaultPayout']);
    assert.equal((last.payload as { defaultPayout: string }).defaultPayout, '2000000');
    await admin.saveCuratorProfile(head(), ids.curator!, { ...full, degree: '', defaultPayout: '20 000' });
    assert.equal(await count(), before + 1, 'сохранение без изменений записано в журнал');
  });

  it('менеджер и сам куратор профиль не правят; профиль — только у куратора', async () => {
    await assert.rejects(admin.saveCuratorProfile(who(ids.manager!, 'MANAGER'), ids.curator!, full), /не разрешено/u);
    await assert.rejects(admin.saveCuratorProfile(who(ids.curator!, 'EXPERT'), ids.curator!, full), /не разрешено/u);
    await assert.rejects(admin.saveCuratorProfile(head(), ids.manager!, full), /только у куратора/u);
  });

  it('шифр и ставка проверяются', async () => {
    await assert.rejects(admin.saveCuratorProfile(head(), ids.curator!, { ...full, specialtyCode: 'шифр' }), /цифрами через точку/u);
    await assert.rejects(admin.saveCuratorProfile(head(), ids.curator!, { ...full, defaultPayout: 'пятнадцать' }), /Сумма распознана неверно/u);
  });
});
