/**
 * Версия эксперта — после публикации куратором (требование Т-18, решение
 * Р-294): не видна клиенту в выборках и по прямой ссылке, письмо и строка
 * истории — при публикации, пояснение эксперта — вместе с версией,
 * согласование без опубликованной версии — отказ, «не публиковать» — с
 * причиной, в закрытой работе разбора нет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'v'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-vm-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('версия эксперта — после публикации', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { stageById } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
    ...extra,
  });
  const curator = () => who(ids.manager!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const expert = () => who(ids.expert!, 'EXPERT');

  const upload = (materialId: string | null = null) =>
    materials.uploadVersion(expert(), {
      projectId: ids.project!,
      stageId: ids.stage!,
      materialId,
      title: materialId === null ? 'Глава 3, черновик эксперта' : undefined,
      originalName: 'glava3.docx',
      contentType: 'application/octet-stream',
      body: Buffer.from('глава 3'),
    });
  const clientSees = async (versionId: string) => {
    const stage = await stageById(client(), ids.stage!);
    return (stage?.materials ?? []).some((material) => material.versions.some((v) => v.id === versionId));
  };

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `vm-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [manager, clientUser, expertUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('exp', 'EXPERT'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `vm клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `vm-${stamp}`, name: 'Проверка публикации версий' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-VM-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки публикации',
        managerId: manager.id,
        expertId: expertUser.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 3', state: 'IN_PROGRESS' },
    });
    Object.assign(ids, {
      manager: manager.id,
      clientUser: clientUser.id,
      expert: expertUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
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
    await prisma.stageStateChange.deleteMany({ where: { stageId: ids.stage } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.manager!, ids.clientUser!, ids.expert!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('версия эксперта ждёт публикации: клиенту не видна ни в выборке, ни по ссылке', async () => {
    const version = await upload();
    ids.material = version.materialId;
    ids.version = version.id;
    const moderation = await prisma.versionModeration.findUniqueOrThrow({ where: { versionId: version.id } });
    assert.equal(moderation.status, 'PENDING');

    assert.equal(await clientSees(version.id), false, 'клиент видит версию до публикации');
    assert.equal(await materials.readVersion(client(), version.id), null, 'прямое скачивание прошло');
    const own = await stageById(expert(), ids.stage!);
    assert.ok(own?.materials.some((material) => material.versions.some((v) => v.id === version.id)));

    // Клиенту ни письма, ни строки истории; куратору — письмо с пометкой.
    assert.equal(
      await prisma.notificationOutbox.count({ where: { projectId: ids.project, userId: ids.clientUser } }),
      0,
    );
    assert.equal(
      await prisma.projectEvent.count({ where: { projectId: ids.project, kind: 'VERSION_UPLOADED' } }),
      0,
    );
    const toCurator = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: ids.manager, eventKind: 'VERSION_UPLOADED', channel: 'EMAIL' },
    });
    assert.match(toCurator.body, /ждёт публикации/u);

    // Замечание клиента к невидимой версии не принимается.
    await assert.rejects(materials.addComment(client(), version.id, 'Что это?'), /Версия не найдена/u);
  });

  it('без опубликованной версии этап на согласование не уходит', async () => {
    await assert.rejects(
      projects.setStageState(curator(), ids.stage!, 'IN_APPROVAL', 'Глава готова'),
      /который видит клиент/u,
    );
  });

  it('пояснение эксперта к версии публикуется вместе с ней; отдельно — нет', async () => {
    const clean = await materials.addComment(expert(), ids.version!, 'Добавлен раздел 3.2 с расчётом');
    const withContact = await materials.addComment(expert(), ids.version!, 'Пишите мне: +7 900 000-00-00');
    await assert.rejects(
      materials.moderateComment(curator(), clean.id, 'PUBLISHED'),
      /публикуется вместе с версией/u,
    );

    await materials.moderateVersion(curator(), ids.version!, 'PUBLISHED');
    assert.equal(await clientSees(ids.version!), true);
    assert.ok((await materials.readVersion(client(), ids.version!)) !== null);
    const notes = await prisma.versionComment.findMany({
      where: { id: { in: [clean.id, withContact.id] } },
      select: { id: true, moderationStatus: true },
    });
    assert.equal(notes.find((note) => note.id === clean.id)?.moderationStatus, 'PUBLISHED');
    assert.equal(notes.find((note) => note.id === withContact.id)?.moderationStatus, 'PENDING');

    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId: ids.project, kind: 'VERSION_UPLOADED' },
    });
    assert.equal(event.actorId, ids.expert, 'автор события — эксперт');
    assert.ok(
      (await prisma.notificationOutbox.count({
        where: { projectId: ids.project, userId: ids.clientUser, eventKind: 'VERSION_UPLOADED' },
      })) >= 1,
      'клиент не получил письма при публикации',
    );
    await assert.rejects(materials.moderateVersion(curator(), ids.version!, 'REJECTED'), /уже разобрана/u);

    // Теперь этап уходит на согласование.
    await projects.setStageState(curator(), ids.stage!, 'IN_APPROVAL', 'Глава готова');
    await projects.setStageState(curator(), ids.stage!, 'IN_PROGRESS');
  });

  it('«Не публиковать» — с причиной для эксперта; клиент версию не видит', async () => {
    const next = await upload(ids.material!);
    await assert.rejects(materials.moderateVersion(client(), next.id, 'PUBLISHED'), /не разрешено/u);
    await materials.moderateVersion(curator(), next.id, 'REJECTED', 'Нет списка литературы');
    const row = await prisma.versionModeration.findUniqueOrThrow({ where: { versionId: next.id } });
    assert.equal(row.status, 'REJECTED');
    assert.equal(row.note, 'Нет списка литературы');
    assert.equal(await clientSees(next.id), false);
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { objectId: next.id, action: 'VERSION_REJECTED' } });
    assert.equal(journal.actorId, ids.manager);
  });

  it('в закрытой работе версий не разбирают', async () => {
    const last = await upload(ids.material!);
    await projects.setProjectStatus(curator(), ids.project!, 'COMPLETED');
    await assert.rejects(materials.moderateVersion(curator(), last.id, 'PUBLISHED'), /возобновите её/u);
    await projects.setProjectStatus(curator(), ids.project!, 'ACTIVE');
  });
});
