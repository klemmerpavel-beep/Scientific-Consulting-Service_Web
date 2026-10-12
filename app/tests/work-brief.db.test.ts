/**
 * «Обновить из документа» на настоящей базе (решение Р-561): права,
 * закрытая работа, вариант темы, карточка клиента дополняется только в
 * пустом, документ ложится на этап, журнал пишет выбор.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-wbrief-'));

const enabled = Boolean(process.env.DATABASE_URL);

describe('обновить карточку из документа', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const intake = await import('../src/lib/cabinet/brief/intake.ts');
  const work = await import('../src/lib/cabinet/brief/work-apply.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({ id, role, status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');

  const doc = makeDocx([
    'Вариант 1. Первая тема',
    'Цель работы: Первая цель.',
    'Вариант 2. Вторая тема',
    'Цель работы: Вторая цель.',
    'Университет - Вуз из документа',
    'НАПРАВЛЕНИЕ - 38.04.01 Экономика',
  ]);

  const newProject = async (suffix: string, status = 'ACTIVE') => {
    const project = await prisma.project.create({
      data: {
        code: `PD-WB-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        topic: 'Прежняя тема',
        managerId: ids.manager!,
        status: status as never,
        stages: { create: [{ position: 1, title: 'Исходные данные', state: 'IN_PROGRESS' }, { position: 2, title: 'Глава 1', state: 'NOT_STARTED' }] },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    projects.push(project.id);
    return project;
  };

  before(async () => {
    ids.manager = (await prisma.user.create({ data: { email: `wb-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' } })).id;
    ids.stranger = (await prisma.user.create({ data: { email: `wb-str-${stamp}@example.org`, fullName: 'Чужой', role: 'MANAGER' } })).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `wb-${stamp}`, name: 'Вид для документа' } })).id;
    ids.client = (
      await prisma.clientProfile.create({ data: { fullName: 'Клиент Документа', normalizedName: `wb клиент ${stamp}`, speciality: 'Уже заполнено' } })
    ).id;
  });

  after(async () => {
    const materials = await prisma.material.findMany({ where: { projectId: { in: projects } }, select: { id: true } });
    const versions = await prisma.materialVersion.findMany({ where: { materialId: { in: materials.map((m) => m.id) } }, select: { id: true } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versions.map((v) => v.id) } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.materialVersion.deleteMany({ where: { materialId: { in: materials.map((m) => m.id) } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.stranger!] } } });
  });

  it('несколько вариантов — без выбора отказ; с выбором — тема и суть варианта, вуз дополнен, направление не тронуто', async () => {
    const project = await newProject('A');
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Исходные.docx', doc);
    await assert.rejects(
      work.applyWorkBrief(manager(), { projectId: project.id, ref, variant: null, apply: ['topic'], stageId: null }),
      /выберите тот, который выбрал клиент/u,
    );
    const result = await work.applyWorkBrief(manager(), {
      projectId: project.id,
      ref,
      variant: 1,
      apply: ['topic', 'summary', 'university', 'speciality'],
      stageId: project.stages[0]!.id,
    });
    assert.deepEqual(result.applied.sort(), ['summary', 'topic', 'university']);
    assert.equal(result.attached, true);
    const saved = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { topic: true, summary: true, client: { select: { university: true, speciality: true } } },
    });
    assert.equal(saved.topic, 'Вторая тема');
    assert.equal(saved.summary, 'Цель: Вторая цель.');
    assert.equal(saved.client.university, 'Вуз из документа');
    assert.equal(saved.client.speciality, 'Уже заполнено', 'заполненное у клиента не затирается');
    const material = await prisma.material.findFirstOrThrow({ where: { projectId: project.id }, select: { title: true, stageId: true } });
    assert.deepEqual(material, { title: 'Исходные данные работы', stageId: project.stages[0]!.id });
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { projectId: project.id, action: 'BRIEF_APPLIED' } });
    assert.equal((journal.payload as { variant: string }).variant, 'Вариант 2. Вторая тема');
  });

  it('чужой менеджер и закрытая работа — отказ', async () => {
    const project = await newProject('B');
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Исходные.docx', doc);
    await assert.rejects(
      work.applyWorkBrief(stranger(), { projectId: project.id, ref, variant: 0, apply: ['topic'], stageId: null }),
      /не найдена/u,
    );
    const closed = await newProject('C', 'COMPLETED');
    await assert.rejects(work.applyWorkBrief(manager(), { projectId: closed.id, ref, variant: 0, apply: ['topic'], stageId: null }));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: closed.id } })).topic, 'Прежняя тема');
  });

  it('закрытый этап — отказ с причиной', async () => {
    const project = await newProject('D');
    await prisma.stage.update({ where: { id: project.stages[1]!.id }, data: { state: 'DONE' } });
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Исходные.docx', doc);
    await assert.rejects(
      work.applyWorkBrief(manager(), { projectId: project.id, ref, variant: 0, apply: [], stageId: project.stages[1]!.id }),
      /Этап закрыт/u,
    );
  });
});
