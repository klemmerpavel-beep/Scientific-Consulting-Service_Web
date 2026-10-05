/**
 * Ход за куратором на настоящей базе (требование Э-04, решение Р-329):
 * этап «Не начат» дела не даёт; этап «В работе» — даёт, сдача его
 * закрывает; отклонённая версия — дело до новой версии того же материала;
 * дела берутся только по своим работам; приостановленная работа дела
 * сохраняет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-ct-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('ход за куратором (Э-04)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { curatorTasksData } = await import('../src/lib/cabinet/queries.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const curator = () => who(ids.curator!, 'EXPERT');
  const manager = () => who(ids.manager!, 'MANAGER');
  const tasks = () => curatorTasksData(curator());
  const upload = (materialId: string | null) =>
    materials.uploadVersion(curator(), {
      projectId: ids.project!,
      stageId: ids.started!,
      materialId,
      title: materialId === null ? 'Глава 3' : undefined,
      originalName: 'glava3.docx',
      contentType: 'application/octet-stream',
      body: Buffer.from('глава 3'),
    });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `ct-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, clientUser, curatorUser, otherUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('cur', 'EXPERT'),
      make('oth', 'EXPERT'),
    ]);
    await prisma.expertProfile.createMany({
      data: [
        { userId: curatorUser.id, ndaSignedAt: NDA },
        { userId: otherUser.id, ndaSignedAt: NDA },
      ],
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `ct клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `ct-${stamp}`, name: 'Проверка хода' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CT-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки хода',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    // Чужая работа: её этап «В работе» делом куратора не является.
    const foreign = await prisma.project.create({
      data: {
        code: `PD-CF-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Чужая работа',
        managerId: managerUser.id,
        expertId: otherUser.id,
      },
    });
    const [notStarted, started] = await Promise.all([
      prisma.stage.create({ data: { projectId: project.id, position: 1, title: 'Обзор', state: 'NOT_STARTED' } }),
      prisma.stage.create({
        data: { projectId: project.id, position: 2, title: 'Глава 3', state: 'IN_PROGRESS', dueOn: new Date(Date.UTC(2026, 11, 1)) },
      }),
      prisma.stage.create({ data: { projectId: foreign.id, position: 1, title: 'Чужой этап', state: 'IN_PROGRESS' } }),
    ]);
    Object.assign(ids, {
      manager: managerUser.id,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      other: otherUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      foreign: foreign.id,
      notStarted: notStarted.id,
      started: started.id,
    });
  });

  after(async () => {
    const projects = [ids.project!, ids.foreign!];
    const users = [ids.manager!, ids.clientUser!, ids.curator!, ids.other!];
    const versions = await prisma.materialVersion.findMany({
      where: { material: { projectId: { in: projects } } },
      select: { id: true },
    });
    const versionIds = versions.map((version) => version.id);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { userId: { in: users } }] } });
    await prisma.versionComment.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('«Не начат» дела не даёт; «В работе» — даёт; чужая работа — нет', async () => {
    const found = await tasks();
    assert.deepEqual(
      found.map((task) => task.href),
      [`/cabinet/stages/${ids.started}`],
    );
    assert.equal(found[0]!.label, 'Этап «Глава 3» в работе');
  });

  it('отклонённая версия — дело до новой версии того же материала', async () => {
    const first = await upload(null);
    await materials.moderateVersion(manager(), first.id, 'REJECTED', 'Нет выводов');
    const withRejected = await tasks();
    assert.ok(withRejected.some((task) => task.kind === 'VERSION_REJECTED' && /v1: «Глава 3»/u.test(task.label)));
    const material = await prisma.materialVersion.findUniqueOrThrow({ where: { id: first.id }, select: { materialId: true } });
    await upload(material.materialId);
    assert.ok(!(await tasks()).some((task) => task.kind === 'VERSION_REJECTED'), 'новая версия не закрыла дело');
  });

  it('сдача этапа закрывает дело; приостановленная работа дела сохраняет', async () => {
    await prisma.project.update({ where: { id: ids.project }, data: { status: 'PAUSED' } });
    assert.equal((await tasks()).length, 1, 'приостановленная работа потеряла дело');
    await prisma.project.update({ where: { id: ids.project }, data: { status: 'ACTIVE' } });
    await handover.handOverStage(curator(), ids.started!, 'Глава 3 готова');
    assert.deepEqual(await tasks(), []);
  });

  it('менеджеру дела куратора не собираются', async () => {
    assert.deepEqual(await curatorTasksData(manager()), []);
  });
});
