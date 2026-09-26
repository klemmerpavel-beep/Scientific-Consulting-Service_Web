/**
 * Реестры и служебные экраны на настоящей базе (решение Р-245): отзыв не
 * стоит в очереди заявок и не разворачивается в работу, отбор журнала по
 * работе берёт все подходящие работы, границы дня — московские,
 * неизвестные значения фильтров не роняют выборку, поиск заявок видит
 * «что нужно», сведение карточек проверяет обе карточки и находит разные
 * написания, реестр не показывает сведённых и чужих работ, приостановленная
 * работа — среди действующих.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('реестры и служебные экраны', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const { auditEvents, fileAccessEvents } = await import('../src/lib/cabinet/journals.ts');
  const { approveLead } = await import('../src/lib/cabinet/projects.ts');
  const { mergeClients, mergeCandidates } = await import('../src/lib/cabinet/import/apply.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const leads: string[] = [];
  const projects: string[] = [];
  const clients: string[] = [];

  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');

  const newClient = async (fullName: string, userId: string | null = null) => {
    const client = await prisma.clientProfile.create({
      data: {
        fullName,
        normalizedName: fullName.toLowerCase().replace(/ё/gu, 'е'),
        userId,
      },
    });
    clients.push(client.id);
    return client.id;
  };
  const newProject = async (suffix: string, clientId: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-RG-${tail}-${suffix}`,
        clientId,
        serviceTypeId: ids.type!,
        title: `Проверка реестров ${tail}`,
        managerId: ids.head!,
        ...extra,
      },
    });
    projects.push(project.id);
    return project.id;
  };

  before(async () => {
    const headUser = await prisma.user.create({
      data: { email: `rg-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `rg-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const clientUser = await prisma.user.create({
      data: { email: `rg-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const type = await prisma.serviceType.create({ data: { code: `rg-${stamp}`, name: 'Реестры' } });
    Object.assign(ids, { head: headUser.id, manager: manager.id, clientUser: clientUser.id, type: type.id });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { objectId: { in: [...leads, ...clients] } } });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.updateMany({ where: { id: { in: clients } }, data: { mergedIntoId: null } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.head!, ids.manager!, ids.clientUser!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('отзыв не стоит в очереди заявок и в работу не разворачивается', async () => {
    const review = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'review',
        contactKind: 'email',
        contact: '',
        name: 'аспирант',
        message: `Отзыв ${stamp}`,
        consentGiven: false,
        consentVersion: 'test',
      },
    });
    leads.push(review.id);
    const all = await prisma.lead.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] }, projectId: null } });
    const queue = await queries.leadQueue(head(), 1);
    assert.ok(queue.total < all, 'отзыв посчитан в очереди');
    for (let page = 1; page <= queue.pages; page += 1) {
      const chunk = await queries.leadQueue(head(), page);
      assert.ok(!chunk.rows.some((row) => row.id === review.id));
    }
    await assert.rejects(
      () =>
        approveLead(head(), {
          leadId: review.id,
          serviceTypeId: ids.type!,
          managerId: ids.head!,
          title: 'Работа из отзыва',
        }),
      /отзыв/u,
    );
  });

  it('отбор журнала по работе берёт все работы с таким названием', async () => {
    const client = await newClient(`Журнал Клиент ${tail}`);
    const first = await newProject('J1', client);
    const second = await newProject('J2', client);
    for (const projectId of [first, second]) {
      await prisma.auditEvent.create({
        data: { action: 'PROJECT_EDITED', objectType: 'Project', objectId: projectId, projectId },
      });
    }
    const rows = await auditEvents(head(), { projectTitle: `Проверка реестров ${tail}` });
    const found = new Set(rows.map((row) => row.projectId));
    assert.ok(found.has(first) && found.has(second), 'одна из работ выпала из отбора');
  });

  it('границы дня в журнале — московские', async () => {
    const client = await newClient(`Время Клиент ${tail}`);
    const projectId = await newProject('T', client);
    // 26.09.2026 01:30 по Москве = 25.09.2026 22:30 UTC.
    const event = await prisma.auditEvent.create({
      data: {
        action: 'PROJECT_EDITED',
        objectType: 'Project',
        objectId: projectId,
        projectId,
        occurredAt: new Date('2026-09-25T22:30:00Z'),
      },
    });
    const day = (text: string) => new Date(`${text}T00:00:00Z`);
    const upTo25 = await auditEvents(head(), { projectTitle: `PD-RG-${tail}-T`, to: day('2026-09-25') });
    assert.ok(!upTo25.some((row) => row.id === event.id), 'событие 26-го по Москве попало в «по 25»');
    const from26 = await auditEvents(head(), { projectTitle: `PD-RG-${tail}-T`, from: day('2026-09-26') });
    assert.ok(from26.some((row) => row.id === event.id), 'событие 26-го по Москве выпало из «с 26»');
  });

  it('неизвестные значения фильтров не роняют выборку; поиск видит «что нужно»', async () => {
    await fileAccessEvents(head(), { action: 'X' });
    const list = await queries.leadList(head(), { status: 'FOO' });
    assert.ok(list.total >= 0);
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact: `rg-need-${stamp}@example.org`,
        need: `редактура-${stamp}`,
        consentGiven: true,
        consentVersion: 'test',
      },
    });
    leads.push(lead.id);
    const found = await queries.leadList(head(), { query: `редактура-${stamp}` });
    assert.ok(found.rows.some((row) => row.id === lead.id));
  });

  it('сведение карточек: разные написания найдены, цикл и карточка со входом отклоняются', async () => {
    const joined = await newClient(`АльзалзалиНадир${tail}`);
    const spaced = await newClient(`Альзалзали Надир${tail}`);
    const groups = await mergeCandidates(head());
    assert.ok(
      groups.some((group) => group.some((c) => c.id === joined) && group.some((c) => c.id === spaced)),
      'разные написания не найдены',
    );
    await mergeClients(head(), joined, spaced);
    await assert.rejects(() => mergeClients(head(), spaced, joined), /уже сведена/u);

    const withAccount = await newClient(`Вход Клиент ${tail}`, ids.clientUser!);
    const other = await newClient(`Другой Клиент ${tail}`);
    await assert.rejects(() => mergeClients(head(), withAccount, other), /вход в кабинет/u);

    const registry = await queries.clientRegistry(head());
    assert.ok(!registry.some((row) => row.id === joined), 'сведённая карточка в реестре');
  });

  it('менеджер видит в реестре число только своих работ клиента', async () => {
    const client = await newClient(`Счёт Клиент ${tail}`);
    await newProject('M1', client, { managerId: ids.manager });
    await newProject('M2', client);
    const registry = await queries.clientRegistry(who(ids.manager!, 'MANAGER'));
    const row = registry.find((item) => item.id === client);
    assert.equal(row?.projects, 1);
  });

  it('приостановленная работа — среди действующих', async () => {
    const client = await newClient(`Пауза Клиент ${tail}`);
    const paused = await newProject('PA', client, { status: 'PAUSED' });
    const list = await queries.listProjects(head(), { filter: 'active', query: `PD-RG-${tail}-PA` });
    assert.ok(list.rows.some((row) => row.id === paused));
  });
});
