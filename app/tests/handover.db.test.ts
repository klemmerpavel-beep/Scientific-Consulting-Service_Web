/**
 * Сдача этапа куратором менеджеру на настоящей базе (требование Э-05,
 * решение Р-325): без своей версии и без записки сдача не проходит; после
 * сдачи менеджер получает дело и уведомление; отзыв — до решения
 * менеджера; возврат — с причиной; уход этапа из «В работе» и замена
 * куратора гасят пометку; состояние этапа куратор не меняет; клиенту поля
 * сдачи не отдаются.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'h'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('сдача этапа куратором (Э-05)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { stageById, todayItems } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const stage = () => prisma.stage.findUniqueOrThrow({ where: { id: ids.stage } });
  const outbox = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.count({ where: { userId, eventKind, channel: 'EMAIL' } });

  /** Версия материала этапа от имени `uploadedById`; у версии куратора — строка модерации. */
  async function addVersion(uploadedById: string, status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | null) {
    const material = await prisma.material.create({
      data: {
        projectId: ids.project!,
        stageId: ids.stage!,
        title: `Материал ${Math.random().toString(36).slice(2, 8)}`,
        createdById: uploadedById,
        versions: {
          create: {
            number: 1,
            storageKey: `handover/${stamp}/${Math.random()}`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'b'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById,
          },
        },
      },
      include: { versions: true },
    });
    const version = material.versions[0]!;
    if (status !== null) await prisma.versionModeration.create({ data: { versionId: version.id, status } });
    return version.id;
  }

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `ho-${suffix}-${stamp}@example.org`, fullName, role } });
    const [manager, clientUser, curator, other] = await Promise.all([
      make('mgr', 'MANAGER', 'Менеджер Сдачи'),
      make('cl', 'CLIENT', 'Клиент Сдачи'),
      make('cur', 'EXPERT', 'Куратор Сдачи'),
      make('oth', 'EXPERT', 'Другой Куратор'),
    ]);
    await prisma.expertProfile.createMany({
      data: [
        { userId: curator.id, ndaSignedAt: NDA },
        { userId: other.id, ndaSignedAt: NDA },
      ],
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Сдачи', normalizedName: `ho клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `ho-${stamp}`, name: 'Проверка сдачи' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-HO-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки сдачи',
        managerId: manager.id,
        expertId: curator.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 2', state: 'IN_PROGRESS' },
    });
    Object.assign(ids, {
      manager: manager.id,
      clientUser: clientUser.id,
      curator: curator.id,
      other: other.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    const users = [ids.manager!, ids.clientUser!, ids.curator!, ids.other!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: ids.project }, { userId: { in: users } }] } });
    await prisma.stageStateChange.deleteMany({ where: { stageId: ids.stage } });
    await prisma.versionModeration.deleteMany({ where: { version: { material: { projectId: ids.project } } } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: ids.project } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('без своей версии сдача не проходит; отклонённая версия не в счёт', async () => {
    await assert.rejects(handover.handOverStage(curator(), ids.stage!, 'Глава написана'), /приложена ваша версия/u);
    await addVersion(ids.curator!, 'REJECTED');
    await assert.rejects(handover.handOverStage(curator(), ids.stage!, 'Глава написана'), /приложена ваша версия/u);
    // Версия клиента тоже не в счёт: сдаётся работа куратора.
    await addVersion(ids.clientUser!, null);
    await assert.rejects(handover.handOverStage(curator(), ids.stage!, 'Глава написана'), /приложена ваша версия/u);
  });

  it('без записки сдача не проходит; менеджер сдать за куратора не может', async () => {
    ids.version = await addVersion(ids.curator!, 'PENDING');
    await assert.rejects(handover.handOverStage(curator(), ids.stage!, '   '), /обязательна/u);
    await assert.rejects(handover.handOverStage(manager(), ids.stage!, 'Глава написана'), /не разрешено/u);
  });

  it('сдача: пометка, дело и уведомление менеджеру; состояние этапа прежнее', async () => {
    const before = await outbox(ids.manager!, 'STAGE_HANDED_OVER');
    await handover.handOverStage(curator(), ids.stage!, 'Глава 2 написана; проверьте таблицу 3');
    const row = await stage();
    assert.ok(row.handedOverAt !== null);
    assert.equal(row.handoverNote, 'Глава 2 написана; проверьте таблицу 3');
    assert.equal(row.state, 'IN_PROGRESS', 'сдача сменила состояние этапа');
    assert.equal(await outbox(ids.manager!, 'STAGE_HANDED_OVER'), before + 1);
    const today = await todayItems(manager());
    assert.ok(today.handedOver.some((item) => item.href === `/cabinet/stages/${ids.stage}`), 'дела у менеджера нет');
    await assert.rejects(handover.handOverStage(curator(), ids.stage!, 'Ещё раз'), /уже сдан/u);
  });

  it('куратор состояние этапа не меняет', async () => {
    await assert.rejects(projects.setStageState(curator(), ids.stage!, 'IN_APPROVAL', 'Итог'), /не разрешено/u);
  });

  it('клиенту поля сдачи не отдаются', async () => {
    const seen = await stageById(client(), ids.stage!);
    assert.ok(seen !== null);
    const text = JSON.stringify(seen, (_key, value) => (typeof value === 'bigint' ? String(value) : value));
    for (const key of ['handedOverAt', 'handoverNote', 'handbackAt', 'handbackReason']) {
      assert.ok(!text.includes(`"${key}"`), `клиенту отдано поле ${key}`);
    }
    assert.ok(!text.includes('таблицу 3'), 'записка куратора в данных клиента');
  });

  it('отзыв — до решения менеджера; записка остаётся', async () => {
    await handover.recallHandover(curator(), ids.stage!);
    const row = await stage();
    assert.equal(row.handedOverAt, null);
    assert.equal(row.handoverNote, 'Глава 2 написана; проверьте таблицу 3');
    await assert.rejects(handover.recallHandover(curator(), ids.stage!), /Отозвать нечего/u);
  });

  it('возврат куратору — с причиной; уведомление куратору; отозвать после возврата нельзя', async () => {
    await handover.handOverStage(curator(), ids.stage!, 'Глава 2 готова');
    await assert.rejects(handover.handBackStage(manager(), ids.stage!, ' '), /обязательна/u);
    await assert.rejects(handover.handBackStage(curator(), ids.stage!, 'Причина'), /не разрешено/u);
    const before = await outbox(ids.curator!, 'CURATOR_TURN');
    await handover.handBackStage(manager(), ids.stage!, 'Добавьте выводы к главе');
    const row = await stage();
    assert.equal(row.handedOverAt, null);
    assert.equal(row.handbackReason, 'Добавьте выводы к главе');
    assert.ok(row.handbackAt !== null);
    assert.equal(await outbox(ids.curator!, 'CURATOR_TURN'), before + 1);
    await assert.rejects(handover.recallHandover(curator(), ids.stage!), /Отозвать нечего/u);
  });

  it('перевод на согласование гасит пометку, записку и возврат', async () => {
    await handover.handOverStage(curator(), ids.stage!, 'Глава 2 с выводами');
    // На согласование уходит этап с материалом, который видит клиент.
    await prisma.versionModeration.update({ where: { versionId: ids.version }, data: { status: 'PUBLISHED' } });
    await projects.setStageState(manager(), ids.stage!, 'IN_APPROVAL', 'Глава 2 с выводами');
    const row = await stage();
    assert.equal(row.handedOverAt, null);
    assert.equal(row.handoverNote, null);
    assert.equal(row.handbackAt, null);
    assert.equal(row.handbackReason, null);
    assert.equal(row.outcome, 'Глава 2 с выводами');
  });

  it('замена куратора гасит сдачу прежнего', async () => {
    await prisma.stage.update({ where: { id: ids.stage }, data: { state: 'IN_PROGRESS' } });
    await handover.handOverStage(curator(), ids.stage!, 'Сдаю перед уходом');
    await projects.assignExpert(who(ids.manager!, 'MANAGER'), ids.project!, ids.other!);
    assert.equal((await stage()).handedOverAt, null);
  });
});
