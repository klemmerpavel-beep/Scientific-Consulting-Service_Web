/**
 * Состав плана работ (требование М-11, решение Р-303): перестановка,
 * удаление не начатого этапа без материалов, шаблон к пустому плану,
 * возврат завершённого этапа в работу с причиной, только у действующей
 * работы.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'p'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('состав плана работ', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');

  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const curator = () => who(ids.manager!, 'MANAGER');

  const newProject = async (suffix: string, titles: readonly string[]) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-PE-${String(stamp).slice(-6)}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
      },
    });
    projectIds.push(project.id);
    for (const [index, title] of titles.entries()) {
      await prisma.stage.create({ data: { projectId: project.id, position: index + 1, title } });
    }
    return project.id;
  };
  const plan = async (projectId: string) =>
    (await prisma.stage.findMany({ where: { projectId }, orderBy: { position: 'asc' } })).map(
      (stage) => `${stage.position}:${stage.title}`,
    );

  before(async () => {
    const [manager, head, clientUser] = await Promise.all([
      prisma.user.create({ data: { email: `pe-mgr-${stamp}@example.org`, fullName: 'Куратор плана', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `pe-head-${stamp}@example.org`, fullName: 'Руководитель плана', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `pe-cl-${stamp}@example.org`, fullName: 'Клиент плана', role: 'CLIENT' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент плана', normalizedName: `pe клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `pe-${stamp}`, name: 'Проверка плана' } });
    await prisma.stageTemplate.createMany({
      data: [
        { serviceTypeId: type.id, position: 1, title: 'Постановка задачи', durationDays: 10 },
        { serviceTypeId: type.id, position: 2, title: 'Обзор литературы', durationDays: 20 },
      ],
    });
    Object.assign(ids, { manager: manager.id, head: head.id, clientUser: clientUser.id, client: profile.id, type: type.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: { in: projectIds } } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.stageTemplate.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.manager!, ids.head!, ids.clientUser!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('перестановка — две позиции за раз; крайние — отказ', async () => {
    const projectId = await newProject('M', ['А', 'Б', 'В']);
    const [first, second] = await prisma.stage.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
    await assert.rejects(projects.moveStage(curator(), first!.id, 'up'), /и так первый/u);
    await projects.moveStage(curator(), second!.id, 'up');
    assert.deepEqual(await plan(projectId), ['1:Б', '2:А', '3:В']);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId, kind: 'PLAN_CHANGED' } });
    assert.deepEqual(event.payload, { action: 'moved', stageId: second!.id, title: 'Б', from: 2, to: 1 });
  });

  it('удаление: только не начатый без материалов; позиции уплотняются', async () => {
    const projectId = await newProject('D', ['А', 'Б', 'В', 'Г']);
    const rows = await prisma.stage.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
    await prisma.stage.update({ where: { id: rows[0]!.id }, data: { state: 'IN_PROGRESS' } });
    await prisma.material.create({
      data: { projectId, stageId: rows[2]!.id, title: 'Черновик', createdById: ids.manager!, deletedAt: new Date() },
    });
    await assert.rejects(projects.removeStage(curator(), rows[0]!.id), /не начатый/u);
    await assert.rejects(projects.removeStage(curator(), rows[2]!.id), /есть материалы/u);
    await projects.removeStage(curator(), rows[1]!.id);
    assert.deepEqual(await plan(projectId), ['1:А', '2:В', '3:Г']);
  });

  it('шаблон — только к пустому плану', async () => {
    const full = await newProject('F', ['А']);
    await assert.rejects(projects.applyStageTemplate(curator(), full), /только к пустому плану/u);
    const empty = await newProject('E', []);
    assert.equal(await projects.templateLength(curator(), empty), 2);
    await projects.applyStageTemplate(curator(), empty);
    assert.deepEqual(await plan(empty), ['1:Постановка задачи', '2:Обзор литературы']);
  });

  it('возврат завершённого этапа — с причиной, письма клиенту и руководителю', async () => {
    const projectId = await newProject('R', ['А']);
    const stage = await prisma.stage.findFirstOrThrow({ where: { projectId } });
    await prisma.stage.update({
      where: { id: stage.id },
      data: { state: 'DONE', completedAt: new Date(), approvalDueOn: new Date('2026-09-28T00:00:00Z') },
    });
    await assert.rejects(projects.setStageState(curator(), stage.id, 'IN_PROGRESS'), /отдельным действием/u);
    await assert.rejects(projects.reopenStage(curator(), { stageId: stage.id, reason: '  ' }), /с причиной/u);
    await projects.reopenStage(curator(), { stageId: stage.id, reason: 'Рецензент вернул главу' });
    const reopened = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(reopened.state, 'IN_PROGRESS');
    assert.equal(reopened.completedAt, null);
    assert.equal(reopened.approvalDueOn, null);
    const letters = await prisma.notificationOutbox.findMany({
      where: { projectId, eventKind: 'STAGE_REOPENED', channel: 'EMAIL' },
      select: { userId: true, body: true },
    });
    assert.ok(letters.some((row) => row.userId === ids.clientUser), 'клиент не узнал о возврате');
    assert.ok(letters.some((row) => row.userId === ids.head), 'руководитель не узнал о возврате');
    assert.ok(letters.every((row) => /Причина: Рецензент вернул главу/u.test(row.body)));
  });

  it('у работы не в действии план не меняется', async () => {
    const projectId = await newProject('P', ['А', 'Б']);
    await prisma.project.update({ where: { id: projectId }, data: { status: 'PAUSED' } });
    const second = await prisma.stage.findFirstOrThrow({ where: { projectId, position: 2 } });
    await assert.rejects(projects.moveStage(curator(), second.id, 'up'), /не в действии/u);
    await assert.rejects(projects.removeStage(curator(), second.id), /не в действии/u);
  });
});
