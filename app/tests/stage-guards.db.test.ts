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
  const { pendingActions, returnedStages, trafficLight } = await import('../src/lib/cabinet/queries.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

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

  // «Сегодня» — московский день, как у сводки: с 21:00 до полуночи UTC
  // UTC-день уже вчерашний, и срок «сегодня» по нему считался бы
  // сорванным (решение Р-257).
  const today = () => moscowToday();

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
    for (const list of [light.overdue, light.stalled]) {
      assert.ok(!list.some((row) => row.id === stage.id), 'этап отменённой работы в сводке');
    }
    const pending = await pendingActions(curator());
    assert.ok(!pending.some((row) => row.id === stage.id), 'этап отменённой работы ждёт клиента');
  });

  it('срок «сегодня» не сорван (полоса ближайших снята — УР-02, Р-386)', async () => {
    const projectId = await newProject('T');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Сегодня', state: 'IN_PROGRESS', dueOn: today() },
    });
    const light = await trafficLight(curator());
    assert.ok(!light.overdue.some((row) => row.id === stage.id), 'срок сегодня назван сорванным');
    assert.equal('soon' in light, false);
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
      /действующий сотрудник с ролью куратора/u,
    );
    await assert.rejects(
      () => projects.assignExpert(curator(), projectId, ids.idle!),
      /действующий сотрудник с ролью куратора/u,
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

  it('УМ-11: правка этапа по устаревшей форме не затирает чужую (Р-360)', async () => {
    const projectId = await newProject('U');
    const stage = await prisma.stage.create({ data: { projectId, position: 1, title: 'Глава' } });
    const seen = stage.updatedAt.toISOString();
    // Первый сохранил правку по открытой форме.
    await projects.editStage(curator(), { stageId: stage.id, title: 'Глава, правка первого', updatedAt: seen });
    // Второй открыл форму тогда же — его правка отклоняется.
    await assert.rejects(
      projects.editStage(curator(), { stageId: stage.id, title: 'Глава, правка второго', updatedAt: seen }),
      /уже изменён другим действием/u,
    );
    assert.equal((await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } })).title, 'Глава, правка первого');
  });

  it('МП-05: подсказка о переносе — дни ожидания клиента и срок до (Р-381)', async () => {
    const { stageClientWait } = await import('../src/lib/cabinet/queries.ts');
    const projectId = await newProject('W');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Ждёт', state: 'IN_PROGRESS', dueOn: new Date('2026-11-01T00:00:00Z') },
    });
    const at = (iso: string) => new Date(iso);
    await prisma.stageStateChange.createMany({
      data: [
        { stageId: stage.id, toState: 'AWAITING_CLIENT', createdAt: at('2026-10-01T09:00:00Z') },
        { stageId: stage.id, toState: 'IN_PROGRESS', createdAt: at('2026-10-05T09:00:00Z') },
      ],
    });
    const waited = await stageClientWait(curator(), stage.id, at('2026-10-06T09:00:00Z'));
    assert.equal(waited.days, 4);
    assert.equal(waited.until?.toISOString().slice(0, 10), '2026-11-05');
  });

  it('УМ-12: перенос срока работы — с причиной, в истории и письмом клиенту (Р-391)', async () => {
    const { projectId } = await clientWithWork('WDUE');
    const title = 'Работа со сроком';
    // Первый срок — без причины.
    await projects.editProject(curator(), { projectId, title, dueOn: new Date('2026-12-01T00:00:00Z') });
    await assert.rejects(
      projects.editProject(curator(), { projectId, title, dueOn: new Date('2026-12-20T00:00:00Z') }),
      /с причиной/u,
    );
    await projects.editProject(curator(), {
      projectId,
      title,
      dueOn: new Date('2026-12-20T00:00:00Z'),
      reason: 'Диссовет перенёс заседание',
    });
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId, kind: 'PROJECT_DUE_CHANGED' } });
    assert.deepEqual(event.payload, { dueFrom: '2026-12-01', dueTo: '2026-12-20', reason: 'Диссовет перенёс заседание' });
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, eventKind: 'PROJECT_DUE_CHANGED', channel: 'EMAIL' },
    });
    assert.match(letter.body, /^Работа «/u);
    assert.match(letter.body, /Причина: Диссовет перенёс заседание/u);
  });

  it('перенос срока этапа и работы попадает в журнал', async () => {
    const projectId = await newProject('D');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Срок', dueOn: new Date('2026-10-01T00:00:00Z') },
    });
    // Смена срока на карточке — с причиной (М-15, Р-302).
    await assert.rejects(
      projects.editStage(curator(), { stageId: stage.id, title: 'Срок', dueOn: new Date('2026-10-15T00:00:00Z') }),
      /с причиной/u,
    );
    await projects.editStage(curator(), {
      stageId: stage.id,
      title: 'Срок',
      dueOn: new Date('2026-10-15T00:00:00Z'),
      reason: 'Ждём данные эксперимента',
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
  /** Клиент с учётной записью и своей работой: автор перехода — настоящий человек. */
  const clientWithWork = async (suffix: string) => {
    const user = await prisma.user.create({
      data: { email: `sg-cl-${suffix}-${stamp}@example.org`, fullName: 'Клиент возврата', role: 'CLIENT' },
    });
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент возврата', normalizedName: `sg возврат ${suffix} ${stamp}`, userId: user.id },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-SG-${tail}-${suffix}`,
        clientId: profile.id,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
      },
    });
    projectIds.push(project.id);
    return { projectId: project.id, owner: who(user.id, 'CLIENT', { clientProfileId: profile.id }) };
  };

  it('перенос срока с экрана этапа: только срок, с причиной, письма клиенту и эксперту (М-15, Р-302)', async () => {
    const { projectId, owner } = await clientWithWork('DUE');
    await prisma.expertProfile.upsert({
      where: { userId: ids.expert! },
      create: { userId: ids.expert!, ndaSignedAt: new Date('2026-01-01T00:00:00Z') },
      update: { ndaSignedAt: new Date('2026-01-01T00:00:00Z') },
    });
    await prisma.project.update({ where: { id: projectId }, data: { expertId: ids.expert! } });
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Глава 4', state: 'IN_PROGRESS', dueOn: new Date('2026-11-01T00:00:00Z') },
    });
    // Название, изменённое в другом окне, перенос срока не откатывает.
    await prisma.stage.update({ where: { id: stage.id }, data: { title: 'Глава 4, новая редакция' } });
    const move = (dueOn: Date | null, reason: string) =>
      projects.rescheduleStage(curator(), { stageId: stage.id, dueOn, reason });
    await assert.rejects(move(new Date('2026-11-15T00:00:00Z'), ' '), /с причиной/u);
    await assert.rejects(move(null, 'Без даты'), /Укажите новый срок/u);
    await assert.rejects(move(new Date('2026-11-01T00:00:00Z'), 'Тот же'), /совпадает/u);
    await move(new Date('2026-11-15T00:00:00Z'), 'Ждём ответ рецензента');
    const saved = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(saved.title, 'Глава 4, новая редакция');
    assert.equal(saved.dueOn?.toISOString().slice(0, 10), '2026-11-15');
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId, kind: 'STAGE_DUE_CHANGED' } });
    assert.deepEqual(event.payload, {
      stageId: stage.id,
      dueFrom: '2026-11-01',
      dueTo: '2026-11-15',
      reason: 'Ждём ответ рецензента',
    });
    const toClient = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, userId: owner.id, eventKind: 'STAGE_DUE_CHANGED', channel: 'EMAIL' },
    });
    assert.match(toClient.body, /Причина: Ждём ответ рецензента/u);
    assert.ok(
      (await prisma.notificationOutbox.count({
        where: { projectId, userId: ids.expert!, eventKind: 'STAGE_DUE_CHANGED' },
      })) >= 1,
      'эксперт этапа в работе не узнал о переносе',
    );
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { objectId: stage.id, action: 'STAGE_EDITED' } });
    assert.doesNotMatch(JSON.stringify(journal.payload), /рецензента/u, 'причина ушла в журнал');
  });

  it('клиент возвращает этап с замечаниями; повторная сдача гасит пометку (Р-281)', async () => {
    const { projectId, owner } = await clientWithWork('RET');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Глава 1', state: 'IN_APPROVAL' },
    });

    await assert.rejects(projects.returnStage(owner, stage.id, '   '), /Без замечаний этап не возвращается/u);
    await assert.rejects(projects.returnStage(curator(), stage.id, 'Переделать'), /не разрешено/u);

    await projects.returnStage(owner, stage.id, 'Нет сравнения с методом Монте-Карло; звоните +7 900 000-00-00');
    const returned = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(returned.state, 'IN_PROGRESS');
    assert.ok(returned.returnedAt !== null, 'пометка возврата не поставлена');
    const change = await prisma.stageStateChange.findFirstOrThrow({
      where: { stageId: stage.id, via: 'CLIENT_RETURN' },
    });
    assert.equal(change.contactHint, true, 'контакт в замечаниях не помечен');
    assert.match(change.reason ?? '', /Монте-Карло/u);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId, kind: 'STAGE_RETURNED' } });
    assert.equal((event.payload as { changeId?: string }).changeId, change.id);
    // Куратору — сигнал без текста замечаний (Т-16, Р-282).
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, userId: ids.manager!, eventKind: 'STAGE_RETURNED', channel: 'EMAIL' },
    });
    assert.doesNotMatch(letter.body, /Монте-Карло/u, 'текст замечаний ушёл в письмо');

    await assert.rejects(projects.returnStage(owner, stage.id, 'Ещё раз'), /уже не на согласовании/u);

    // Дело куратора «Клиент вернул этап» — до отметки (М-04, Р-283).
    const before = await returnedStages(curator());
    assert.ok(before.some((row) => row.id === stage.id), 'возврат не стал делом куратора');
    const expertActor = who(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date() });
    await assert.rejects(projects.acknowledgeReturn(expertActor, stage.id));
    await projects.acknowledgeReturn(curator(), stage.id);
    const after = await returnedStages(curator());
    assert.equal(after.some((row) => row.id === stage.id), false, 'дело не ушло после отметки');

    // Повторная сдача: этап снова на согласовании, пометка снята.
    const material = await prisma.material.create({
      data: { projectId, stageId: stage.id, title: 'Глава 1, вторая редакция', createdById: ids.manager! },
    });
    await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey: `sg-return-${stamp}`,
        originalName: 'glava1.docx',
        sizeBytes: 10n,
        sha256: '0'.repeat(64),
        contentType: 'application/octet-stream',
        uploadedById: ids.manager!,
      },
    });
    await projects.setStageState(curator(), stage.id, 'IN_APPROVAL', 'Замечания учтены: добавлено сравнение');
    const resubmitted = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(resubmitted.returnedAt, null, 'пометка возврата пережила повторную сдачу');
    // Итог сдачи — в поле этапа и в письме клиенту (Т-14, Р-289).
    assert.equal(resubmitted.outcome, 'Замечания учтены: добавлено сравнение');
    const ready = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, userId: owner.id, eventKind: 'STAGE_IN_APPROVAL', channel: 'EMAIL' },
    });
    assert.match(ready.body, /Замечания учтены: добавлено сравнение/u, 'итог не ушёл в письмо');
    // Итог правит куратор, не снимая этап с согласования; клиент — нет.
    await assert.rejects(projects.editStageOutcome(owner, stage.id, 'Иначе'), /не разрешено/u);
    await assert.rejects(projects.editStageOutcome(curator(), stage.id, '  '), /не может быть пустым/u);
    await projects.editStageOutcome(curator(), stage.id, 'Сравнение добавлено; дальше — глава 2');
    const edited = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(edited.state, 'IN_APPROVAL');
    assert.equal(edited.outcome, 'Сравнение добавлено; дальше — глава 2');
  });

  it('УМ-03: согласование уже переведённого этапа — причина в состоянии, а не в правах (Р-361)', async () => {
    const { projectId, owner } = await clientWithWork('MOV');
    const stage = await prisma.stage.create({ data: { projectId, position: 1, title: 'Глава 3', state: 'IN_PROGRESS' } });
    await assert.rejects(projects.setStageState(owner, stage.id, 'DONE'), /уже не на согласовании/u);
    // Чужой клиент по-прежнему получает отказ в доступе, а не сведения об этапе.
    const stranger = await clientWithWork('MOV2');
    await assert.rejects(projects.setStageState(stranger.owner, stage.id, 'DONE'), /не разрешено/u);
  });

  it('согласование клиентом отмечается способом перехода (Р-281)', async () => {
    const { projectId, owner } = await clientWithWork('APR');
    const stage = await prisma.stage.create({
      data: { projectId, position: 1, title: 'Глава 2', state: 'IN_APPROVAL' },
    });
    await projects.setStageState(owner, stage.id, 'DONE');
    const change = await prisma.stageStateChange.findFirstOrThrow({ where: { stageId: stage.id } });
    assert.equal(change.via, 'CLIENT_APPROVE');
    const letters = await prisma.notificationOutbox.count({
      where: { projectId, userId: ids.manager!, eventKind: 'STAGE_APPROVED' },
    });
    assert.ok(letters >= 1, 'куратор не узнал о согласовании (Т-16)');

    // Согласовав этап сам, куратор письма себе не получает.
    const second = await prisma.stage.create({
      data: { projectId, position: 2, title: 'Глава 3', state: 'IN_APPROVAL' },
    });
    // За клиента — только с основанием (М-12, О-6, Р-292).
    await assert.rejects(projects.setStageState(curator(), second.id, 'DONE'), /только с основанием/u);
    await assert.rejects(projects.setStageState(curator(), second.id, 'DONE', '   '), /только с основанием/u);
    await projects.setStageState(curator(), second.id, 'DONE', 'Клиент подтвердил письмом 02.10');
    const own = await prisma.notificationOutbox.count({
      where: { projectId, userId: ids.manager!, eventKind: 'STAGE_APPROVED', body: { contains: 'Глава 3' } },
    });
    assert.equal(own, 0, 'куратору пришло письмо о собственном действии');
    const forClient = await prisma.stageStateChange.findFirstOrThrow({ where: { stageId: second.id } });
    assert.equal(forClient.via, 'STAFF_FOR_CLIENT');
    assert.equal(forClient.reason, 'Клиент подтвердил письмом 02.10');
    // Клиент получает письмо с основанием.
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, userId: owner.id, eventKind: 'STAGE_APPROVED', channel: 'EMAIL' },
    });
    assert.match(letter.body, /согласован менеджером по вашему подтверждению: Клиент подтвердил письмом 02\.10/u);
    // История различает способ согласования.
    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId, kind: 'STAGE_STATE_CHANGED', payload: { path: ['stageId'], equals: second.id } },
    });
    assert.equal((event.payload as { via?: string }).via, 'STAFF_FOR_CLIENT');
  });
});
