/**
 * Закрытая работа — только чтение, завершённый этап — только практике
 * (требования Т-17 и М-10, решение Р-293). Службы вызываются напрямую, в
 * обход экранов: правило должно держаться на сервере.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-closed-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('закрытая работа — только чтение', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { uploadVersion, addComment, moderateComment } = await import('../src/lib/cabinet/materials.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');

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
  const head = () => who(ids.head!, 'HEAD');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const expert = () => who(ids.expert!, 'EXPERT');

  const file = (stageId: string | null, materialId: string | null = null) => ({
    projectId: ids.project!,
    stageId,
    materialId,
    title: materialId === null ? `Файл ${Math.random().toString(36).slice(2, 7)}` : undefined,
    originalName: 'glava.docx',
    contentType: 'application/octet-stream',
    body: Buffer.from('глава'),
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `cw-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [headUser, manager, clientUser, expertUser] = await Promise.all([
      make('head', 'HEAD'),
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('exp', 'EXPERT'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `cw клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cw-${stamp}`, name: 'Проверка закрытой работы' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CW-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки закрытия',
        managerId: manager.id,
        expertId: expertUser.id,
      },
    });
    const open = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 1', state: 'IN_PROGRESS' },
    });
    const done = await prisma.stage.create({
      data: { projectId: project.id, position: 2, title: 'Глава 2', state: 'DONE' },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: manager.id,
      clientUser: clientUser.id,
      expert: expertUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
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
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.head!, ids.manager!, ids.clientUser!, ids.expert!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('завершённый этап действующей работы: клиенту и эксперту — отказ, практике — да', async () => {
    await uploadVersion(client(), file(ids.open!));
    await assert.rejects(uploadVersion(client(), file(ids.done!)), /Этап завершён/u);
    await assert.rejects(uploadVersion(expert(), file(ids.done!)), /Этап завершён/u);
    const mine = await uploadVersion(curator(), file(ids.done!));

    const version = await prisma.materialVersion.findFirstOrThrow({ where: { materialId: mine.materialId } });
    await assert.rejects(addComment(client(), version.id, 'Поправьте вывод'), /Этап завершён/u);
    await assert.rejects(uploadVersion(client(), file(null, mine.materialId)), /Этап завершён/u);
    await addComment(curator(), version.id, 'Замечание практики');
  });

  it('исполняемый файл не принимается ни от кого (Т-22, Р-296)', async () => {
    await assert.rejects(
      uploadVersion(curator(), { ...file(ids.open!), originalName: 'otchet.pdf\u202Eexe.bat' }),
      /не принят: исполняемые файлы/u,
    );
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]);
    await assert.rejects(
      uploadVersion(client(), { ...file(ids.open!), originalName: 'dannye.csv', body: elf }),
      /не принят/u,
    );
  });

  it('приостановленная работа: материалы и замечания работают', async () => {
    await projects.setProjectStatus(curator(), ids.project!, 'PAUSED', 'Клиент в отпуске до 20 октября');
    const upload = await uploadVersion(client(), file(ids.open!));
    const version = await prisma.materialVersion.findFirstOrThrow({ where: { materialId: upload.materialId } });
    await addComment(client(), version.id, 'Посмотрите таблицу 2');
    await projects.editProject(curator(), { projectId: ids.project!, title: 'Работа для проверки закрытия' });
    // Клиенту — письмо с причиной (Т-21, Р-299).
    const paused = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: ids.clientUser, eventKind: 'PROJECT_STATUS_CHANGED', channel: 'EMAIL' },
    });
    assert.match(paused.subject, /приостановлена/u);
    assert.match(paused.body, /Причина: Клиент в отпуске до 20 октября/u);
    await projects.setProjectStatus(curator(), ids.project!, 'ACTIVE');

    // Новый менеджер — письмо клиенту без имени (Т-21, Р-299; Э-01, ОЭ-3б).
    await projects.assignManager(head(), ids.project!, ids.head!, 'Отпуск менеджера');
    const curatorLetter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: ids.clientUser, eventKind: 'CURATOR_CHANGED', channel: 'EMAIL' },
    });
    assert.match(curatorLetter.body, /Сменился менеджер работы/u);
    assert.doesNotMatch(curatorLetter.body, /HEAD|Отпуск/u, 'имя менеджера или причина в письме клиенту');
    await projects.assignManager(head(), ids.project!, ids.manager!, 'Менеджер вернулся');
  });

  it('завершённая работа: только чтение всем ролям; документы оплат — да; возобновление снимает запрет', async () => {
    const upload = await uploadVersion(client(), file(ids.open!));
    const version = await prisma.materialVersion.findFirstOrThrow({ where: { materialId: upload.materialId } });
    await addComment(expert(), version.id, 'Замечание эксперта на модерации');
    const pending = await prisma.versionComment.findFirstOrThrow({
      where: { versionId: version.id, moderationStatus: 'PENDING' },
    });

    await projects.setProjectStatus(curator(), ids.project!, 'COMPLETED');
    await assert.rejects(uploadVersion(client(), file(ids.open!)), /Работа закрыта\. Если нужно передать файл/u);
    await assert.rejects(uploadVersion(curator(), file(ids.open!)), /возобновите её/u);
    await assert.rejects(addComment(client(), version.id, 'Ещё'), /Работа закрыта/u);
    await assert.rejects(moderateComment(curator(), pending.id, 'PUBLISHED'), /возобновите её/u);
    await assert.rejects(
      projects.editProject(curator(), { projectId: ids.project!, title: 'Новое название' }),
      /возобновите её/u,
    );
    await assert.rejects(projects.assignExpert(curator(), ids.project!, null), /возобновите её/u);

    // Документ оплаты к завершённой работе прикладывается (Р-244).
    await uploadVersion(head(), {
      projectId: ids.project!,
      kind: 'ACT',
      originalName: 'akt.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4'),
    });

    await projects.setProjectStatus(curator(), ids.project!, 'ACTIVE');
    await projects.editProject(curator(), { projectId: ids.project!, title: 'Работа для проверки закрытия' });
    await moderateComment(curator(), pending.id, 'PUBLISHED');
    // Эксперт узнаёт решение по своему замечанию (М-08, Р-301).
    const decided = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: ids.expert, eventKind: 'EXPERT_DECISION', channel: 'EMAIL' },
    });
    assert.match(decided.subject, /опубликовано/u);
  });

  it('куратору — сигналы о замечании клиента, о модерации и о передаче работы (М-07, Р-300)', async () => {
    const count = (eventKind: string) =>
      prisma.notificationOutbox.count({
        where: { projectId: ids.project, userId: ids.manager, eventKind, channel: 'EMAIL' },
      });
    assert.ok((await count('CLIENT_COMMENT')) >= 1, 'замечание клиента не дошло до куратора');
    assert.equal(await count('MODERATION_PENDING'), 1, 'сигнал о модерации — не один');
    assert.equal(await count('CURATOR_ASSIGNED'), 1, 'куратор не узнал о передаче работы');
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project, userId: ids.manager, eventKind: 'CLIENT_COMMENT', channel: 'EMAIL' },
    });
    assert.doesNotMatch(letter.body, /Посмотрите таблицу 2/u, 'текст замечания ушёл в письмо');
  });
});
