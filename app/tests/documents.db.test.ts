/**
 * Документы, материалы и шаблоны этапов на настоящей базе.
 *
 * Три пробела, обнаруженные разведкой состава экранов: договор, счета и
 * акты было неоткуда загрузить; материал вне этапа существовал строкой,
 * но был недостижим; шаблон этапов применялся при одобрении заявки, но
 * завести его из кабинета было нельзя.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-docs-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('документы, материалы и шаблоны', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { uploadVersion } = await import('../src/lib/cabinet/materials.ts');
  const { projectMaterials } = await import('../src/lib/cabinet/queries.ts');
  const { listStageTemplates, removeStageTemplateItem, saveStageTemplateItem } = await import(
    '../src/lib/cabinet/admin.ts'
  );

  const ids: Record<string, string> = {};

  const actor = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
    ...extra,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `doc-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `doc-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const clientUser = await prisma.user.create({
      data: { email: `doc-client-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const client = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `клиент ${stamp}` },
    });
    const type = await prisma.serviceType.upsert({
      where: { code: `doc-${stamp}` },
      create: { code: `doc-${stamp}`, name: 'Тип для проверки документов' },
      update: {},
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-DOC-${String(stamp).slice(-6)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки документов',
        managerId: manager.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Первый этап' },
    });
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `Д-ДОК-${stamp}`, totalAmount: 20_000_000n },
    });
    const tranche = await prisma.tranche.create({
      data: { contractId: contract.id, title: 'Первый платёж', amount: 10_000_000n, status: 'PAID' },
    });

    Object.assign(ids, {
      head: head.id,
      manager: manager.id,
      clientUser: clientUser.id,
      client: client.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
      contract: contract.id,
      tranche: tranche.id,
      code: project.code,
    });
  });

  after(async () => {
    const versions = await prisma.materialVersion.findMany({
      where: { material: { projectId: ids.project } },
      select: { id: true },
    });
    await prisma.fileAccessLog.deleteMany({
      where: { versionId: { in: versions.map((version) => version.id) } },
    });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: ids.project } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.stageTemplate.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.tranche.deleteMany({ where: { contractId: ids.contract } });
    await prisma.contract.deleteMany({ where: { id: ids.contract } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [ids.head, ids.manager, ids.clientUser] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.head, ids.manager, ids.clientUser] } },
    });
    await prisma.$disconnect();
  });

  it('акт прикладывает только тот, кто ведёт деньги', async () => {
    const file = {
      projectId: ids.project,
      kind: 'ACT' as const,
      trancheId: ids.tranche,
      title: 'Акт № 1',
      originalName: 'act.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('акт выполненных работ', 'utf8'),
    };

    // Клиент и менеджер материалы грузить вправе, но закрывающий документ —
    // часть финансового контура, а его ведёт руководитель.
    await assert.rejects(
      uploadVersion(actor(ids.clientUser, 'CLIENT', { clientProfileId: ids.client }), file),
      AccessDenied,
      'клиент приложил акт к траншу',
    );
    await assert.rejects(
      uploadVersion(actor(ids.manager, 'MANAGER'), file),
      AccessDenied,
      'менеджер приложил акт, хотя деньги ведёт руководитель',
    );

    const version = await uploadVersion(actor(ids.head, 'HEAD'), file);
    assert.equal(version.number, 1);

    const material = await prisma.material.findFirst({
      where: { trancheId: ids.tranche },
      select: { kind: true, contractId: true, trancheId: true },
    });
    assert.equal(material?.kind, 'ACT');
    assert.equal(material?.trancheId, ids.tranche);
    // Акт висит на транше, а не на договоре: видно, какой платёж он закрывает.
    assert.equal(material?.contractId, null);
  });

  it('файл договора привязан к договору', async () => {
    await uploadVersion(actor(ids.head, 'HEAD'), {
      projectId: ids.project,
      kind: 'CONTRACT',
      contractId: ids.contract,
      title: 'Договор',
      originalName: 'contract.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('договор', 'utf8'),
    });

    const documents = await prisma.material.findMany({
      where: { contractId: ids.contract },
      select: { kind: true },
    });
    assert.deepEqual(documents.map((document) => document.kind), ['CONTRACT']);
  });

  it('материал работы грузит и клиент, и эксперт', async () => {
    const version = await uploadVersion(
      actor(ids.clientUser, 'CLIENT', { clientProfileId: ids.client }),
      {
        projectId: ids.project,
        title: 'Черновик без этапа',
        originalName: 'draft.docx',
        contentType: 'application/octet-stream',
        body: Buffer.from('черновик', 'utf8'),
      },
    );
    assert.equal(version.number, 1);
  });

  // Следующая версия ложится в существующий материал, и вид с работой
  // берутся из базы, а не из формы (решение Р-222).
  const clientActor = () => actor(ids.clientUser, 'CLIENT', { clientProfileId: ids.client });
  const file = (extra: Record<string, unknown>) => ({
    projectId: ids.project,
    originalName: 'v2.pdf',
    contentType: 'application/pdf',
    body: Buffer.from('следующая версия', 'utf8'),
    ...extra,
  });

  it('версию договора клиент не добавит, не указав вида', async () => {
    const contract = await prisma.material.findFirstOrThrow({
      where: { contractId: ids.contract, kind: 'CONTRACT' },
      select: { id: true },
    });
    await assert.rejects(
      uploadVersion(clientActor(), file({ materialId: contract.id })),
      AccessDenied,
      'клиент добавил версию договора под правом загрузки материалов',
    );
  });

  it('материал другой работы и удалённый материал не принимают версию', async () => {
    const other = await prisma.project.create({
      data: {
        code: `PD-DOC2-${String(stamp).slice(-6)}`,
        clientId: ids.client,
        serviceTypeId: ids.type,
        title: 'Вторая работа',
        managerId: ids.manager,
      },
    });
    const foreign = await prisma.material.create({
      data: { projectId: other.id, title: 'Материал второй работы', createdById: ids.head },
    });
    const otherStage = await prisma.stage.create({
      data: { projectId: other.id, position: 1, title: 'Этап второй работы' },
    });
    try {
      await assert.rejects(
        uploadVersion(clientActor(), file({ materialId: foreign.id })),
        /Материал не найден/u,
        'версия легла в материал другой работы',
      );
      await assert.rejects(
        uploadVersion(clientActor(), file({ stageId: otherStage.id, title: 'Новый' })),
        /Этап не найден/u,
        'новый материал привязан к этапу другой работы',
      );
      const own = await prisma.material.create({
        data: { projectId: ids.project, title: 'Удалённый', createdById: ids.head, deletedAt: new Date() },
      });
      await assert.rejects(
        uploadVersion(clientActor(), file({ materialId: own.id })),
        /Материал не найден/u,
        'версия легла в удалённый материал',
      );
    } finally {
      await prisma.material.deleteMany({ where: { projectId: other.id } });
      await prisma.stage.deleteMany({ where: { projectId: other.id } });
      await prisma.project.delete({ where: { id: other.id } });
    }
  });

  it('материал вне этапа виден на экране материалов работы', async () => {
    const view = await projectMaterials(
      actor(ids.clientUser, 'CLIENT', { clientProfileId: ids.client }),
      ids.code!,
    );
    assert.ok(view !== null);
    const titles = view.materials.map((material) => material.title);
    assert.ok(
      titles.includes('Черновик без этапа'),
      'материал без этапа не попал в перечень и остался недостижимым',
    );
    // Закрывающие документы сюда не попадают: их место на экране оплат.
    assert.ok(!titles.includes('Акт № 1'));
    assert.ok(!titles.includes('Договор'));
    assert.equal(view.materials.find((m) => m.title === 'Черновик без этапа')?.stage, null);
  });

  it('чужой работы на экране материалов нет', async () => {
    const stranger = await prisma.user.create({
      data: { email: `doc-stranger-${stamp}@example.org`, fullName: 'Чужой', role: 'CLIENT' },
    });
    const strangerProfile = await prisma.clientProfile.create({
      data: { userId: stranger.id, fullName: 'Чужой', normalizedName: `чужой ${stamp}` },
    });
    const view = await projectMaterials(
      actor(stranger.id, 'CLIENT', { clientProfileId: strangerProfile.id }),
      ids.code!,
    );
    assert.equal(view, null, 'клиент увидел материалы чужой работы');

    await prisma.clientProfile.delete({ where: { id: strangerProfile.id } });
    await prisma.user.delete({ where: { id: stranger.id } });
  });

  it('шаблон этапов заводит руководитель, и номер в пределах типа один', async () => {
    await assert.rejects(
      saveStageTemplateItem(actor(ids.manager, 'MANAGER'), {
        serviceTypeId: ids.type!,
        title: 'Постановка задачи',
        position: 1,
      }),
      AccessDenied,
    );

    await saveStageTemplateItem(actor(ids.head, 'HEAD'), {
      serviceTypeId: ids.type!,
      title: 'Постановка задачи',
      position: 1,
      durationDays: 14,
    });
    // Повторное сохранение того же номера правит название, а не плодит строки.
    await saveStageTemplateItem(actor(ids.head, 'HEAD'), {
      serviceTypeId: ids.type!,
      title: 'Постановка задачи и план',
      position: 1,
      durationDays: 21,
    });
    await saveStageTemplateItem(actor(ids.head, 'HEAD'), {
      serviceTypeId: ids.type!,
      title: 'Обзор источников',
      position: 2,
    });

    const list = (await listStageTemplates(actor(ids.head, 'HEAD'))).filter(
      (item) => item.serviceTypeId === ids.type,
    );
    assert.deepEqual(
      list.map((item) => [item.position, item.title, item.durationDays]),
      [
        [1, 'Постановка задачи и план', 21],
        [2, 'Обзор источников', null],
      ],
    );

    await removeStageTemplateItem(actor(ids.head, 'HEAD'), list[1]!.id);
    const after = (await listStageTemplates(actor(ids.head, 'HEAD'))).filter(
      (item) => item.serviceTypeId === ids.type,
    );
    assert.equal(after.length, 1);
  });

  it('номер этапа шаблона — целое число, начиная с единицы', async () => {
    await assert.rejects(
      saveStageTemplateItem(actor(ids.head, 'HEAD'), {
        serviceTypeId: ids.type!,
        title: 'Нулевой этап',
        position: 0,
      }),
      /целое число/u,
    );
  });
});
