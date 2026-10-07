/**
 * Менеджер при одобрении; передача работы с причиной и уведомлениями
 * (требование РК-08, решение Р-344) — шаги H.8, H.9: руководитель
 * выбирает менеджера работы при одобрении, менеджер ведёт одобренное сам;
 * передача требует причины, работа уходит из перечня прежнего менеджера,
 * письма — новому, прежнему, куратору и клиенту; клиенту — без имён и
 * причины; закрытую работу передавать можно; ручной заказ руководителя на
 * другого менеджера даёт тому письмо.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'u'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('передача работы (РК-08)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { listProjects } = await import('../src/lib/cabinet/queries.ts');
  const { createManualOrder } = await import('../src/lib/cabinet/manual-order.ts');

  const ids: Record<string, string> = {};
  const created: string[] = [];
  const leads: string[] = [];
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const first = () => who(ids.first!, 'MANAGER');
  const second = () => who(ids.second!, 'MANAGER');
  const outbox = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, eventKind, channel: 'EMAIL', projectId: { in: created } } });
  const lead = async (suffix: string) => {
    const row = await prisma.lead.create({
      data: {
        source: 'landing',
        name: `Заявитель ${suffix} ${stamp}`,
        contactKind: 'email',
        contact: `tr-lead-${suffix}-${stamp}@example.org`,
        form: 'request',
        consentGiven: true,
        consentVersion: '2026-08-21',
      },
    });
    leads.push(row.id);
    return row.id;
  };

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `tr-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, firstUser, secondUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Передачи'),
      make('m1', 'MANAGER', 'Первый Менеджер'),
      make('m2', 'MANAGER', 'Второй Менеджер'),
      make('cur', 'EXPERT', 'Куратор Передачи'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const type = await prisma.serviceType.create({ data: { code: `tr-${stamp}`, name: 'Проверка передачи' } });
    Object.assign(ids, {
      head: headUser.id,
      first: firstUser.id,
      second: secondUser.id,
      curator: curatorUser.id,
      type: type.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.first!, ids.second!, ids.curator!];
    const clients = await prisma.project.findMany({ where: { id: { in: created } }, select: { clientId: true, client: { select: { userId: true } } } });
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: { in: created } }] } });
    await prisma.lead.updateMany({ where: { id: { in: leads } }, data: { projectId: null } });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: created } }, { actorId: { in: users } }] } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: created } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: created } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: created } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: created } } });
    await prisma.project.deleteMany({ where: { id: { in: created } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients.map((row) => row.clientId) } } });
    const clientUsers = clients.map((row) => row.client.userId).filter((id): id is string => id !== null);
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: clientUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: clientUsers } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.8: руководитель одобряет заявку — менеджера выбирает; без выбора отказ; менеджеру письмо', async () => {
    const leadId = await lead('a');
    await assert.rejects(
      projects.approveLead(head(), { leadId, serviceTypeId: ids.type!, managerId: '', title: `Работа А ${stamp}` }),
      /Выберите менеджера/u,
    );
    const project = await projects.approveLead(head(), {
      leadId,
      serviceTypeId: ids.type!,
      managerId: ids.first!,
      title: `Работа А ${stamp}`,
    });
    created.push(project.id);
    ids.project = project.id;
    ids.code = project.code;
    assert.equal(project.managerId, ids.first);
    const [letter] = await outbox(ids.first!, 'CURATOR_ASSIGNED');
    assert.ok(letter !== undefined, 'менеджеру нет письма');
    assert.match(letter.body, /«Моих работах»/u);
    assert.doesNotMatch(letter.body, /Работы практики/u);
  });

  it('менеджер, одобривший заявку, ведёт работу сам (Р-149)', async () => {
    const leadId = await lead('b');
    const project = await projects.approveLead(second(), {
      leadId,
      serviceTypeId: ids.type!,
      managerId: ids.first!,
      title: `Работа Б ${stamp}`,
    });
    created.push(project.id);
    assert.equal(project.managerId, ids.second);
  });

  it('H.9: передача без причины — отказ; с причиной — работа ушла от прежнего, четыре письма', async () => {
    await projects.assignExpert(head(), ids.project!, ids.curator!);
    await assert.rejects(projects.assignManager(head(), ids.project!, ids.second!, '  '), /причину передачи/u);
    await projects.assignManager(head(), ids.project!, ids.second!, 'Первый менеджер в отпуске');

    const before = await listProjects(first(), { filter: 'all' });
    assert.ok(!before.rows.some((row) => row.id === ids.project), 'работа осталась у прежнего менеджера');
    const after = await listProjects(second(), { filter: 'all' });
    assert.ok(after.rows.some((row) => row.id === ids.project));

    const project = await prisma.project.findUniqueOrThrow({ where: { id: ids.project }, select: { client: { select: { userId: true } } } });
    const [toNew] = await outbox(ids.second!, 'CURATOR_ASSIGNED');
    const [toOld] = await outbox(ids.first!, 'WORK_TRANSFERRED');
    const [toCurator] = await outbox(ids.curator!, 'MANAGER_CHANGED');
    const [toClient] = await outbox(project.client.userId!, 'CURATOR_CHANGED');
    for (const [name, row] of Object.entries({ toNew, toOld, toCurator, toClient })) {
      assert.ok(row !== undefined, `нет письма: ${name}`);
    }
    assert.match(toOld!.body, /Второй Менеджер: Первый менеджер в отпуске/u);
    assert.match(toCurator!.body, /Второй Менеджер/u);
    assert.match(toClient!.subject, /Сменился менеджер работы/u);
    assert.doesNotMatch(toClient!.body, /Менеджер Передачи|Первый|Второй|отпуске/u, 'имена или причина в письме клиенту');

    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId: ids.project, kind: 'MANAGER_ASSIGNED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.deepEqual(
      { by: (event.payload as Record<string, unknown>).by, to: (event.payload as Record<string, unknown>).to, reason: (event.payload as Record<string, unknown>).reason },
      { by: 'Руководитель Передачи', to: 'Второй Менеджер', reason: 'Первый менеджер в отпуске' },
    );
  });

  it('закрытую работу передавать можно (ОМ-20)', async () => {
    await prisma.project.update({ where: { id: ids.project }, data: { status: 'COMPLETED' } });
    await projects.assignManager(head(), ids.project!, ids.first!, 'Закрывающие документы ведёт первый');
    const row = await prisma.project.findUniqueOrThrow({ where: { id: ids.project }, select: { managerId: true } });
    assert.equal(row.managerId, ids.first);
  });

  it('две передачи одновременно: проходит одна, цепочка истории без разрыва (Р-464)', async () => {
    const since = new Date();
    const results = await Promise.allSettled([
      projects.assignManager(head(), ids.project!, ids.second!, 'Передача из первой вкладки'),
      projects.assignManager(head(), ids.project!, ids.head!, 'Передача из второй вкладки'),
    ]);
    const passed = results.filter((result) => result.status === 'fulfilled').length;
    for (const result of results) {
      if (result.status === 'rejected') assert.match(String(result.reason), /уже сменили/u);
    }
    const events = await prisma.projectEvent.findMany({
      where: { projectId: ids.project, kind: 'MANAGER_ASSIGNED', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(events.length, passed, 'событий передачи больше, чем прошедших передач');
    // Каждая передача начинается с того, кем работа кончилась предыдущей.
    let holder: unknown = ids.first;
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      assert.equal(payload.from, holder, 'передача от менеджера, у которого работы уже не было');
      holder = payload.managerId;
    }
  });

  it('ручной заказ руководителя на другого менеджера — тому письмо', async () => {
    const order = await createManualOrder(head(), {
      customer: `Заказчик Передачи ${stamp}`,
      serviceTypeId: ids.type!,
      title: `Ручной заказ ${stamp}`,
      managerId: ids.second!,
    });
    created.push(order.projectId);
    const letters = await outbox(ids.second!, 'CURATOR_ASSIGNED');
    assert.ok(letters.some((row) => row.projectId === order.projectId), 'нет письма о ручном заказе');
  });
  it('УР-07: все действующие работы менеджера — другому одной причиной; завершённые остаются (Р-397)', async () => {
    const order = async (suffix: string, status: 'ACTIVE' | 'PAUSED' | 'COMPLETED') => {
      const made = await createManualOrder(head(), {
        customer: `Передачин Клиент ${suffix} ${stamp}`,
        serviceTypeId: ids.type!,
        title: `Массовая ${suffix} ${stamp}`,
        orderedOn: new Date('2026-09-01T00:00:00Z'),
        cost: 0n,
        paid: 0n,
        managerId: ids.first!,
        status,
      });
      created.push(made.projectId);
      return made.projectId;
    };
    const [live, paused, done] = [await order('A', 'ACTIVE'), await order('P', 'PAUSED'), await order('D', 'COMPLETED')];
    await assert.rejects(projects.transferAllWorks(first(), ids.first!, ids.second!, 'Отпуск'), /только руководитель/u);
    await assert.rejects(projects.transferAllWorks(head(), ids.first!, ids.second!, '  '), /причину/u);
    const result = await projects.transferAllWorks(head(), ids.first!, ids.second!, 'Уход в отпуск');
    assert.equal(result.failed, null);
    assert.ok(result.moved >= 2);
    const owner = async (id: string) => (await prisma.project.findUniqueOrThrow({ where: { id } })).managerId;
    assert.equal(await owner(live), ids.second);
    assert.equal(await owner(paused), ids.second);
    assert.equal(await owner(done), ids.first, 'завершённая работа передана');
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: live, kind: 'MANAGER_ASSIGNED' } });
    assert.equal((event.payload as { reason?: string }).reason, 'Уход в отпуск');
  });
});
