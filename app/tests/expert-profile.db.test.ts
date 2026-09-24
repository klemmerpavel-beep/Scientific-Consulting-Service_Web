/**
 * Профиль эксперта и списки экрана учётных записей (решение Р-225).
 *
 * Запись, ставшая экспертом сменой роли, оставалась без профиля: без даты
 * договора поручения, без единой работы и без способа это исправить.
 * Списки договоров и ссылок входа брались со страницы перечня.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('профиль эксперта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const { expertRegistry } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const ids: string[] = [];
  let headId = '';

  const head = (): Actor => ({
    id: headId,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `ep-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD', status: 'SUSPENDED' },
    });
    headId = boss.id;
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { actorId: headId } });
    await prisma.user.deleteMany({ where: { id: { in: [...ids, headId] } } });
    await prisma.$disconnect();
  });

  it('смена роли на «эксперт» заводит профиль', async () => {
    const user = await prisma.user.create({
      data: { email: `ep-mgr-${stamp}@example.org`, fullName: 'Бывший менеджер', role: 'MANAGER' },
    });
    ids.push(user.id);
    await admin.setUserRole(head(), user.id, 'EXPERT');
    const profile = await prisma.expertProfile.findUnique({ where: { userId: user.id } });
    assert.ok(profile !== null, 'профиль эксперта не заведён');
  });

  it('договор поручения отмечается и у записи без профиля', async () => {
    // Так выглядит запись, ставшая экспертом до решения Р-225.
    const user = await prisma.user.create({
      data: { email: `ep-bare-${stamp}@example.org`, fullName: 'Эксперт без профиля', role: 'EXPERT' },
    });
    ids.push(user.id);
    const listed = await admin.expertsForNda(head());
    assert.ok(listed.some((row) => row.id === user.id), 'эксперт без профиля не попал в список договоров');

    const signed = new Date('2026-09-01T00:00:00Z');
    await admin.signExpertNda(head(), user.id, signed);
    const profile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(profile.ndaSignedAt?.toISOString(), signed.toISOString());
  });

  it('новый эксперт заводится без пустых регалий', async () => {
    const user = await admin.createUser(head(), {
      email: `ep-new-${stamp}@example.org`,
      fullName: 'Новый эксперт',
      role: 'EXPERT',
    });
    ids.push(user.id);
    const profile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(profile.degree, null);
    assert.equal(profile.specialization, null);
    const row = (await expertRegistry(head())).find((r) => r.id === user.id);
    assert.ok(row !== undefined);
    assert.equal(row.degree, null, 'реестр напечатал бы «Имя · »');
  });

  it('ссылку входа можно выдать любой действующей записи, а не странице перечня', async () => {
    const people = await admin.accessLinkPeople(head());
    const page = await admin.listUsers(head(), { page: 1 });
    const total = await prisma.user.count({ where: { status: 'ACTIVE' } });
    assert.equal(people.length, total, 'список ссылок входа неполон');
    assert.ok(people.length >= page.rows.filter((row) => row.status === 'ACTIVE').length);
  });
});
