/**
 * Этапы и работы на настоящей базе (решение Р-240): этапы закрытой работы
 * не меняются и сводку не занимают, срок «сегодня» не сорван, два
 * одновременных перевода этапа и два одобрения заявки не проходят оба,
 * сроки шаблона идут подряд, эксперт назначается только действующий,
 * перенос срока попадает в журнал.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

const DAY = 86_400_000;

describe('этапы и работы', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { pendingActions, trafficLight } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const leadIds: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const curator = () => who(ids.manager!, 'MANAGER');

  const today = () => {
    const at = new Date();
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  };

  const newProject = async (suffix: string, status = 'ACTIVE') => {
    const project = await prisma.project.create({
      data: {
        code: `PD-SG-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        status: status as never,
      },
    });
    projectIds.push(project.id);
    return project.id;
  };

  const newLead = async (contact: string) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact,
        name: 'Заявитель Гонки',
        consentGiven: true,
        consentVersion: 'test',
      },
    });
    leadIds.push(lead.id);
    return lead.id;
  };

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `sg-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `sg-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const idle = await prisma.user.create({
      data: {
        email: `sg-idle-${stamp}@example.org`,
        fullName: 'Приостановленный',
        role: 'EXPERT',
        status: 'SUSPENDED',
      },
    });
    const type = await prisma.serviceType.create({
      data: { code: `sg-${stamp}`, name: 'Проверка этапов' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Клиент', normalizedName: `sg клиент ${stamp}` },
    });
    Object.assign(ids, {
      manager: manager.id,
      expert: expert.id,
      idle: idle.id,
      type: type.id,
      client: client.id,
    });
  });

  after(async () => {
    const created = await prisma.project.findMany({
      where: { OR: [{ id: { in: projectIds } }, { serviceTypeId: ids.type }] },
      select: { id: true, clientId: true },
    });
    const all = created.map((project) => project.id);
    const stages = await prisma.stage.findMany({ where: { projectId: { in: all } } });
    await prisma.stageStateChange.deleteMany({
      where: { stageId: { in: stages.map((s) => s.id) } },
    });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: all } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: all } } });
    await prisma.auditEvent.deleteMany({ where: { objectId: { in: leadIds } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: all } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: all } } });
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { projectId: null } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.project.deleteMany({ where: { id: { in: all } } });
    const clients = [...new Set([ids.client!, ...created.map((p) => p.clientId)])];
    const profiles = await prisma.clientProfile.findMany({
      where: { id: { in: clients } },
      select: { userId: true },
    });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients } } });
    await prisma.stageTemplate.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [
      ids.manager!,
      ids.expert!,
      ids.idle!,
      ...profiles.map((p) => p.userId).filter((id): id is string => id !== null),
    ];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('этапы приостановленной работы не меняются: ни перевод, ни правка, ни новый', async () => {
    const projectId = await newProject('P', 'PAUSED');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Глава 1' },
    });
    await assert.rejects(
      () => projects.setStageState(curator(), stage.id, 'IN_PROGRESS'),
      /не в действии/u,
    );
    await assert.rejects(
      () => projects.editStage(curator(), { stageId: stage.id, title: 'Глава 1, правка' }),
      /не в действии/u,
    );
    await assert.rejects(
      () => projects.addStage(curator(), { projectId, title: 'Глава 2' }),
      /не в действии/u,
    );
    const after = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(after.state, 'NOT_STARTED');
    assert.equal(after.title, 'Глава 1');
  });

  it('этап закрытой работы не держится в сводке и в «сейчас от вас требуется»', async () => {
    const projectId = await newProject('C', 'CANCELLED');
    const stage = await prisma.stage.create({
      data: {
        projectId,
        position: 1,
        title: 'Брошенный',
        state: 'AWAITING_CLIENT',
        dueOn: new Date(today().getTime() - 30 * DAY),
        awaitingClientSince: new Date(Date.now() - 40 * DAY),
      },
    });
    const light = await trafficLight(curator());
    for (const list of [light.overdue, light.soon, light.stalled]) {
      assert.ok(!list.some((row) => row.id === stage.id), 'этап отменённой работы в сводке');
    }
    const pending = await pendingActions(curator());
    assert.ok(!pending.some((row) => row.id === stage.id), 'этап отменённой работы ждёт клиента');
  });

  it('срок «сегодня» не сорван: этап в ближайших, а не в просроченных', async () => {
    const projectId = await newProject('T');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Сегодня', state: 'IN_PROGRESS', dueOn: today() },
    });
    const light = await trafficLight(curator());
    assert.ok(!light.overdue.some((row) => row.id === stage.id), 'срок сегодня назван сорванным');
    assert.ok(light.soon.some((row) => row.id === stage.id), 'срок сегодня не в ближайших');
  });

  it('два одновременных перевода этапа: проходит один, история — одна строка', async () => {
    const projectId = await newProject('R');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Гонка' },
    });
    const results = await Promise.allSettled([
      projects.setStageState(curator(), stage.id, 'IN_PROGRESS'),
      projects.setStageState(curator(), stage.id, 'IN_PROGRESS'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await prisma.stageStateChange.count({ where: { stageId: stage.id } }), 1);
  });

  it('два одновременных одобрения заявки: одна работа, одно приглашение', async () => {
    const leadId = await newLead(`sg-race-${stamp}@example.org`);
    const input = {
      leadId,
      serviceTypeId: ids.type!,
      managerId: ids.manager!,
      title: 'Работа из гонки',
    };
    const results = await Promise.allSettled([
      projects.approveLead(curator(), input),
      projects.approveLead(curator(), input),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const works = await prisma.project.findMany({
      where: { serviceTypeId: ids.type!, title: 'Работа из гонки' },
    });
    assert.equal(works.length, 1);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    assert.equal(lead.projectId, works[0]!.id);
  });

  it('одобрение и отказ одновременно: заявка не бывает отклонённой с работой', async () => {
    const leadId = await newLead(`sg-mixed-${stamp}@example.org`);
    await Promise.allSettled([
      projects.approveLead(curator(), {
        leadId,
        serviceTypeId: ids.type!,
        managerId: ids.manager!,
        title: 'Работа или отказ',
      }),
      projects.declineLead(curator(), leadId, 'Сроки не позволяют.'),
    ]);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status === 'DECLINED') {
      assert.equal(lead.projectId, null, 'отклонённая заявка с работой');
    } else {
      assert.notEqual(lead.projectId, null, 'заявка ни отклонена, ни развёрнута');
    }
  });

  it('сроки шаблона идут подряд от сегодняшнего дня, этап без длительности срока не сдвигает', () => {
    const at = new Date(Date.UTC(2026, 8, 26, 15, 40));
    const rows = projects.templateStages(
      'p',
      [
        { title: 'Первый', durationDays: 10 },
        { title: 'Без срока', durationDays: null },
        { title: 'Второй', durationDays: 20 },
        { title: 'Третий', durationDays: 15 },
      ],
      at,
    );
    const iso = rows.map((row) => row.dueOn?.toISOString().slice(0, 10) ?? null);
    assert.deepEqual(iso, ['2026-10-06', null, '2026-10-26', '2026-11-10']);
    for (const row of rows) {
      if (row.dueOn !== null) assert.equal(row.dueOn.getUTCHours(), 0, 'срок не день');
    }
    assert.deepEqual(
      rows.map((row) => row.position),
      [1, 2, 3, 4],
    );
  });

  it('экспертом назначается только действующий эксперт; повтор без записи', async () => {
    const projectId = await newProject('E');
    await assert.rejects(
      () => projects.assignExpert(curator(), projectId, ids.manager!),
      /действующий эксперт/u,
    );
    await assert.rejects(
      () => projects.assignExpert(curator(), projectId, ids.idle!),
      /действующий эксперт/u,
    );
    await projects.assignExpert(curator(), projectId, ids.expert!);
    await projects.assignExpert(curator(), projectId, ids.expert!);
    assert.equal(
      await prisma.projectEvent.count({ where: { projectId, kind: 'EXPERT_ASSIGNED' } }),
      1,
      'повторное назначение попало в ленту',
    );
    await projects.assignExpert(curator(), projectId, null);
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    assert.equal(saved.expertId, null);
  });

  it('перенос срока этапа и работы попадает в журнал', async () => {
    const projectId = await newProject('D');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Срок', dueOn: new Date('2026-10-01T00:00:00Z') },
    });
    await projects.editStage(curator(), {
      stageId: stage.id,
      title: 'Срок',
      dueOn: new Date('2026-10-15T00:00:00Z'),
    });
    const stageEntry = await prisma.auditEvent.findFirstOrThrow({
      where: { objectId: stage.id, action: 'STAGE_EDITED' },
    });
    assert.deepEqual(stageEntry.payload, {
      from: 'Срок',
      to: 'Срок',
      dueFrom: '2026-10-01',
      dueTo: '2026-10-15',
    });

    await projects.editProject(curator(), { projectId, title: 'Работа D', dueOn: null });
    await projects.editProject(curator(), {
      projectId,
      title: 'Работа D',
      dueOn: new Date('2026-12-01T00:00:00Z'),
    });
    const entries = await prisma.auditEvent.findMany({
      where: { objectId: projectId, action: 'PROJECT_EDITED' },
      orderBy: { occurredAt: 'asc' },
    });
    assert.deepEqual(entries[0]!.payload, { title: 'Работа D' });
    assert.deepEqual(entries[1]!.payload, {
      title: 'Работа D',
      dueFrom: 'без срока',
      dueTo: '2026-12-01',
    });
  });
});
