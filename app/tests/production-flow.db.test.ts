/**
 * Сквозной производственный контур на настоящей базе — критерий готовности
 * первого спринта: заявка → модерация → проект → этапы → материалы с
 * версиями → комментарий эксперта → согласование этапа клиентом.
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

describe('сквозной контур', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');

  const stamp = Date.now();
  const clientEmail = `client-${stamp}@example.org`;
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
    root = await mkdtemp(path.join(tmpdir(), 'pd-storage-'));
    setStorage(new LocalStorage(root));

    const manager = await prisma.user.create({
      data: { email: `manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `expert-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    await prisma.expertProfile.create({
      data: { userId: expert.id, specialization: 'Надёжность машин', ndaSignedAt: new Date() },
    });
    const serviceType = await prisma.serviceType.create({
      data: { code: `diss-${stamp}`, name: 'Кандидатская диссертация' },
    });
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        name: 'Руденко Иван Сергеевич',
        contactKind: 'email',
        contact: clientEmail,
        topic: 'Повышение эффективности ТОиР карьерных экскаваторов',
        consentGiven: true,
        consentVersion: '2026-08-21',
      },
    });
    Object.assign(ids, {
      manager: manager.id,
      expert: expert.id,
      serviceType: serviceType.id,
      lead: lead.id,
    });
  });

  after(async () => {
    if (ids.project) {
      await prisma.fileAccessLog.deleteMany({
        where: { version: { material: { projectId: ids.project } } },
      });
      await prisma.versionComment.deleteMany({
        where: { version: { material: { projectId: ids.project } } },
      });
      await prisma.materialVersion.deleteMany({
        where: { material: { projectId: ids.project } },
      });
      await prisma.material.deleteMany({ where: { projectId: ids.project } });
      await prisma.lead.updateMany({ where: { id: ids.lead }, data: { projectId: null } });
      await prisma.project.deleteMany({ where: { id: ids.project } });
    }
    await prisma.notificationOutbox.deleteMany({
      where: { userId: { in: Object.values(ids).filter(Boolean) } },
    });
    await prisma.lead.deleteMany({ where: { id: ids.lead } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: Object.values(ids) } } });
    await prisma.clientProfile.deleteMany({ where: { email: clientEmail } });
    await prisma.expertProfile.deleteMany({ where: { userId: ids.expert } });
    await prisma.serviceType.deleteMany({ where: { id: ids.serviceType } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.manager, ids.expert, ids.client].filter(Boolean) } },
    });
    await prisma.$disconnect();
    setStorage(null);
    await rm(root, { recursive: true, force: true });
  });

  it('менеджер одобряет заявку, и она разворачивается в проект с кодом', async () => {
    const project = await projects.approveLead(staff(ids.manager, 'MANAGER'), {
      leadId: ids.lead,
      serviceTypeId: ids.serviceType,
      managerId: ids.manager,
      title: 'Сопровождение кандидатской диссертации',
    });
    ids.project = project.id;
    ids.clientProfile = project.clientId;

    assert.match(project.code, /^PD-\d{4}-\d{3}$/);

    // Заявка не исчезает: она получает ссылку на проект.
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: ids.lead } });
    assert.equal(lead.projectId, project.id);
    assert.equal(lead.status, 'CONTRACTED');

    // Учётная запись клиента заведена — иначе войти в кабинет было бы нечем.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: clientEmail } });
    ids.client = user.id;
    assert.equal(user.role, 'CLIENT');

    // Приглашение поставлено в очередь той же транзакцией: прежде запись
    // заводилась молча и человек об этом не узнавал.
    const invite = await prisma.notificationOutbox.findFirstOrThrow({
      where: { userId: user.id, eventKind: 'PROJECT_OPENED' },
    });
    assert.equal(invite.projectId, project.id);
    assert.ok(invite.subject.includes(project.code), 'в теме нет кода работы');
    assert.match(invite.body, /ссылка для входа/);
    // Одноразовая ссылка живёт пятнадцать минут и к моменту прочтения была
    // бы мертва — в письмо она не кладётся.
    assert.ok(!invite.body.includes('/cabinet/enter/'), 'ссылка входа попала в письмо');
  });

  it('повторному клиенту приходит другое письмо: не приглашение, а новая работа', async () => {
    const again = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        name: 'Руденко Иван Сергеевич',
        contactKind: 'email',
        contact: clientEmail,
        topic: 'Вторая работа того же клиента',
        consentGiven: true,
        consentVersion: '2026-08-21',
      },
    });
    const second = await projects.approveLead(staff(ids.manager, 'MANAGER'), {
      leadId: again.id,
      serviceTypeId: ids.serviceType,
      managerId: ids.manager,
      title: 'Сопровождение статьи',
    });

    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: second.id, eventKind: 'PROJECT_OPENED' },
    });
    assert.ok(letter.subject.startsWith('Заведена новая работа'), letter.subject);
    // Объяснение про вход в кабинет прежнему клиенту не повторяется.
    assert.ok(!letter.body.includes('Пароль не нужен'), 'повторному клиенту шлётся приглашение');

    // Учётная запись та же: второй пользователь на тот же адрес не заводится.
    const users = await prisma.user.count({ where: { email: clientEmail } });
    assert.equal(users, 1);

    await prisma.notificationOutbox.deleteMany({ where: { projectId: second.id } });
    await prisma.projectEvent.deleteMany({ where: { projectId: second.id } });
    await prisma.lead.update({ where: { id: again.id }, data: { projectId: null } });
    await prisma.project.delete({ where: { id: second.id } });
    await prisma.lead.delete({ where: { id: again.id } });
  });

  it('повторное одобрение той же заявки отклоняется', async () => {
    await assert.rejects(
      projects.approveLead(staff(ids.manager, 'MANAGER'), {
        leadId: ids.lead,
        serviceTypeId: ids.serviceType,
        managerId: ids.manager,
        title: 'Дубль',
      }),
      /уже развёрнута/,
    );
  });

  it('менеджер заводит этапы и назначает эксперта', async () => {
    const first = await projects.addStage(staff(ids.manager, 'MANAGER'), {
      projectId: ids.project,
      title: 'Глава 2. Модель отказов лимитирующих узлов',
    });
    ids.stage = first.id;
    assert.equal(first.position, 1);
    assert.equal(first.state, 'NOT_STARTED');

    const second = await projects.addStage(staff(ids.manager, 'MANAGER'), {
      projectId: ids.project,
      title: 'Глава 3. Эксперимент',
    });
    assert.equal(second.position, 2);

    await projects.assignExpert(staff(ids.manager, 'MANAGER'), ids.project, ids.expert);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: ids.project } });
    assert.equal(project.expertId, ids.expert);
  });

  it('эксперт загружает версию, клиент — следующую', async () => {
    const expert: Actor = {
      id: ids.expert,
      role: 'EXPERT',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: new Date(),
    };
    const client: Actor = {
      id: ids.client,
      role: 'CLIENT',
      status: 'ACTIVE',
      clientProfileId: ids.clientProfile,
      expertNdaSignedAt: null,
    };

    const v1 = await materials.uploadVersion(expert, {
      projectId: ids.project,
      stageId: ids.stage,
      title: 'Глава 2. Модель отказов',
      originalName: 'glava-2.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from('черновик главы 2'),
    });
    ids.material = v1.materialId;
    ids.version1 = v1.id;
    assert.equal(v1.number, 1);
    // Исходное имя файла в ключ не попадает: оно может содержать фамилию.
    assert.ok(!v1.storageKey.includes('glava-2'));

    const v2 = await materials.uploadVersion(client, {
      projectId: ids.project,
      materialId: ids.material,
      originalName: 'glava-2-pravki.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from('правки клиента'),
    });
    ids.version2 = v2.id;
    assert.equal(v2.number, 2);

    // Первая версия остаётся доступной: история не переписывается.
    const read = await materials.readVersion(client, ids.version1);
    assert.equal(read?.body.toString(), 'черновик главы 2');

    const log = await prisma.fileAccessLog.findMany({ where: { versionId: ids.version1 } });
    assert.ok(log.some((row) => row.action === 'UPLOAD'));
    assert.ok(log.some((row) => row.action === 'DOWNLOAD'));
  });

  it('комментарий эксперта не виден клиенту до публикации', async () => {
    const expert: Actor = {
      id: ids.expert,
      role: 'EXPERT',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: new Date(),
    };
    const client: Actor = {
      id: ids.client,
      role: 'CLIENT',
      status: 'ACTIVE',
      clientProfileId: ids.clientProfile,
      expertNdaSignedAt: null,
    };

    const comment = await materials.addComment(
      expert,
      ids.version2,
      'В п. 2.3 нужна фактическая наработка на отказ по вашему парку.',
    );
    assert.equal(comment.moderationStatus, 'PENDING');

    assert.equal((await materials.listComments(client, ids.version2)).length, 0);
    assert.equal((await materials.listComments(expert, ids.version2)).length, 1);

    // Менеджер другой работы замечание не публикует (решение Р-220).
    await assert.rejects(
      materials.moderateComment(staff(`other-${ids.manager}`, 'MANAGER'), comment.id, 'PUBLISHED'),
      AccessDenied,
    );
    await materials.moderateComment(staff(ids.manager, 'MANAGER'), comment.id, 'PUBLISHED');
    const visible = await materials.listComments(client, ids.version2);
    assert.equal(visible.length, 1);
    assert.match(visible[0].body, /наработка на отказ/);
  });

  it('этап проходит состояния и согласуется клиентом', async () => {
    const manager = staff(ids.manager, 'MANAGER');
    const client: Actor = {
      id: ids.client,
      role: 'CLIENT',
      status: 'ACTIVE',
      clientProfileId: ids.clientProfile,
      expertNdaSignedAt: null,
    };

    await projects.setStageState(manager, ids.stage, 'IN_PROGRESS');

    // Остановка без причины не принимается: причину читает клиент.
    await assert.rejects(
      projects.setStageState(manager, ids.stage, 'AWAITING_CLIENT'),
      /без причины/,
    );

    const waiting = await projects.setStageState(
      manager,
      ids.stage,
      'AWAITING_CLIENT',
      'Ждём протокол испытаний; после загрузки — два рабочих дня работы эксперта.',
    );
    assert.ok(waiting.awaitingClientSince !== null);
    assert.match(waiting.blockedReason ?? '', /протокол испытаний/);

    await projects.setStageState(manager, ids.stage, 'IN_PROGRESS');
    await projects.setStageState(manager, ids.stage, 'IN_APPROVAL');

    const done = await projects.setStageState(client, ids.stage, 'DONE');
    assert.equal(done.state, 'DONE');
    assert.ok(done.completedAt !== null);

    const history = await prisma.stageStateChange.findMany({
      where: { stageId: ids.stage },
      orderBy: { createdAt: 'asc' },
    });
    assert.deepEqual(
      history.map((h) => h.toState),
      ['IN_PROGRESS', 'AWAITING_CLIENT', 'IN_PROGRESS', 'IN_APPROVAL', 'DONE'],
    );
    assert.equal(history.at(-1)?.actorId, ids.client, 'этап закрыл не клиент');
  });

  it('непредусмотренный переход состояния отклоняется', async () => {
    await assert.rejects(
      projects.setStageState(staff(ids.manager, 'MANAGER'), ids.stage, 'IN_PROGRESS'),
      /не предусмотрен/,
    );
  });

  it('эксперт не получает доступа к чужому проекту', async () => {
    const stranger: Actor = {
      id: 'посторонний-эксперт',
      role: 'EXPERT',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: new Date(),
    };
    await assert.rejects(
      materials.uploadVersion(stranger, {
        projectId: ids.project,
        originalName: 'чужое.docx',
        contentType: 'application/octet-stream',
        body: Buffer.from('x'),
      }),
      AccessDenied,
    );
    assert.equal(await materials.readVersion(stranger, ids.version1).catch(() => 'отказ'), 'отказ');
  });

  it('клиент не может заводить этапы и модерировать комментарии', async () => {
    const client: Actor = {
      id: ids.client,
      role: 'CLIENT',
      status: 'ACTIVE',
      clientProfileId: ids.clientProfile,
      expertNdaSignedAt: null,
    };
    await assert.rejects(
      projects.addStage(client, { projectId: ids.project, title: 'Свой этап' }),
      AccessDenied,
    );
    await assert.rejects(
      materials.moderateComment(client, 'любой', 'PUBLISHED'),
      AccessDenied,
    );
  });
});
