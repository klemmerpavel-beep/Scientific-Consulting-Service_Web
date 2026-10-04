/**
 * Материал с пояснением одной операцией (требование Э-06, решение Р-326):
 * пояснение длиннее предела не оставляет ни материала, ни версии, ни
 * объекта в хранилище; пояснение сохраняется замечанием к той же версии,
 * ждущим публикации; в завершённый этап и в закрытую работу загрузки нет,
 * в приостановленную — есть; день публикации версии видит куратор, но не
 * клиент.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'u'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-un-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

/** Число файлов в хранилище — объект версии ложится файлом. */
function storedFiles(dir = process.env.CABINET_STORAGE_DIR!): number {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (sum, entry) => sum + (entry.isDirectory() ? storedFiles(path.join(dir, entry.name)) : 1),
    0,
  );
}

describe('материал с пояснением одной операцией (Э-06)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const { COMMENT_MAX } = materials;
  const { projectMaterials, stageById } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });

  const upload = (stageId: string | null, note: string, title = 'Глава 2, редакция куратора') =>
    materials.uploadVersion(curator(), {
      projectId: ids.project!,
      stageId,
      materialId: null,
      title,
      note,
      originalName: 'glava2.docx',
      contentType: 'application/octet-stream',
      body: Buffer.from('глава 2'),
    });
  const counts = async () => ({
    materials: await prisma.material.count({ where: { projectId: ids.project } }),
    versions: await prisma.materialVersion.count({ where: { material: { projectId: ids.project } } }),
    comments: await prisma.versionComment.count({ where: { version: { material: { projectId: ids.project } } } }),
    files: storedFiles(),
  });
  const setStatus = (status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED') =>
    prisma.project.update({ where: { id: ids.project }, data: { status } });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `un-${suffix}-${stamp}@example.org`, fullName, role } });
    const [managerUser, clientUser, curatorUser] = await Promise.all([
      make('mgr', 'MANAGER', 'Менеджер Загрузки'),
      make('cl', 'CLIENT', 'Клиент Загрузки'),
      make('cur', 'EXPERT', 'Куратор Загрузки'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: new Date() } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Загрузки', normalizedName: `un клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `un-${stamp}`, name: 'Проверка загрузки' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-UN-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки загрузки',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    const [open, done] = await Promise.all([
      prisma.stage.create({ data: { projectId: project.id, position: 1, title: 'Глава 2', state: 'IN_PROGRESS' } }),
      prisma.stage.create({ data: { projectId: project.id, position: 2, title: 'Обзор', state: 'DONE' } }),
    ]);
    Object.assign(ids, {
      manager: managerUser.id,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
      open: open.id,
      done: done.id,
    });
  });

  after(async () => {
    const versions = await prisma.materialVersion.findMany({
      where: { material: { projectId: ids.project } },
      select: { id: true },
    });
    const versionIds = versions.map((version) => version.id);
    await prisma.versionComment.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.manager!, ids.clientUser!, ids.curator!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('пояснение длиннее предела: ни материала, ни версии, ни объекта в хранилище', async () => {
    const before = await counts();
    await assert.rejects(upload(ids.open!, 'я'.repeat(COMMENT_MAX + 1)), /Пояснение длиннее/u);
    assert.deepEqual(await counts(), before);
  });

  it('пояснение — замечанием к той же версии, ждущим публикации; версия тоже ждёт', async () => {
    const before = await counts();
    const version = await upload(ids.open!, '  Переписан раздел 2.3; смотреть таблицу 4  ');
    const after = await counts();
    assert.equal(after.materials, before.materials + 1);
    assert.equal(after.versions, before.versions + 1);
    assert.equal(after.files, before.files + 1);
    const [comment, ...rest] = await prisma.versionComment.findMany({ where: { versionId: version.id } });
    assert.equal(rest.length, 0);
    assert.equal(comment?.body, 'Переписан раздел 2.3; смотреть таблицу 4');
    assert.equal(comment?.moderationStatus, 'PENDING');
    const moderation = await prisma.versionModeration.findUniqueOrThrow({ where: { versionId: version.id } });
    assert.equal(moderation.status, 'PENDING');
    const journal = await prisma.auditEvent.count({
      where: { action: 'COMMENT_CREATED', objectId: comment!.id, projectId: ids.project },
    });
    assert.equal(journal, 1, 'замечание из пояснения не записано в журнал');
    ids.version = version.id;
  });

  it('без пояснения — версия без замечания', async () => {
    const version = await upload(null, '   ', 'Список литературы');
    assert.equal(await prisma.versionComment.count({ where: { versionId: version.id } }), 0);
  });

  it('завершённый этап, завершённая и отменённая работа — отказ, ничего не сохранено', async () => {
    const before = await counts();
    await assert.rejects(upload(ids.done!, 'Дополнение к обзору'), /Этап завершён/u);
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      await setStatus(status);
      await assert.rejects(upload(ids.open!, 'Глава после закрытия'), /Работа закрыта/u);
    }
    await setStatus('ACTIVE');
    assert.deepEqual(await counts(), before);
  });

  it('в приостановленной работе загрузка проходит', async () => {
    await setStatus('PAUSED');
    const version = await upload(ids.open!, 'Глава в паузе');
    assert.ok(version.id);
    await setStatus('ACTIVE');
  });

  it('день публикации версии видит куратор, клиенту он не отдаётся', async () => {
    await materials.moderateVersion(manager(), ids.version!, 'PUBLISHED');
    const own = await projectMaterials(curator(), ids.code!);
    const seen = own!.materials.flatMap((material) => material.versions).find((v) => v.id === ids.version);
    assert.equal(seen?.moderation?.status, 'PUBLISHED');
    assert.ok(seen?.moderation?.decidedAt instanceof Date, 'куратору не отдан день публикации');
    const forClient = await stageById(client(), ids.open!);
    const text = JSON.stringify(forClient, (_key, value) => (typeof value === 'bigint' ? String(value) : value));
    assert.ok(text.includes(ids.version!), 'опубликованная версия не видна клиенту');
    assert.ok(!text.includes('"decidedAt"'), 'клиенту отдан день решения о публикации');
  });
});
