/**
 * Сводка куратору гаснет вместе с письмами, которые ему больше не положены
 * (решение Р-534): снятие с работы убирает из неотправленной сводки письма
 * об этой работе, а начисление и письма о других работах остаются; отзыв
 * договора поручения гасит сводку, в которой остались только письма о
 * работах.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('сводка куратору при снятии и отзыве договора (Р-534)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const outbox = await import('../src/lib/cabinet/outbox.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const head = (): Actor => ({ id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const digest = () =>
    prisma.notificationOutbox.findFirstOrThrow({ where: { userId: ids.curator, eventKind: 'CURATOR_DIGEST' } });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string, extra = {}) =>
      prisma.user.create({ data: { email: `cdp-${suffix}-${stamp}@example.org`, fullName, role, ...extra } });
    const [headUser, managerUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Сводки'),
      make('mgr', 'MANAGER', 'Менеджер Сводки'),
      make('cur', 'EXPERT', 'Куратор Сводки', { notifyEmail: true, dailyDigest: true }),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Сводки', normalizedName: `cdp клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cdp-${stamp}`, name: 'Проверка сводки' } });
    const work = (suffix: string, title: string) =>
      prisma.project.create({
        data: {
          code: `PD-CDP-${String(stamp).slice(-6)}-${suffix}`,
          clientId: profile.id,
          serviceTypeId: type.id,
          title,
          managerId: managerUser.id,
          expertId: curatorUser.id,
        },
      });
    const [first, second] = await Promise.all([work('A', 'Первая работа'), work('B', 'Вторая работа')]);
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      first: first.id,
      second: second.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.curator!];
    const works = [ids.first!, ids.second!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: works } }, { userId: { in: users } }] } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: works } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: works } }, { actorId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: { in: works } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('снятие с работы убирает её письма из неотправленной сводки, остальное остаётся', async () => {
    const letter = (projectId: string, eventKind: 'CURATOR_TURN' | 'PAYOUT_ACCRUED', subject: string) =>
      outbox.enqueue(prisma, {
        userId: ids.curator!,
        projectId,
        eventKind,
        subject,
        body: '—',
        dedupKey: `cdp:${subject}:${stamp}`,
      });
    await letter(ids.first!, 'CURATOR_TURN', 'Ход за вами: этап «Обзор литературы»');
    await letter(ids.first!, 'PAYOUT_ACCRUED', 'Начислено вознаграждение');
    await letter(ids.second!, 'CURATOR_TURN', 'Ход за вами: этап «Методика»');
    // Почта лежит: сводка поставлена, но не ушла.
    assert.equal(await outbox.enqueueCuratorDigest(outbox.nextDigestAt(new Date())), 1);
    assert.match((await digest()).subject, /3 события/u);

    await projects.assignExpert(head(), ids.first!, null);

    const after = await digest();
    assert.equal(after.state, 'PENDING');
    assert.doesNotMatch(after.body, /Обзор литературы/u, 'в сводке осталось письмо о снятой работе');
    assert.match(after.body, /Методика/u);
    assert.match(after.body, /Начислено вознаграждение/u, 'письмо о его деньгах выпало');
    assert.match(after.subject, /2 события/u);
    const gone = await prisma.notificationOutbox.findFirstOrThrow({
      where: { userId: ids.curator, projectId: ids.first, eventKind: 'CURATOR_TURN', channel: 'EMAIL' },
    });
    assert.equal(gone.state, 'EXPIRED');
    assert.equal(gone.lastError, projects.UNASSIGNED_NOTE);
  });

  it('отзыв договора поручения гасит сводку с письмами о работах', async () => {
    await admin.signExpertNda(head(), ids.curator!, null);
    const after = await digest();
    assert.equal(after.state, 'EXPIRED', 'сводка с названиями этапов осталась в очереди');
    assert.equal(after.lastError, admin.NDA_REVOKED_NOTE);
    const merged = await prisma.notificationOutbox.count({ where: { userId: ids.curator, state: 'MERGED' } });
    assert.equal(merged, 0);
  });
});
