/**
 * Исполнение требования субъекта об удалении данных.
 *
 * Проверка идёт на настоящей базе и настоящем хранилище: обезличивание —
 * то место, где расхождение между задуманным и написанным обнаруживается
 * не в разработке, а на проверке регулятором.
 *
 * Проверяется и обратное требование: учётные величины не должны
 * пострадать. Затирание, унёсшее сумму договора, — не исполнение закона,
 * а утрата первичного учёта.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-erasure-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('удаление данных субъекта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { executeErasure, requestErasure } = await import('../src/lib/cabinet/erasure.ts');
  const { storage, materialKey, sha256 } = await import('../src/lib/cabinet/storage.ts');

  const ids: Record<string, string> = {};
  let storageKey = '';

  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `era-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `era-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const clientUser = await prisma.user.create({
      data: {
        email: `era-client-${stamp}@example.org`,
        fullName: 'Смирнов Олег Петрович',
        role: 'CLIENT',
        phone: '+7 900 000-00-00',
        telegramChatId: '123456',
      },
    });
    const client = await prisma.clientProfile.create({
      data: {
        userId: clientUser.id,
        fullName: 'Смирнов Олег Петрович',
        normalizedName: `смирнов олег петрович ${stamp}`,
        phone: '+7 900 000-00-00',
        email: `era-client-${stamp}@example.org`,
        university: 'МГУ',
        speciality: 'Физика',
      },
    });
    const type = await prisma.serviceType.upsert({
      where: { code: 'dissertation' },
      create: { code: 'dissertation', name: 'Диссертация' },
      update: {},
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-ERA-${String(stamp).slice(-6)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Сопровождение кандидатской',
        topic: 'Спиновые кубиты на основе кремния',
        managerId: manager.id,
      },
    });
    const contract = await prisma.contract.create({
      data: {
        projectId: project.id,
        number: `Д-ЕРА-${stamp}`,
        totalAmount: 30_000_000n,
      },
    });
    await prisma.tranche.create({
      data: { contractId: contract.id, title: 'Первый платёж', amount: 15_000_000n, status: 'PAID' },
    });
    const material = await prisma.material.create({
      data: { projectId: project.id, title: 'Черновик главы', createdById: manager.id },
    });
    const body = Buffer.from('текст черновика', 'utf8');
    storageKey = materialKey(project.id, material.id, 1, 'Смирнов О.П. — глава 1.docx');
    await storage().put(storageKey, body, 'application/octet-stream');
    const version = await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey,
        originalName: 'Смирнов О.П. — глава 1.docx',
        sizeBytes: BigInt(body.length),
        sha256: sha256(body),
        contentType: 'application/octet-stream',
        uploadedById: manager.id,
      },
    });
    await prisma.message.create({
      data: {
        projectId: project.id,
        authorId: clientUser.id,
        body: 'Мой телефон +7 900 000-00-00, звоните',
        containsContactHint: true,
      },
    });
    await prisma.session.create({
      data: {
        tokenHash: `era-session-${stamp}`,
        userId: clientUser.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.loginToken.create({
      data: {
        selector: `era-sel-${stamp}`,
        verifierHash: 'x'.repeat(64),
        userId: clientUser.id,
        expiresAt: new Date(Date.now() + 900_000),
      },
    });

    Object.assign(ids, {
      head: head.id,
      manager: manager.id,
      clientUser: clientUser.id,
      client: client.id,
      project: project.id,
      contract: contract.id,
      material: material.id,
      version: version.id,
    });
  });

  after(async () => {
    await prisma.fileAccessLog.deleteMany({ where: { versionId: ids.version } });
    await prisma.materialVersion.deleteMany({ where: { id: ids.version } });
    await prisma.material.deleteMany({ where: { id: ids.material } });
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.tranche.deleteMany({ where: { contractId: ids.contract } });
    await prisma.contract.deleteMany({ where: { id: ids.contract } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.client } });
    await prisma.auditEvent.deleteMany({
      where: { actorId: { in: [ids.head, ids.manager, ids.clientUser] } },
    });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.session.deleteMany({ where: { userId: ids.clientUser } });
    await prisma.loginToken.deleteMany({ where: { userId: ids.clientUser } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.head, ids.manager, ids.clientUser] } },
    });
    await prisma.$disconnect();
  });

  it('требование принимает только руководитель', async () => {
    for (const role of ['MANAGER', 'EXPERT', 'CLIENT'] as const) {
      await assert.rejects(
        requestErasure(actor(ids.manager, role), ids.client),
        AccessDenied,
        `роль ${role} приняла требование об удалении`,
      );
    }
  });

  it('требование исполняется целиком и отчёт сходится', async () => {
    const request = await requestErasure(actor(ids.head, 'HEAD'), ids.client);
    const report = await executeErasure(actor(ids.head, 'HEAD'), request.id);

    assert.equal(report.projects, 1);
    assert.equal(report.messages, 1);
    assert.equal(report.versions, 1);
    assert.equal(report.objectsPurged, 1);
    assert.equal(report.objectsFailed, 0);
    assert.equal(report.sessionsRevoked, 1);
    assert.equal(report.tokensBurned, 1);
    assert.equal(report.userErased, true);
    // Суммы договоров в отчёте — доказательство, что учёт не пострадал.
    assert.equal(report.preserved.contractTotal, '30000000');
  });

  it('персональные данные затёрты', async () => {
    const client = await prisma.clientProfile.findUnique({ where: { id: ids.client } });
    assert.match(client?.fullName ?? '', /удалено/u);
    assert.equal(client?.phone, null);
    assert.equal(client?.email, null);
    assert.equal(client?.university, null);
    assert.equal(client?.speciality, null);
    assert.ok(client?.erasedAt instanceof Date);

    const user = await prisma.user.findUnique({ where: { id: ids.clientUser } });
    assert.equal(user?.status, 'ERASED');
    assert.equal(user?.telegramChatId, null);
    assert.equal(user?.phone, null);
    assert.doesNotMatch(user?.email ?? '', /era-client/u, 'прежний адрес остался в учётной записи');

    const project = await prisma.project.findUnique({ where: { id: ids.project } });
    assert.equal(project?.topic, null, 'тема работы косвенно опознаёт автора и должна быть затёрта');

    const message = await prisma.message.findFirst({ where: { projectId: ids.project } });
    assert.match(message?.body ?? '', /удалено/u);
    assert.equal(message?.containsContactHint, false);
    assert.ok(message !== null, 'строка сообщения удалена — переписка потеряла связность');
  });

  it('объект изъят из хранилища, строка версии осталась', async () => {
    await assert.rejects(storage().get(storageKey), 'объект остался в хранилище');

    const version = await prisma.materialVersion.findUnique({ where: { id: ids.version } });
    assert.ok(version !== null, 'строка версии удалена вместе с объектом');
    assert.match(version?.originalName ?? '', /удалено/u);
    assert.equal(version?.sha256, '');
    assert.ok(version?.purgedAt instanceof Date);
    // Размер и номер версии остаются: они не персональные данные, а учёт.
    assert.equal(version?.number, 1);
  });

  it('изъятие отражено в журнале доступа к файлам', async () => {
    const purge = await prisma.fileAccessLog.findFirst({
      where: { versionId: ids.version, action: 'PURGE' },
    });
    assert.ok(purge !== null, 'изъятие файла не записано в журнал доступа');
  });

  it('учётные величины не изменились', async () => {
    const contract = await prisma.contract.findUnique({
      where: { id: ids.contract },
      select: { totalAmount: true, tranches: { select: { amount: true, status: true } } },
    });
    assert.equal(contract?.totalAmount, 30_000_000n);
    assert.deepEqual(
      contract?.tranches.map((tranche) => [tranche.status, tranche.amount]),
      [['PAID', 15_000_000n]],
    );

    const project = await prisma.project.findUnique({ where: { id: ids.project } });
    assert.match(project?.code ?? '', /^PD-ERA-/u, 'код проекта изменился');
  });

  it('вход невозможен: сессии отозваны, ссылки погашены', async () => {
    const live = await prisma.session.count({
      where: { userId: ids.clientUser, revokedAt: null },
    });
    assert.equal(live, 0);
    const tokens = await prisma.loginToken.count({
      where: { userId: ids.clientUser, usedAt: null },
    });
    assert.equal(tokens, 0);
  });

  it('повторное исполнение отклоняется', async () => {
    const executed = await prisma.erasureRequest.findFirst({
      where: { clientId: ids.client, executedAt: { not: null } },
      select: { id: true },
    });
    await assert.rejects(
      executeErasure(actor(ids.head, 'HEAD'), executed!.id),
      /уже исполнено/u,
    );
  });
});
