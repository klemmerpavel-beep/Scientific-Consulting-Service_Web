/**
 * Переписка, замечания и учётные записи на настоящей базе (решение Р-242):
 * замечание клиента с контактом уходит на модерацию, название материала
 * с контактом не принимается, пределы длины, сотрудник с открытыми
 * работами не приостанавливается и не меняет роль, справочник не
 * переписывает позицию по совпавшему коду, вопрос руководителю — только
 * от сотрудника, каналы и Telegram пишутся в журнал.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'm'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-msg-'));

const enabled = Boolean(process.env.DATABASE_URL);

describe('переписка и учётные записи', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const { sendMessage } = await import('../src/lib/cabinet/messages.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const { unbindTelegram } = await import('../src/lib/cabinet/auth.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const typeCodes: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.manager!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const expert = () => who(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date('2026-01-01') });

  before(async () => {
    const mk = (tag: string, role: Actor['role']) =>
      prisma.user.create({
        data: { email: `ma-${tag}-${stamp}@example.org`, fullName: `Лицо ${tag}`, role },
      });
    const [headUser, manager, expertUser, clientUser] = await Promise.all([
      mk('head', 'HEAD'),
      mk('mgr', 'MANAGER'),
      mk('exp', 'EXPERT'),
      mk('cli', 'CLIENT'),
    ]);
    await prisma.expertProfile.create({
      data: { userId: expertUser.id, ndaSignedAt: new Date('2026-01-01') },
    });
    const type = await prisma.serviceType.create({
      data: { code: `ma-${stamp}`, name: 'Проверка переписки' },
    });
    typeCodes.push(type.code);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент', normalizedName: `ma клиент ${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-MA-${tail}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для переписки',
        managerId: manager.id,
        expertId: expertUser.id,
      },
    });
    const material = await prisma.material.create({
      data: { projectId: project.id, title: 'Глава 1', createdById: manager.id },
    });
    const version = await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey: `test/${stamp}`,
        originalName: 'glava1.docx',
        sizeBytes: 10,
        sha256: 'x'.repeat(64),
        contentType: 'application/octet-stream',
        uploadedById: manager.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: manager.id,
      expert: expertUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      material: material.id,
      version: version.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.expert!, ids.clientUser!];
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.versionComment.deleteMany({ where: { versionId: ids.version } });
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: ids.project } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { code: { in: typeCodes } } });
    await prisma.contactChannel.deleteMany({ where: { userId: { in: users } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { objectId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('замечание клиента с телефоном уходит на модерацию, без контакта — публикуется', async () => {
    const held = await materials.addComment(client(), ids.version!, 'Позвоните мне: +7 900 123-45-67');
    assert.equal(held.moderationStatus, 'PENDING');
    const plain = await materials.addComment(client(), ids.version!, 'Посмотрите вторую таблицу.');
    assert.equal(plain.moderationStatus, 'PUBLISHED');

    const entry = await prisma.auditEvent.findFirstOrThrow({
      where: { objectId: held.id, action: 'COMMENT_CREATED' },
    });
    assert.deepEqual(entry.payload, { held: true, contactHint: true });

    // Своё замечание клиенту не пересылается письмом «эксперт оставил замечание».
    await materials.moderateComment(curator(), held.id, 'PUBLISHED');
    assert.equal(
      await prisma.notificationOutbox.count({ where: { dedupKey: { startsWith: `comment:${held.id}` } } }),
      0,
    );
  });

  it('замечание эксперта после публикации по-прежнему извещает клиента', async () => {
    const note = await materials.addComment(expert(), ids.version!, 'Проверьте выборку.');
    assert.equal(note.moderationStatus, 'PENDING');
    await materials.moderateComment(curator(), note.id, 'PUBLISHED');
    assert.equal(
      await prisma.notificationOutbox.count({ where: { dedupKey: { startsWith: `comment:${note.id}` } } }),
      1,
    );
  });

  it('пределы длины: замечание, сообщение, способ связи', async () => {
    await assert.rejects(
      () => materials.addComment(client(), ids.version!, 'а'.repeat(10_001)),
      /длиннее 10000/u,
    );
    await assert.rejects(
      () => sendMessage(client(), ids.project!, 'б'.repeat(10_001)),
      /длиннее 10000/u,
    );
    await assert.rejects(
      () => channels.addContact(client(), { kind: 'PHONE_CALL', value: '1'.repeat(501) }),
      /не длиннее 500/u,
    );
  });

  it('название нового материала с контактом от клиента не принимается', async () => {
    await assert.rejects(
      () =>
        materials.uploadVersion(client(), {
          projectId: ids.project!,
          title: 'Глава, вопросы — @ivanov_tg',
          originalName: 'glava.docx',
          contentType: 'application/octet-stream',
          body: Buffer.from('текст'),
        }),
      /В названии материала/u,
    );
  });

  it('сотрудник с открытой работой не приостанавливается и не меняет роль', async () => {
    await assert.rejects(
      () => admin.setUserStatus(head(), ids.manager!, 'SUSPENDED'),
      new RegExp(`PD-MA-${tail}`, 'u'),
    );
    await assert.rejects(() => admin.setUserRole(head(), ids.manager!, 'EXPERT'), /открытые работы/u);
    await assert.rejects(() => admin.setUserRole(head(), ids.expert!, 'CLIENT'), /открытые работы/u);
    // Повышение куратора до руководителя работу не бросает.
    await admin.setUserRole(head(), ids.manager!, 'HEAD');
    await admin.setUserRole(head(), ids.manager!, 'MANAGER');

    await prisma.project.update({ where: { id: ids.project }, data: { status: 'COMPLETED' } });
    await admin.setUserStatus(head(), ids.manager!, 'SUSPENDED');
    await admin.setUserStatus(head(), ids.manager!, 'ACTIVE');
    await prisma.project.update({ where: { id: ids.project }, data: { status: 'ACTIVE' } });
  });

  it('новая запись: адрес с опечаткой и неизвестная роль отклоняются', async () => {
    await assert.rejects(
      () => admin.createUser(head(), { email: 'ivanov@mail', fullName: 'Иванов', role: 'EXPERT' }),
      /имя@домен/u,
    );
    await assert.rejects(
      () =>
        admin.createUser(head(), {
          email: `ma-root-${stamp}@example.org`,
          fullName: 'Корень',
          role: 'ROOT' as never,
        }),
      /Неизвестная роль/u,
    );
  });

  it('справочник: совпавший код не переписывает позицию, числа — целые от нуля', async () => {
    await assert.rejects(
      () => admin.saveServiceType(head(), { code: `ma-${stamp}`, name: 'Подмена' }),
      /уже есть/u,
    );
    const kept = await prisma.serviceType.findUniqueOrThrow({ where: { id: ids.type } });
    assert.equal(kept.name, 'Проверка переписки');
    await assert.rejects(
      () => admin.saveServiceType(head(), { code: `ma-neg-${stamp}`, name: 'Минус', sortOrder: -1 }),
      /целое число от нуля/u,
    );
    await assert.rejects(
      () => admin.saveServiceType(head(), { code: 'С пробелом', name: 'Код' }),
      /латиница/u,
    );
    await assert.rejects(
      () =>
        admin.saveStageTemplateItem(head(), {
          serviceTypeId: ids.type!,
          title: 'Дробный',
          position: 1,
          durationDays: 10.5,
        }),
      /целое число дней/u,
    );
  });

  it('вопрос руководителю задаёт только сотрудник', async () => {
    await assert.rejects(() => channels.askForHelp(client(), 'Помогите'), AccessDenied);
  });

  it('каналы уведомлений и отвязка Telegram пишутся в журнал', async () => {
    await admin.saveOwnChannels(client(), { email: true, telegram: false });
    await unbindTelegram(client());
    const actions = (
      await prisma.auditEvent.findMany({
        where: { actorId: ids.clientUser, objectId: ids.clientUser },
        select: { action: true },
      })
    ).map((row) => row.action);
    assert.ok(actions.includes('NOTIFY_CHANNELS_SAVED'));
    assert.ok(actions.includes('TELEGRAM_UNBOUND'));
  });
});
