/**
 * Утренняя сводка и сигналы руководителю (требование РК-13, решение
 * Р-347): в нерабочий день и в день без дел сводка не уходит; в рабочий
 * день с делами — одна на день, с числом дел по видам и без сумм;
 * просроченный платёж — сигнал один раз на транш, без суммы, а давний
 * долг за окном — без сигнала; отключённая строка правил не даёт строки
 * очереди; передача работы — сигнал другому руководителю; письмо о заказе
 * с договором — без суммы.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;
// Понедельник и воскресенье по Москве; утро — до начала рабочего дня.
const MONDAY = new Date('2026-10-05T04:00:00Z');
const SUNDAY = new Date('2026-10-04T04:00:00Z');

describe('сводка и сигналы руководителю (РК-13)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const digest = await import('../src/lib/cabinet/head-digest.ts');
  const { attentionParts, attentionSources } = await import('../src/lib/cabinet/attention.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');

  const ids: Record<string, string> = {};
  const started = new Date();
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const rows = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, eventKind, channel: 'EMAIL', createdAt: { gte: started } } });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `hn-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, otherHead, managerUser, secondManager] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Сигналов'),
      make('head2', 'HEAD', 'Второй Руководитель'),
      make('mgr', 'MANAGER', 'Менеджер Сигналов'),
      make('mgr2', 'MANAGER', 'Другой Менеджер Сигналов'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Сигналов', normalizedName: `hn клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `hn-${stamp}`, name: 'Проверка сигналов' } });
    // Своя работа руководителя с сорванным сроком этапа — дело на сводке.
    const project = await prisma.project.create({
      data: {
        code: `PD-HN-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: `Работа сигналов ${stamp}`,
        managerId: headUser.id,
      },
    });
    await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 1', state: 'IN_PROGRESS', dueOn: new Date(MONDAY.getTime() - 3 * DAY) },
    });
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `HN-${stamp}`, totalAmount: 25_000_000n },
    });
    const day = (offset: number) => new Date(Date.UTC(2026, 9, 5) + offset * DAY);
    const [fresh, stale] = await Promise.all([
      prisma.tranche.create({
        data: { contractId: contract.id, title: `Аванс ${stamp}`, amount: 12_345_600n, plannedDate: day(-1), status: 'INVOICED' },
      }),
      prisma.tranche.create({
        data: { contractId: contract.id, title: `Старый ${stamp}`, amount: 7_000_000n, plannedDate: day(-30), status: 'PLANNED' },
      }),
    ]);
    Object.assign(ids, {
      head: headUser.id,
      otherHead: otherHead.id,
      manager: managerUser.id,
      secondManager: secondManager.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      contract: contract.id,
      fresh: fresh.id,
      stale: stale.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.otherHead!, ids.manager!, ids.secondManager!];
    await prisma.notificationOutbox.deleteMany({
      where: {
        OR: [
          { userId: { in: users } },
          { projectId: ids.project },
          { eventKind: { in: ['HEAD_DIGEST', 'TRANCHE_OVERDUE'] }, createdAt: { gte: started } },
        ],
      },
    });
    await prisma.notifyRule.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.tranche.deleteMany({ where: { contractId: ids.contract } });
    await prisma.contract.deleteMany({ where: { id: ids.contract } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('в нерабочий день сводка не уходит; без дел — тоже', async () => {
    await digest.enqueueHeadDigest(SUNDAY);
    assert.deepEqual(await rows(ids.head!, 'HEAD_DIGEST'), [], 'сводка в воскресенье');
    const empty = Object.fromEntries(Object.keys(digest.DIGEST_LABEL).map((key) => [key, []])) as never;
    assert.equal(digest.digestLetter(empty, MONDAY).total, 0);
  });

  it('в рабочий день с делами — одна сводка, число дел по видам, без сумм', async () => {
    await digest.enqueueHeadDigest(MONDAY);
    await digest.enqueueHeadDigest(MONDAY);
    const [letter, ...rest] = await rows(ids.head!, 'HEAD_DIGEST');
    assert.ok(letter !== undefined, 'сводки нет');
    assert.equal(rest.length, 0, 'вторая сводка за день');
    assert.equal(letter.dedupKey, `head-digest:2026-10-05:${ids.head}:email`);
    assert.equal(letter.path, '/cabinet/manage');
    const parts = attentionParts(await attentionSources(head()));
    const total = Object.values(parts).reduce((acc, part) => acc + part.length, 0);
    assert.match(letter.body, new RegExp(`^Требует решения — ${total}\\.`, 'u'));
    assert.match(letter.body, /сорван срок этапа: \d+/u);
    assert.doesNotMatch(`${letter.subject} ${letter.body}`, /₽|123\s?456/u, 'сумма в сводке');
  });

  it('просроченный платёж — сигнал один раз на транш, без суммы; давний долг — без сигнала', async () => {
    await digest.enqueueTrancheOverdue(MONDAY);
    await digest.enqueueTrancheOverdue(MONDAY);
    const signals = (await rows(ids.head!, 'TRANCHE_OVERDUE')).filter((row) => row.projectId === ids.project);
    assert.equal(signals.length, 1, 'сигнал не один');
    assert.equal(signals[0]!.dedupKey, `tranche-overdue:${ids.fresh}:${ids.head}:email`);
    assert.match(signals[0]!.body, new RegExp(`Аванс ${stamp}`, 'u'));
    assert.doesNotMatch(signals[0]!.body, /₽|123\s?456/u, 'сумма в сигнале');
    assert.equal(signals[0]!.path, '/cabinet/manage/finance/debtors');
  });

  it('транш сверх остатка оплаченного договора — без сигнала: «Должники» его не показывают (Р-447)', async () => {
    // Пример Р-447: договор на 100 000 оплачен полностью, транш на 20 000
    // запланирован на прошлую неделю — долгом он не считается.
    const work = await prisma.project.create({
      data: {
        code: `PD-HN-${String(stamp).slice(-6)}-P`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Оплаченная ${stamp}`,
        managerId: ids.head!,
      },
    });
    const paid = await prisma.contract.create({ data: { projectId: work.id, number: `HNP-${stamp}`, totalAmount: 10_000_000n } });
    try {
      await prisma.tranche.createMany({
        data: [
          { contractId: paid.id, title: `Полная оплата ${stamp}`, amount: 10_000_000n, plannedDate: new Date(Date.UTC(2026, 8, 20)), status: 'PAID' },
          { contractId: paid.id, title: `Лишний ${stamp}`, amount: 2_000_000n, plannedDate: new Date(Date.UTC(2026, 9, 1)), status: 'PLANNED' },
        ],
      });
      await digest.enqueueTrancheOverdue(MONDAY);
      const signals = await prisma.notificationOutbox.findMany({ where: { projectId: work.id, eventKind: 'TRANCHE_OVERDUE' } });
      assert.deepEqual(signals, [], 'сигнал по траншу, которого нет в «Должниках»');
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { projectId: work.id } });
      await prisma.tranche.deleteMany({ where: { contractId: paid.id } });
      await prisma.contract.delete({ where: { id: paid.id } });
      await prisma.project.delete({ where: { id: work.id } });
    }
  });

  it('отключённая строка правил не даёт строки очереди', async () => {
    // Строки прежних прогонов сняты: ключ повтора иначе скрыл бы проверку.
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.otherHead } });
    await prisma.notifyRule.createMany({
      data: [
        { userId: ids.otherHead!, eventKind: 'TRANCHE_OVERDUE', channel: 'EMAIL', enabled: false },
        { userId: ids.otherHead!, eventKind: 'HEAD_DIGEST', channel: 'EMAIL', enabled: false },
      ],
    });
    await digest.enqueueTrancheOverdue(MONDAY);
    await digest.enqueueHeadDigest(MONDAY);
    assert.deepEqual(await rows(ids.otherHead!, 'TRANCHE_OVERDUE'), []);
    assert.deepEqual(await rows(ids.otherHead!, 'HEAD_DIGEST'), []);
  });

  it('передача работы — сигнал другому руководителю, без сумм', async () => {
    await projects.assignManager(head(), ids.project!, ids.manager!, 'Руководитель уходит в отпуск');
    const [signal] = await rows(ids.otherHead!, 'WORK_TRANSFERRED');
    assert.ok(signal !== undefined, 'другому руководителю сигнала нет');
    assert.match(signal.body, /Менеджер Сигналов: Руководитель уходит в отпуск/u);
    assert.doesNotMatch(signal.body, /₽/u);
    assert.deepEqual(await rows(ids.head!, 'WORK_TRANSFERRED'), [], 'сигнал тому, кто передал');
  });
});
