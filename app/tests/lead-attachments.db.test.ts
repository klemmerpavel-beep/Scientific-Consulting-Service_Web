/**
 * Вложения к заявке из кабинета: приём, выдача, перенос в работу при
 * одобрении и затирание по требованию субъекта (решение Р-191).
 *
 * Пропускается без заданного адреса базы: запускается командой
 * `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('вложения заявки', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  let root = '';

  const staff = (id: string, role: 'MANAGER' | 'HEAD'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pd-lead-'));
    setStorage(new LocalStorage(root));

      // Служебные роли наборов заводятся с закрытым доступом: уведомления
      // о новых заявках ставятся всем действующим менеджерам и
      // руководителям, и каждый оставшийся от прежних прогонов набор
      // растил общую очередь стенда, пока набор на саму очередь не
      // переставал видеть свою строку в пачке (решение Р-195).
    const manager = await prisma.user.create({
      data: {
        email: `lead-manager-${stamp}@example.org`,
        fullName: 'Куратор',
        role: 'MANAGER',
        status: 'SUSPENDED',
      },
    });
    const client = await prisma.user.create({
      data: {
        email: `lead-client-${stamp}@example.org`,
        fullName: 'Заказчик Пробный Пробнович',
        role: 'CLIENT',
        consentVersion: 'v1',
      },
    });
    const profile = await prisma.clientProfile.create({
      data: {
        userId: client.id,
        fullName: 'Заказчик Пробный Пробнович',
        normalizedName: `probny-${stamp}`,
        email: client.email,
        university: 'Горный университет',
        speciality: '2.8.6',
      },
    });
    const serviceType = await prisma.serviceType.create({
      data: { code: `lead-type-${stamp}`, name: 'Кандидатская диссертация' },
    });

    ids.manager = manager.id;
    ids.client = client.id;
    ids.profile = profile.id;
    ids.serviceType = serviceType.id;
  });

  after(async () => {
    setStorage(null);
    if (root !== '') await rm(root, { recursive: true, force: true });
    // Уведомления модераторам, поставленные заявками этого набора, из
    // общей очереди стенда убираются: иначе они копятся и мешают набору
    // на саму очередь.
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.manager } });
  });

  const clientActor = (): Actor => ({
    id: ids.client!,
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfileId: ids.profile!,
    expertNdaSignedAt: null,
  });

  it('заявка принимает файлы и дополнительные поля', async () => {
    const lead = await queries.createCabinetRequest(
      clientActor(),
      {
        topic: 'Надёжность лимитирующих узлов',
        need: null,
        deadline: null,
        message: 'Нужен разбор постановки',
        applicantName: 'Заказчик Пробный Пробнович',
        supervisorName: 'Соловьёв Дмитрий Викторович',
        organization: 'Горный университет',
        speciality: '2.8.6 — Горные машины',
        phone: '+7 900 000-00-00',
        files: [
          {
            originalName: 'черновик.txt',
            contentType: 'text/plain',
            body: Buffer.from('черновик главы 2'),
          },
        ],
        ip: '127.0.0.1',
      },
      'v1',
    );
    ids.lead = lead.id;

    const saved = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { attachments: true },
    });
    assert.equal(saved.supervisorName, 'Соловьёв Дмитрий Викторович');
    assert.equal(saved.phone, '+7 900 000-00-00');
    assert.equal(saved.speciality, '2.8.6 — Горные машины');
    assert.equal(saved.attachments.length, 1);
    assert.equal(saved.attachments[0]!.originalName, 'черновик.txt');
    // Имя файла в ключ объекта не попадает: оно может содержать фамилию.
    assert.ok(!saved.attachments[0]!.storageKey.includes('черновик'));
  });

  it('вложение читает только тот, кто разбирает заявки', async () => {
    const file = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: ids.lead! } });

    await assert.rejects(
      () => queries.readLeadAttachment(clientActor(), file.id),
      AccessDenied,
      'клиент получил чужой порядок выдачи',
    );

    const read = await queries.readLeadAttachment(staff(ids.manager!, 'MANAGER'), file.id);
    assert.ok(read !== null);
    assert.equal(read.body.toString(), 'черновик главы 2');

    const logged = await prisma.auditEvent.findFirst({
      where: { action: 'LEAD_FILE_DOWNLOADED', objectId: file.id },
    });
    assert.ok(logged !== null, 'обращение к вложению не попало в журнал');
  });

  it('одобрение переносит вложения в материалы работы', async () => {
    const project = await projects.approveLead(staff(ids.manager!, 'MANAGER'), {
      leadId: ids.lead!,
      serviceTypeId: ids.serviceType!,
      managerId: ids.manager!,
      title: 'Сопровождение диссертационного исследования',
    });
    ids.project = project.id;

    const materials = await prisma.material.findMany({
      where: { projectId: project.id },
      include: { versions: true },
    });
    assert.equal(materials.length, 1);
    assert.equal(materials[0]!.versions.length, 1);
    assert.equal(materials[0]!.versions[0]!.originalName, 'черновик.txt');

    const moved = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: ids.lead! } });
    assert.equal(moved.materialId, materials[0]!.id);
    assert.ok(moved.purgedAt !== null, 'исходное вложение осталось непомеченным');

    // Повторный перенос не задваивает материалы: перенесённое помечено.
    const second = await prisma.material.count({ where: { projectId: project.id } });
    assert.equal(second, 1);
  });

  it('слишком большой файл отвергается до заявки: половины обращения не остаётся', async () => {
    // Прежде проверка размера стояла в цикле после создания заявки, и
    // второй большой файл оставлял заявку с первым и без уведомления
    // менеджерам, а повторная отправка давала дубль (решение Р-231).
    const topic = `Слишком большой ${stamp}`;
    await assert.rejects(
      () =>
        queries.createCabinetRequest(
          clientActor(),
          {
            topic,
            need: null,
            deadline: null,
            message: null,
            files: [
              { originalName: 'мал.txt', contentType: 'text/plain', body: Buffer.from('a') },
              {
                originalName: 'велик.bin',
                contentType: 'application/octet-stream',
                body: Buffer.alloc(queries.REQUEST_FILE_MAX_BYTES + 1),
              },
            ],
            ip: '127.0.0.1',
          },
          'v1',
        ),
      /МБ/u,
    );
    assert.equal(await prisma.lead.count({ where: { topic } }), 0);
  });

  it('отказ хранилища на одном файле не теряет ни заявку, ни остальные файлы', async () => {
    const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');
    const inner = new LocalStorage(root);
    setStorage({
      put: (key, body) =>
        body.toString() === 'сломается' ? Promise.reject(new Error('диск')) : inner.put(key, body),
      get: (key) => inner.get(key),
      remove: (key) => inner.remove(key),
      signedUrl: () => inner.signedUrl(),
    });
    try {
      const result = await queries.createCabinetRequest(
        clientActor(),
        {
          topic: `Отказ хранилища ${stamp}`,
          need: null,
          deadline: null,
          message: null,
          files: [
            { originalName: 'первый.txt', contentType: 'text/plain', body: Buffer.from('сломается') },
            { originalName: 'второй.txt', contentType: 'text/plain', body: Buffer.from('ляжет') },
          ],
          ip: '127.0.0.1',
        },
        'v1',
      );
      assert.equal(result.filesLost, 1);
      const saved = await prisma.leadAttachment.findMany({ where: { leadId: result.id } });
      assert.deepEqual(
        saved.map((file) => file.originalName),
        ['второй.txt'],
      );
    } finally {
      setStorage(inner);
    }
  });

  it('затирание по требованию субъекта не оставляет вложений', async () => {
    const erasure = await import('../src/lib/cabinet/erasure.ts');
    const head = await prisma.user.create({
      data: {
        email: `lead-head-${stamp}@example.org`,
        fullName: 'Руководитель',
        role: 'HEAD',
        status: 'SUSPENDED',
      },
    });
    const actor = staff(head.id, 'HEAD');

    // Вторая заявка с файлом: первая свои вложения уже отдала работе.
    const lead = await queries.createCabinetRequest(
      clientActor(),
      {
        topic: 'Вторая заявка',
        need: null,
        deadline: null,
        message: null,
        files: [
          {
            originalName: 'требования.txt',
            contentType: 'text/plain',
            body: Buffer.from('требования кафедры'),
          },
        ],
        ip: '127.0.0.1',
      },
      'v1',
    );

    // Действующую работу обезличить нельзя (решение Р-234): работа,
    // заведённая из первой заявки, закрывается.
    await prisma.project.updateMany({ where: { clientId: ids.profile }, data: { status: 'COMPLETED' } });
    const request = await erasure.requestErasure(actor, ids.profile!, 'PERSONAL_DATA_AND_FILES');
    await erasure.executeErasure(actor, request.id);

    const file = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: lead.id } });
    assert.ok(file.purgedAt !== null, 'вложение заявки пережило затирание');
    assert.notEqual(file.originalName, 'требования.txt');

    // Вложение первой заявки переехало в материалы при одобрении и было
    // помечено изъятым; имя файла на нём прежде оставалось (Р-234).
    const moved = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: ids.lead } });
    assert.notEqual(moved.originalName, 'черновик.txt', 'имя перенесённого вложения пережило затирание');
  });
});
