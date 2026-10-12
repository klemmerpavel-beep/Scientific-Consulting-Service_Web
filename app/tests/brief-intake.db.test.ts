/**
 * Документ на «Новом заказе» на настоящей базе (решение Р-556): временный
 * объект под ключом сотрудника, чужой ключ не открывается, заказ получает
 * суть задачи и вуз, документ переезжает в материалы работы.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 'b'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-brief-'));

const enabled = Boolean(process.env.DATABASE_URL);

describe('документ на новом заказе', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const intake = await import('../src/lib/cabinet/brief/intake.ts');
  const { BriefError } = await import('../src/lib/cabinet/brief/read.ts');
  const { orderDraftFromBrief } = await import('../src/lib/cabinet/brief/order-draft.ts');
  const { createManualOrder } = await import('../src/lib/cabinet/manual-order.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({ id, role, status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const manager = () => who(ids.manager!, 'MANAGER');
  const other = () => who(ids.other!, 'MANAGER');

  const doc = makeDocx([
    'Анкета для заявки',
    {
      table: [
        ['ФИО заказчика', `Документов Клиент ${stamp}`],
        ['Вид работы', 'Вид для документа'],
        ['Тема', 'Тема из анкеты'],
        ['Цель работы', 'Цель из анкеты.'],
        ['ФИО научного руководителя', 'Руководителев Р. Р.'],
        ['Вуз или организация', 'Университет из анкеты'],
        ['Направление или научная специальность', '15.04.02 Машины'],
      ],
    },
  ]);

  before(async () => {
    ids.manager = (await prisma.user.create({ data: { email: `brief-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' } })).id;
    ids.other = (await prisma.user.create({ data: { email: `brief-oth-${stamp}@example.org`, fullName: 'Другой', role: 'MANAGER' } })).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `brief-${stamp}`, name: 'Вид для документа' } })).id;
  });

  after(async () => {
    const clients = await prisma.project.findMany({ where: { id: { in: projects } }, select: { clientId: true } });
    const materials = await prisma.material.findMany({ where: { projectId: { in: projects } }, select: { id: true } });
    const versions = await prisma.materialVersion.findMany({ where: { materialId: { in: materials.map((m) => m.id) } }, select: { id: true } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versions.map((v) => v.id) } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.materialVersion.deleteMany({ where: { materialId: { in: materials.map((m) => m.id) } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients.map((c) => c.clientId) } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.other!] } } });
  });

  it('документ кладётся под ключом загрузившего; чужой ключ не открывается', async () => {
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Анкета.docx', doc);
    assert.match(ref, /^[0-9a-f-]{36}\.docx$/u);
    const loaded = await intake.loadBrief(manager(), 'REQUEST_MODERATE', ref);
    assert.equal(loaded?.brief.fields.topic, 'Тема из анкеты');
    assert.equal(await intake.loadBrief(other(), 'REQUEST_MODERATE', ref), null, 'чужой менеджер документ не видит');
    assert.equal(await intake.loadBrief(manager(), 'REQUEST_MODERATE', '../../etc/passwd'), null);
    assert.ok(existsSync(path.join(process.env.CABINET_STORAGE_DIR!, 'briefs', ids.manager!, ref)));
  });

  it('не документ и исполняемый файл — отказ с причиной', async () => {
    await assert.rejects(intake.stageBrief(manager(), 'REQUEST_MODERATE', 'a.docx', Buffer.from('текст')), BriefError);
    await assert.rejects(
      intake.stageBrief(manager(), 'REQUEST_MODERATE', 'setup.exe', Buffer.from('MZ\x90\x00 не документ')),
      /исполняемые файлы/u,
    );
  });

  it('заказ из документа: суть задачи, вуз и направление; документ — в материалах, временный объект убран', async () => {
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Анкета.docx', doc);
    const loaded = (await intake.loadBrief(manager(), 'REQUEST_MODERATE', ref))!;
    const types = await prisma.serviceType.findMany({ where: { id: ids.type }, select: { id: true, code: true, name: true } });
    const { values } = orderDraftFromBrief(loaded.brief, types);
    assert.equal(values.serviceTypeId, ids.type);
    const created = await createManualOrder(manager(), {
      customer: values.customer!,
      serviceTypeId: values.serviceTypeId!,
      title: values.title!,
      topic: values.topic,
      summary: values.summary,
      university: values.university,
      speciality: values.speciality,
    });
    projects.push(created.projectId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: created.projectId },
      select: { summary: true, topic: true, client: { select: { university: true, speciality: true } } },
    });
    assert.equal(project.topic, 'Тема из анкеты');
    assert.equal(project.summary, 'Цель: Цель из анкеты.\nНаучный руководитель: Руководителев Р. Р.');
    assert.equal(project.client.university, 'Университет из анкеты');
    assert.equal(project.client.speciality, '15.04.02 Машины');

    assert.equal(await intake.attachBrief(manager(), ref, { projectId: created.projectId, title: 'Анкета для заявки' }), true);
    const material = await prisma.material.findFirstOrThrow({
      where: { projectId: created.projectId },
      select: { title: true, stageId: true, versions: { select: { originalName: true } } },
    });
    assert.equal(material.title, 'Анкета для заявки');
    assert.equal(material.stageId, null);
    assert.deepEqual(material.versions.map((v) => v.originalName), ['Анкета для заявки.docx']);
    assert.equal(existsSync(path.join(process.env.CABINET_STORAGE_DIR!, 'briefs', ids.manager!, ref)), false);
    assert.equal(await intake.attachBrief(manager(), ref, { projectId: created.projectId, title: 'Анкета для заявки' }), false, 'второй раз нечего переносить');
  });
});
