/**
 * Производственный контур на настоящей базе — проход проверки кода
 * 09.10.2026 (пакет «П5 Производственный контур»): закрытая работа не
 * порождает дел, писем и ходов. Службы вызываются напрямую, в обход
 * экранов: правило должно держаться на сервере.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('производственный контур (П5)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');

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
  const outbox = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.count({ where: { userId, eventKind } });
  const setStatus = (status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED') =>
    prisma.project.update({ where: { id: ids.project }, data: { status } });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `pl-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, clientUser, curatorUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('cur', 'EXPERT'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `pl клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `pl-${stamp}`, name: 'Проверка контура' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-PL-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки контура',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 1', state: 'IN_PROGRESS' },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  beforeEach(async () => {
    await setStatus('ACTIVE');
  });

  after(async () => {
    const users = [ids.manager!, ids.clientUser!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: ids.project }, { userId: { in: users } }] } });
    const stages = await prisma.stage.findMany({ where: { projectId: ids.project }, select: { id: true } });
    await prisma.stageStateChange.deleteMany({ where: { stageId: { in: stages.map((row) => row.id) } } });
    await prisma.versionComment.deleteMany({ where: { version: { material: { projectId: ids.project } } } });
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

  it('сдачу этапа закрытой работы куратору не возвращают: ни возврата, ни письма (Р-523)', async () => {
    const handedOverAt = new Date();
    await prisma.stage.update({
      where: { id: ids.stage },
      data: { state: 'IN_PROGRESS', handedOverAt, handoverNote: 'Глава готова', handbackAt: null, handbackReason: null },
    });
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      await setStatus(status);
      const letters = await outbox(ids.curator!, 'CURATOR_TURN');
      await assert.rejects(handover.handBackStage(manager(), ids.stage!, 'Добавьте выводы'), /Работа закрыта/u);
      const row = await prisma.stage.findUniqueOrThrow({ where: { id: ids.stage } });
      assert.equal(row.handedOverAt?.getTime(), handedOverAt.getTime(), `сдача снята у работы ${status}`);
      assert.equal(row.handbackAt, null);
      assert.equal(await outbox(ids.curator!, 'CURATOR_TURN'), letters, `куратору ушло письмо по работе ${status}`);
    }
    // У действующей работы возврат проходит, как прежде.
    await setStatus('ACTIVE');
    await handover.handBackStage(manager(), ids.stage!, 'Добавьте выводы');
    const row = await prisma.stage.findUniqueOrThrow({ where: { id: ids.stage } });
    assert.equal(row.handedOverAt, null);
    assert.equal(row.handbackReason, 'Добавьте выводы');
  });

  it('замечание куратора, ждущее публикации, не становится делом по закрытой работе (Р-525)', async () => {
    const material = await prisma.material.create({
      data: {
        projectId: ids.project!,
        stageId: ids.stage!,
        title: 'Глава 1 — черновик',
        createdById: ids.curator!,
        versions: {
          create: {
            number: 1,
            storageKey: `production-loop/${stamp}/comment`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'c'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: ids.curator!,
          },
        },
      },
      include: { versions: true },
    });
    await prisma.versionComment.create({
      data: { versionId: material.versions[0]!.id, authorId: ids.curator!, body: 'Проверить таблицу 2' },
    });
    const mine = async () => (await materials.pendingComments(manager())).filter((row) => row.stageId === ids.stage);

    assert.equal((await mine()).length, 1, 'у действующей работы дело есть');
    await setStatus('PAUSED');
    assert.equal((await mine()).length, 1, 'у приостановленной работы дело есть');
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      await setStatus(status);
      assert.deepEqual(await mine(), [], `дело по работе ${status}: разобрать его нельзя`);
    }
    await setStatus('ACTIVE');
    await prisma.material.update({ where: { id: material.id }, data: { deletedAt: new Date() } });
    assert.deepEqual(await mine(), [], 'дело по удалённому материалу');
  });
});
