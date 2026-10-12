/**
 * «Что подготовить» на настоящей базе (решение Р-564): приложенный клиентом
 * файл отмечает пункт и становится материалом с его названием; материал
 * куратора, ждущий публикации, клиенту пункт не отмечает; после
 * согласования первого этапа приложить нельзя; чужой работе — `null`.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('что подготовить по работе', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { prepareView } = await import('../src/lib/cabinet/prepare.ts');
  const { uploadVersion } = await import('../src/lib/cabinet/materials.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  let createdType = false;
  let root = '';

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');
  const curator = () => who(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date() });
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });

  const file = (title: string, actor: Actor, projectId: string, materialId: string | null = null) =>
    uploadVersion(actor, {
      projectId,
      stageId: null,
      materialId,
      title,
      originalName: 'файл.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from(`${title} ${Math.random()}`),
    });

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pd-prepare-'));
    setStorage(new LocalStorage(root));
    const user = (key: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `pp-${key}-${stamp}@example.org`, fullName: `Сотрудник ${key}`, role } });
    ids.manager = (await user('mgr', 'MANAGER')).id;
    ids.stranger = (await user('str', 'MANAGER')).id;
    ids.expert = (await user('exp', 'EXPERT')).id;
    ids.clientUser = (await user('cli', 'CLIENT')).id;
    const existing = await prisma.serviceType.findUnique({ where: { code: 'diploma' } });
    if (existing === null) {
      ids.type = (await prisma.serviceType.create({ data: { code: 'diploma', name: 'Сопровождение ВКР' } })).id;
      createdType = true;
    } else {
      ids.type = existing.id;
    }
    ids.client = (
      await prisma.clientProfile.create({ data: { fullName: 'Клиент перечня', normalizedName: `pp клиент ${stamp}`, userId: ids.clientUser } })
    ).id;
    const project = await prisma.project.create({
      data: {
        code: `PD-PP-${tail}`,
        clientId: ids.client,
        serviceTypeId: ids.type,
        title: 'Работа с перечнем',
        managerId: ids.manager,
        expertId: ids.expert,
        status: 'ACTIVE',
      },
    });
    projectIds.push(project.id);
    ids.project = project.id;
    ids.code = project.code;
    ids.stage = (await prisma.stage.create({ data: { projectId: project.id, position: 1, title: 'Первая глава', state: 'IN_PROGRESS' } })).id;
  });

  after(async () => {
    setStorage(null);
    if (root !== '') await rm(root, { recursive: true, force: true });
    const materials = (await prisma.material.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((m) => m.id);
    const versions = (await prisma.materialVersion.findMany({ where: { materialId: { in: materials } }, select: { id: true } })).map((v) => v.id);
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versions } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versions } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versions } } });
    await prisma.material.deleteMany({ where: { id: { in: materials } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    if (createdType) await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.stranger!, ids.expert!, ids.clientUser!] } } });
  });

  it('клиенту — перечень вида работы, ничего не приложено, «Приложить» доступно; сотруднику — без загрузки', async () => {
    const view = await prepareView(client(), ids.code!);
    assert.ok(view !== null);
    assert.equal(view.list?.code, 'diploma');
    assert.equal(view.done, 0);
    assert.equal(view.total, view.rows.length);
    assert.equal(view.mayAttach, true);
    assert.equal((await prepareView(manager(), ids.code!))?.mayAttach, false);
    assert.equal(await prepareView(stranger(), ids.code!), null, 'чужая работа не видна');
  });

  it('приложенный файл отмечает пункт; повторное «Приложить» — новая версия того же материала', async () => {
    await file('Методические указания кафедры', client(), ids.project!);
    const view = (await prepareView(client(), ids.code!))!;
    const row = view.rows.find((item) => item.key === 'guidelines')!;
    assert.equal(row.attached, true);
    assert.ok(row.materialId !== null);
    assert.equal(view.done, 1);
    await file('Методические указания кафедры', client(), ids.project!, row.materialId);
    const versions = await prisma.materialVersion.count({ where: { materialId: row.materialId! } });
    assert.equal(versions, 2);
    assert.equal((await prepareView(manager(), ids.code!))?.done, 1, 'менеджер видит тот же счёт');
  });

  it('материал куратора до публикации клиенту пункт не отмечает', async () => {
    await file('Замечания научного руководителя', curator(), ids.project!);
    const forClient = (await prepareView(client(), ids.code!))!;
    assert.equal(forClient.rows.find((item) => item.key === 'supervisor')!.attached, false);
    const forManager = (await prepareView(manager(), ids.code!))!;
    assert.equal(forManager.rows.find((item) => item.key === 'supervisor')!.attached, true);
  });

  it('после согласования первого этапа приложить нельзя', async () => {
    await prisma.stage.update({ where: { id: ids.stage! }, data: { state: 'DONE' } });
    const view = (await prepareView(client(), ids.code!))!;
    assert.equal(view.open, false);
    assert.equal(view.mayAttach, false);
  });
});
