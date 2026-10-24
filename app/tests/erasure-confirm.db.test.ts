/**
 * Подтверждение перед исполнением требования об удалении данных
 * (решение Р-716, по образцу «Удалить год», Р-346).
 *
 * «Исполнить» в строке требования затирало данные одним нажатием.
 * Теперь оно открывает подтверждение с объёмом: чья карточка, данные или
 * данные с файлами, сколько работ, сообщений и файлов будет затронуто.
 * Объём считается теми же правилами, что и исполнение, — со сведёнными
 * карточками, — и сам ничего не меняет.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const tail = String(stamp).slice(-6);

describe('объём требования об удалении перед исполнением', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { erasureVolume, requestErasure } = await import('../src/lib/cabinet/erasure.ts');

  const ids: Record<string, string> = {};

  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `erc-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `erc-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    ids.head = head.id;
    ids.manager = manager.id;
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Кузнецова Анна Сергеевна', normalizedName: `кузнецова анна сергеевна ${stamp}` },
    });
    // Другое написание того же ФИО, сведённое в эту карточку при переносе
    // книги: его работы исполнение тоже затрёт (решение Р-234).
    const merged = await prisma.clientProfile.create({
      data: {
        fullName: 'Кузнецова А. С.',
        normalizedName: `кузнецова а с ${stamp}`,
        mergedIntoId: client.id,
      },
    });
    ids.client = client.id;
    ids.merged = merged.id;
    const type = await prisma.serviceType.upsert({
      where: { code: 'dissertation' },
      create: { code: 'dissertation', name: 'Диссертация' },
      update: {},
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-ERC-${tail}1`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Сопровождение кандидатской',
        managerId: manager.id,
        status: 'COMPLETED',
      },
    });
    const old = await prisma.project.create({
      data: {
        code: `PD-ERC-${tail}2`,
        clientId: merged.id,
        serviceTypeId: type.id,
        title: 'Статья ВАК',
        managerId: manager.id,
        status: 'COMPLETED',
      },
    });
    ids.project = project.id;
    ids.old = old.id;
    for (const [projectId, body] of [
      [project.id, 'Добрый день'],
      [project.id, 'Глава готова'],
      [old.id, 'Статья принята'],
    ] as const) {
      await prisma.message.create({ data: { projectId, authorId: manager.id, body } });
    }
    const material = await prisma.material.create({
      data: { projectId: project.id, title: 'Глава 1', createdById: manager.id },
    });
    ids.material = material.id;
    for (const [number, purgedAt] of [
      [1, new Date()],
      [2, null],
    ] as const) {
      await prisma.materialVersion.create({
        data: {
          materialId: material.id,
          number,
          storageKey: `erc/${stamp}/${number}`,
          originalName: `Кузнецова — глава 1, версия ${number}.docx`,
          sizeBytes: 10n,
          sha256: 'x'.repeat(64),
          contentType: 'application/octet-stream',
          uploadedById: manager.id,
          purgedAt,
        },
      });
    }
    const request = await requestErasure(actor(head.id, 'HEAD'), client.id, 'PERSONAL_DATA');
    ids.request = request.id;
  });

  after(async () => {
    await prisma.materialVersion.deleteMany({ where: { materialId: ids.material } });
    await prisma.material.deleteMany({ where: { id: ids.material } });
    await prisma.message.deleteMany({ where: { projectId: { in: [ids.project, ids.old] } } });
    await prisma.project.deleteMany({ where: { id: { in: [ids.project, ids.old] } } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: ids.client } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.head } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.merged } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head, ids.manager] } } });
    await prisma.$disconnect();
  });

  it('объём — карточка, вид требования, работы, сообщения и файлы со сведёнными карточками', async () => {
    const volume = await erasureVolume(actor(ids.head, 'HEAD'), ids.request);
    assert.deepEqual(volume, {
      requestId: ids.request,
      clientName: 'Кузнецова Анна Сергеевна',
      scope: 'PERSONAL_DATA',
      projects: 2,
      messages: 3,
      // Изъятая раньше версия в объём не входит: её файла уже нет.
      files: 1,
    });
  });

  it('подсчёт объёма данных не трогает', async () => {
    await erasureVolume(actor(ids.head, 'HEAD'), ids.request);
    const client = await prisma.clientProfile.findUnique({ where: { id: ids.client } });
    assert.equal(client?.fullName, 'Кузнецова Анна Сергеевна');
    assert.equal(client?.erasedAt, null);
    const request = await prisma.erasureRequest.findUnique({ where: { id: ids.request } });
    assert.equal(request?.executedAt, null);
    assert.equal(await prisma.message.count({ where: { projectId: ids.project, body: 'Добрый день' } }), 1);
  });

  it('объём видит только руководитель', async () => {
    for (const role of ['MANAGER', 'EXPERT', 'CLIENT'] as const) {
      await assert.rejects(erasureVolume(actor(ids.manager, role), ids.request), AccessDenied);
    }
  });

  it('у исполненного или чужого требования подтверждения нет', async () => {
    assert.equal(await erasureVolume(actor(ids.head, 'HEAD'), 'нет-такого'), null);
    await prisma.erasureRequest.update({ where: { id: ids.request }, data: { executedAt: new Date() } });
    try {
      assert.equal(await erasureVolume(actor(ids.head, 'HEAD'), ids.request), null);
    } finally {
      await prisma.erasureRequest.update({ where: { id: ids.request }, data: { executedAt: null } });
    }
  });
});
