/**
 * Оценка сопровождения на настоящей базе (решение Р-561): ставит только
 * клиент своей завершённой работы и один раз; снимок менеджера и куратора;
 * журнал без текста; средние — только руководителю; отзыв с разрешением —
 * в выгрузке отзывов.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('оценка сопровождения', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const ratings = await import('../src/lib/cabinet/ratings.ts');
  const { reviewsTable } = await import('../src/lib/disk/registry.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const users: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const other = () => who(ids.otherUser!, 'CLIENT', { clientProfileId: ids.otherClient! });
  const manager = () => who(ids.manager!, 'MANAGER');
  const head = () => who(ids.head!, 'HEAD');

  const newProject = async (suffix: string, status: 'ACTIVE' | 'COMPLETED') => {
    const project = await prisma.project.create({
      data: {
        code: `PD-RT-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        expertId: ids.expert!,
        status,
      },
    });
    projectIds.push(project.id);
    return project;
  };
  const rate = (actor: Actor, projectId: string, score: string, text = '', publishAllowed = false) =>
    ratings.rateWork(actor, { projectId, score, text, publishAllowed }, '203.0.113.7');

  before(async () => {
    const user = async (key: string, role: Actor['role']) => {
      const row = await prisma.user.create({ data: { email: `rt-${key}-${stamp}@example.org`, fullName: `Учётка ${key}`, role } });
      users.push(row.id);
      return row.id;
    };
    ids.manager = await user('mgr', 'MANAGER');
    ids.head = await user('head', 'HEAD');
    ids.expert = await user('exp', 'EXPERT');
    ids.clientUser = await user('cli', 'CLIENT');
    ids.otherUser = await user('oth', 'CLIENT');
    ids.type = (await prisma.serviceType.create({ data: { code: `rt-${stamp}`, name: `Вид оценки ${stamp}` } })).id;
    ids.client = (await prisma.clientProfile.create({ data: { fullName: 'Клиент', normalizedName: `rt клиент ${stamp}`, userId: ids.clientUser } })).id;
    ids.otherClient = (await prisma.clientProfile.create({ data: { fullName: 'Другой', normalizedName: `rt другой ${stamp}`, userId: ids.otherUser } })).id;
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.workRating.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.otherClient!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('оценивает только клиент своей работы и только завершённой', async () => {
    const done = await newProject('A', 'COMPLETED');
    const live = await newProject('B', 'ACTIVE');
    await assert.rejects(rate(manager(), done.id, '5'), AccessDenied);
    await assert.rejects(rate(head(), done.id, '5'), AccessDenied);
    await assert.rejects(rate(other(), done.id, '5'), AccessDenied);
    await assert.rejects(rate(client(), live.id, '5'), /завершённую работу/u);
    assert.deepEqual(await ratings.ratingFor(client(), { ...live, status: live.status }), { mayRate: false, score: null });
    assert.deepEqual(await ratings.ratingFor(client(), { ...done, status: done.status }), { mayRate: true, score: null });
    assert.deepEqual(await ratings.ratingFor(manager(), { ...done, status: done.status }), { mayRate: false, score: null });
  });

  it('проверка формы: оценка 1–5, отзыв в пределах', async () => {
    const done = projectIds[0]!;
    await assert.rejects(rate(client(), done, '0'), ratings.RatingError);
    await assert.rejects(rate(client(), done, '5', 'о'.repeat(2001)), ratings.RatingError);
    assert.equal(await prisma.workRating.count({ where: { projectId: done } }), 0);
  });

  it('оценка — один раз; снимок менеджера и куратора; журнал без текста; без текста разрешение не хранится', async () => {
    const done = projectIds[0]!;
    await rate(client(), done, '4', '', true);
    const row = await prisma.workRating.findUniqueOrThrow({ where: { projectId: done } });
    assert.equal(row.score, 4);
    assert.equal(row.text, null);
    assert.equal(row.publishAllowed, false, 'разрешение без текста ничего не публикует');
    assert.equal(row.managerId, ids.manager);
    assert.equal(row.expertId, ids.expert);
    await assert.rejects(rate(client(), done, '5', 'Ещё раз'), /уже поставлена/u);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { projectId: done, action: 'WORK_RATED' } });
    assert.equal(event.actorIp, '203.0.113.7');
    assert.deepEqual(event.payload, { score: 4, withText: false, publishAllowed: false });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: done } });
    assert.deepEqual(await ratings.ratingFor(client(), project), { mayRate: false, score: 4 });
  });

  it('средние — руководителю; менеджеру — пусто; отзыв с разрешением — в выгрузке отзывов', async () => {
    const second = await newProject('C', 'COMPLETED');
    const marker = `Отзыв ${stamp}: всё по срокам`;
    await rate(client(), second.id, '5', marker, true);
    const third = await newProject('D', 'COMPLETED');
    await rate(client(), third.id, '3', `Без публикации ${stamp}`, false);

    const summary = await ratings.ratingSummary(head());
    const mine = summary.managers.get(ids.manager!);
    assert.deepEqual(mine, { average: 4, count: 3 });
    assert.deepEqual(summary.curators.get(ids.expert!), { average: 4, count: 3 });
    assert.ok(summary.practice !== null && summary.practice.count >= 3);
    const forManager = await ratings.ratingSummary(manager());
    assert.equal(forManager.practice, null);
    assert.equal(forManager.managers.size, 0);

    const table = await reviewsTable();
    const rows = table.data.filter((row) => String(row[3]).includes(String(stamp)));
    assert.equal(rows.length, 1, 'в выгрузке — только отзыв с разрешением');
    assert.equal(rows[0]![3], marker);
    assert.equal(rows[0]![1], 'Кабинет');
    assert.equal(rows[0]![2], `Вид оценки ${stamp}, оценка 5 из 5`);
    assert.equal(rows[0]![4], 'да');
  });
});
