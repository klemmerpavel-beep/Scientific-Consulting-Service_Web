/**
 * Профиль куратора у руководителя (требование Э-11, решение Р-324):
 * степень, звание, должность, специальность (шифр и название), вуз,
 * ставка по умолчанию. Правка сразу видна клиенту в «О работе», пустые
 * поля клиенту не выводятся; менеджер и сам куратор профиль не правят;
 * в журнал пишется перечень изменённых полей.
 *
 * С П-1 (решение Р-764) — обезличенный профиль: стаж, публикации по
 * категориям с днём сверки; согласия куратор с П-12 (Р-768) отмечает сам —
 * `curator-consents.db.test.ts`. В данных экрана клиента —
 * только обезличенный профиль, без ФИО, должности, вуза, ставки, SPIN,
 * ORCID и средней оценки; число завершённых работ с куратором.
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
  const { expertLine, curatorProfileRows } = await import('../src/lib/cabinet/access.ts');
  const { projectByCode, curatorDoneCount } = await import('../src/lib/cabinet/queries.ts');

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
    const [headUser, manager, clientUser, curator, other] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Профиля'),
      make('mgr', 'MANAGER', 'Менеджер Профиля'),
      make('cl', 'CLIENT', 'Клиент Профиля'),
      make('cur', 'EXPERT', 'Куратор Профиля'),
      make('oth', 'EXPERT', 'Другой Куратор Профиля'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curator.id, ndaSignedAt: new Date() } });
    // Анкета кандидата с той же почтой, набранной иначе: по SPIN и ORCID из
    // неё руководитель сверяет публикации (Р-597).
    const application = await prisma.expertApplication.create({
      data: {
        fullName: 'Куратор Профиля',
        email: curator.email.toUpperCase(),
        degree: 'Доктор наук',
        fields: 'Проверка профиля',
        experience: 'Проверка профиля',
        elibrarySpin: '8642-1357',
        orcid: '0000-0001-7531-8642',
        consentVersion: 'test',
        status: 'INVITED',
      },
    });
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
    // Две завершённые работы с куратором у другого клиента — число
    // профиля считает всю практику; одна из них оценена (средняя оценка
    // в профиль не входит, П-8). Отменённая не считается.
    const otherClient = await prisma.clientProfile.create({
      data: { fullName: 'Другой Клиент Профиля', normalizedName: `cp другой ${stamp}` },
    });
    const done = await Promise.all(
      (['COMPLETED', 'COMPLETED', 'CANCELLED'] as const).map((status, index) =>
        prisma.project.create({
          data: {
            code: `PD-CP-${String(stamp).slice(-6)}-${index}`,
            clientId: otherClient.id,
            serviceTypeId: type.id,
            title: `Завершённая работа ${index}`,
            managerId: manager.id,
            expertId: curator.id,
            status,
          },
        }),
      ),
    );
    await prisma.workRating.create({
      data: { projectId: done[0]!.id, score: 2, text: 'Отзыв для проверки профиля', managerId: manager.id, expertId: curator.id },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: manager.id,
      clientUser: clientUser.id,
      curator: curator.id,
      other: other.id,
      client: profile.id,
      otherClient: otherClient.id,
      type: type.id,
      project: project.id,
      code: project.code,
      application: application.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.clientUser!, ids.curator!, ids.other!];
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: users } }, { objectId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { OR: [{ id: ids.project }, { clientId: ids.otherClient }] } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.otherClient!] } } });
    await prisma.expertApplication.deleteMany({ where: { id: ids.application } });
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
  // ─────────────── Обезличенный профиль (П-1, решение Р-764) ───────────────

  const publicProfile = {
    ...full,
    experienceYears: '23',
    pubK1: '4',
    pubK2: '6',
    pubK3: '2',
    pubRsci: '3',
    pubIntl: '5',
    pubCheckedOn: '2026-10-15',
  };

  it('руководитель вносит стаж, публикации и день сверки', async () => {
    await admin.saveCuratorProfile(head(), ids.curator!, publicProfile);
    const saved = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.equal(saved.experienceYears, 23);
    assert.deepEqual([saved.pubK1, saved.pubK2, saved.pubK3, saved.pubRsci, saved.pubIntl], [4, 6, 2, 3, 5]);
    assert.equal(saved.pubCheckedOn?.toISOString(), '2026-10-15T00:00:00.000Z');
    // Согласия форма руководителя не ставит (П-12, Р-768).
    assert.equal(saved.cameraConsentAt, null);
    assert.equal(saved.showcaseConsentAt, null);
  });

  it('числа без дня сверки, день в будущем и не числа — отказ без записи', async () => {
    const before = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    await assert.rejects(
      admin.saveCuratorProfile(head(), ids.curator!, { ...publicProfile, pubCheckedOn: '' }),
      /Укажите дату сверки публикаций/u,
    );
    await assert.rejects(
      admin.saveCuratorProfile(head(), ids.curator!, { ...publicProfile, pubCheckedOn: '2999-01-01' }),
      /не позже сегодняшнего дня/u,
    );
    await assert.rejects(
      admin.saveCuratorProfile(head(), ids.curator!, { ...publicProfile, pubK1: 'много' }),
      /Публикации ВАК, К1 — целым числом/u,
    );
    await assert.rejects(
      admin.saveCuratorProfile(head(), ids.curator!, { ...publicProfile, experienceYears: '230' }),
      /Стаж — целым числом от 0 до 70/u,
    );
    const after = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.deepEqual(after, before);
    // Все числа пусты — день сверки не требуется.
    await admin.saveCuratorProfile(head(), ids.curator!, {
      ...publicProfile,
      pubK1: '',
      pubK2: '',
      pubK3: '',
      pubRsci: '',
      pubIntl: '',
      pubCheckedOn: '',
    });
    await admin.saveCuratorProfile(head(), ids.curator!, publicProfile);
  });

  it('прежний вызов без новых полей их не трогает', async () => {
    await admin.saveCuratorProfile(head(), ids.curator!, { ...full, position: 'профессор кафедры' });
    const saved = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.equal(saved.position, 'профессор кафедры');
    assert.equal(saved.experienceYears, 23);
    assert.equal(saved.pubK1, 4);
    await admin.saveCuratorProfile(head(), ids.curator!, full);
  });

  it('руководителю — SPIN и ORCID из анкеты кандидата с той же почтой', async () => {
    const curators = await admin.curatorProfiles(head());
    const row = curators.find((user) => user.id === ids.curator);
    assert.equal(row?.application?.id, ids.application);
    assert.equal(row?.application?.elibrarySpin, '8642-1357');
    assert.equal(row?.application?.orcid, '0000-0001-7531-8642');
    assert.equal(curators.find((user) => user.id === ids.other)?.application, null);
    assert.equal(row?.expertProfile?.pubK2, 6);
  });

  it('данные экрана работы клиента — обезличенный профиль без ФИО, должности, вуза, ставки, SPIN, ORCID и оценки', async () => {
    const seen = await projectByCode(client(), ids.code!);
    const profile = seen!.expert!.expertProfile as Record<string, unknown>;
    assert.equal(profile.experienceYears, 23);
    assert.equal(profile.pubK1, 4);
    assert.equal(profile.academicTitle, 'профессор');
    const text = JSON.stringify(seen, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
    for (const trace of [
      'Куратор Профиля',
      'cp-cur-',
      'заведующий кафедрой',
      'Горный университет',
      '1500000',
      '8642-1357',
      '0000-0001-7531-8642',
      'Отзыв для проверки профиля',
      'score',
      'cameraConsentAt',
      'showcaseConsentAt',
      'showcaseConsentHash',
      'ndaSignedAt',
    ]) {
      assert.ok(!text.includes(trace), `в данных экрана клиента — ${trace}`);
    }
    const rows = curatorProfileRows(seen!.expert!.expertProfile, await curatorDoneCount(client(), ids.curator!));
    assert.deepEqual(
      rows.map((row) => row.term),
      ['Степень и звание', 'Научная специальность', 'Стаж научной и преподавательской работы', 'Публикации', 'Завершено работ в ProDisser'],
    );
    assert.equal(rows.find((row) => row.term === 'Публикации')?.note, 'за пять лет, сверено 15 октября 2026');
  });

  it('практике данные экрана работы — с регалиями и договором, как прежде', async () => {
    const seen = await projectByCode(head(), ids.code!);
    assert.equal(seen!.expert!.fullName, 'Куратор Профиля');
    assert.ok(seen!.expert!.expertProfile?.ndaSignedAt instanceof Date);
  });

  it('завершённые работы с куратором: клиенту и самому куратору — число по практике; менеджеру и чужому куратору — нет', async () => {
    assert.equal(await curatorDoneCount(client(), ids.curator!), 2);
    assert.equal(await curatorDoneCount(who(ids.curator!, 'EXPERT'), ids.curator!), 2);
    assert.equal(await curatorDoneCount(head(), ids.curator!), 2);
    assert.equal(await curatorDoneCount(who(ids.manager!, 'MANAGER'), ids.curator!), null);
    assert.equal(await curatorDoneCount(who(ids.other!, 'EXPERT'), ids.curator!), null);
    // Клиенту без работы с этим куратором число не отдаётся.
    assert.equal(await curatorDoneCount(client(), ids.other!), null);
  });

  it('свой профиль куратор читает с согласиями и числами', async () => {
    const own = await admin.ownCuratorProfile(who(ids.curator!, 'EXPERT'));
    assert.equal(own?.experienceYears, 23);
    assert.ok(own !== null && 'cameraConsentAt' in own && 'showcaseConsentHash' in own, 'в своём профиле нет согласий');
    assert.equal(await admin.ownCuratorProfile(head()), null);
  });
});
