/**
 * Срок согласования этапа на настоящей базе (требование Т-15, решение
 * Р-290): срок при сдаче, клиент без учётной записи, возврат и повторная
 * сдача, напоминание за рабочий день, автозакрытие при выключенном и
 * включённом переключателе, два одновременных прогона, клиент против
 * автозакрытия, приостановка и возобновление, число дней работы,
 * производственный календарь.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);
// Письма ставятся в очередь, только когда почта настроена (Р-278).
process.env.SMTP_HOST ??= 'smtp.example.org';
process.env.SMTP_FROM ??= 'ProDisser <site@example.org>';

const enabled = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

describe('срок согласования этапа', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const approval = await import('../src/lib/cabinet/approval.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const { enqueueDeadlineReminders } = await import('../src/lib/cabinet/outbox.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');
  const { addWorkdays, workdaysBetween } = await import('../src/lib/cabinet/workdays.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const userIds: string[] = [];
  const profileIds: string[] = [];
  let position = 0;

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const curator = () => who(ids.manager!, 'MANAGER');
  const today = () => moscowToday(new Date());
  const key = (day: Date | null) => day?.toISOString().slice(0, 10) ?? null;

  /** Клиент со своей работой; `account` — есть ли учётная запись. */
  const clientWithWork = async (suffix: string, account = true) => {
    const user = account
      ? await prisma.user.create({
          data: { email: `ad-cl-${suffix}-${stamp}@example.org`, fullName: 'Клиент срока', role: 'CLIENT' },
        })
      : null;
    if (user !== null) userIds.push(user.id);
    const profile = await prisma.clientProfile.create({
      data: {
        fullName: 'Клиент срока',
        normalizedName: `ad срок ${suffix} ${stamp}`,
        userId: user?.id ?? null,
      },
    });
    profileIds.push(profile.id);
    const project = await prisma.project.create({
      data: {
        code: `PD-AD-${tail}-${suffix}`,
        clientId: profile.id,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
      },
    });
    projectIds.push(project.id);
    return {
      projectId: project.id,
      profileId: profile.id,
      owner: user === null ? null : who(user.id, 'CLIENT', { clientProfileId: profile.id }),
    };
  };

  /** Этап с материалом, сданный куратором на согласование. */
  const submit = async (projectId: string) => {
    position += 1;
    const stage = await prisma.stage.create({
      data: { projectId, position, title: `Глава ${position}`, state: 'IN_PROGRESS' },
    });
    await prisma.material.create({
      data: {
        projectId,
        stageId: stage.id,
        title: `Черновик главы ${position}`,
        createdById: ids.manager!,
        versions: {
          create: {
            number: 1,
            storageKey: `approval-deadline/${stage.id}`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'a'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: ids.manager!,
          },
        },
      },
    });
    await projects.setStageState(curator(), stage.id, 'IN_APPROVAL', 'Глава написана; дальше — расчёты');
    return prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
  };

  const expire = (stageId: string) =>
    prisma.stage.update({ where: { id: stageId }, data: { approvalDueOn: new Date(today().getTime() - DAY) } });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `ad-mgr-${stamp}@example.org`, fullName: 'Куратор срока', role: 'MANAGER' },
    });
    const head = await prisma.user.create({
      data: { email: `ad-head-${stamp}@example.org`, fullName: 'Руководитель срока', role: 'HEAD' },
    });
    userIds.push(manager.id, head.id);
    const type = await prisma.serviceType.create({ data: { code: `ad-${stamp}`, name: 'Проверка срока' } });
    Object.assign(ids, { manager: manager.id, head: head.id, type: type.id });
  });

  after(async () => {
    delete process.env.APPROVAL_AUTO_ACCEPT;
    const stages = await prisma.stage.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const stageIds = stages.map((stage) => stage.id);
    await prisma.stageStateChange.deleteMany({ where: { stageId: { in: stageIds } } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: { in: projectIds } } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { objectType: 'CalendarDay', actorId: ids.head } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('сдача ставит срок: пять рабочих дней со следующего дня; дата — в письме', async () => {
    const { projectId } = await clientWithWork('SUB');
    const stage = await submit(projectId);
    const expected = addWorkdays(today(), 5, await approval.loadCalendar());
    assert.equal(key(stage.approvalDueOn), key(expected));
    assert.ok(stage.approvalSentAt !== null);
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, eventKind: 'STAGE_IN_APPROVAL', channel: 'EMAIL' },
    });
    assert.match(letter.body, new RegExp(`до ${approval.formatDay(expected)} включительно`, 'u'));
  });

  it('клиенту без учётной записи срок не ставится; открытый вход запускает срок с письмом', async () => {
    const { projectId, profileId } = await clientWithWork('NOACC', false);
    const stage = await submit(projectId);
    assert.equal(stage.approvalDueOn, null, 'срок без учётной записи клиента');

    const user = await prisma.user.create({
      data: { email: `ad-late-${stamp}@example.org`, fullName: 'Клиент срока', role: 'CLIENT' },
    });
    userIds.push(user.id);
    await prisma.clientProfile.update({ where: { id: profileId }, data: { userId: user.id } });
    assert.ok((await approval.startMissingDeadlines()) >= 1);
    const started = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(key(started.approvalDueOn), key(addWorkdays(today(), 5, await approval.loadCalendar())));
    const letter = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId, userId: user.id, subject: { startsWith: 'Срок согласования этапа' } },
    });
    assert.match(letter.body, /включительно/u);
    await approval.startMissingDeadlines();
    assert.equal(
      await prisma.notificationOutbox.count({
        where: { projectId, userId: user.id, subject: { startsWith: 'Срок согласования этапа' }, channel: 'EMAIL' },
      }),
      1,
      'повторный прогон поставил второй срок',
    );
  });

  it('возврат гасит срок, повторная сдача даёт новый', async () => {
    const { projectId, owner } = await clientWithWork('RET');
    const stage = await submit(projectId);
    await prisma.stage.update({ where: { id: stage.id }, data: { approvalDueOn: new Date(today().getTime() + DAY) } });
    await projects.returnStage(owner!, stage.id, 'Добавьте сравнение с аналогами');
    const returned = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(returned.approvalDueOn, null);
    assert.equal(returned.approvalSentAt, null);
    await projects.setStageState(curator(), stage.id, 'IN_APPROVAL', 'Сравнение добавлено');
    const again = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(key(again.approvalDueOn), key(addWorkdays(today(), 5, await approval.loadCalendar())));
  });

  it('напоминание — за рабочий день до срока и одно; срок этапа на согласовании не напоминается', async () => {
    const { projectId } = await clientWithWork('REM');
    const near = await submit(projectId);
    const far = await submit(projectId);
    const calendar = await approval.loadCalendar();
    await prisma.stage.update({
      where: { id: near.id },
      data: { approvalDueOn: addWorkdays(today(), 1, calendar), dueOn: new Date(today().getTime() + DAY) },
    });
    await approval.enqueueApprovalReminders();
    await approval.enqueueApprovalReminders();
    const soon = await prisma.notificationOutbox.findMany({
      where: { projectId, eventKind: 'DEADLINE_APPROVAL_SOON', channel: 'EMAIL' },
    });
    assert.equal(soon.length, 1, 'напоминание не одно');
    assert.match(soon[0]!.subject, new RegExp(near.title, 'u'));
    assert.doesNotMatch(soon[0]!.subject, new RegExp(`${far.title}$`, 'u'));

    await enqueueDeadlineReminders();
    assert.equal(
      // Клиенту — только срок согласования; куратору о сроке этапа
      // напоминается при любом ходе (М-08, Р-301).
      await prisma.notificationOutbox.count({
        where: { projectId, eventKind: 'DEADLINE_IN_3_DAYS', userId: { not: ids.manager } },
      }),
      0,
      'срок этапа на согласовании напомнил клиенту вторым сроком',
    );
  });

  it('автозакрытие: выключено — этап стоит; включено — закрыт один раз, без автора, с письмами', async () => {
    const { projectId } = await clientWithWork('AUTO');
    const stage = await submit(projectId);
    await expire(stage.id);

    delete process.env.APPROVAL_AUTO_ACCEPT;
    assert.equal(await approval.autoAcceptExpired(), 0);
    assert.equal((await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } })).state, 'IN_APPROVAL');

    process.env.APPROVAL_AUTO_ACCEPT = '1';
    try {
      await Promise.all([approval.autoAcceptExpired(), approval.autoAcceptExpired()]);
    } finally {
      delete process.env.APPROVAL_AUTO_ACCEPT;
    }
    const closed = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(closed.state, 'DONE');
    const changes = await prisma.stageStateChange.findMany({ where: { stageId: stage.id, via: 'AUTO_ACCEPT' } });
    assert.equal(changes.length, 1, 'два прогона закрыли этап дважды');
    assert.equal(changes[0]!.actorId, null);
    assert.equal(changes[0]!.reason, approval.AUTO_ACCEPT_NOTE);
    const event = await prisma.projectEvent.findFirstOrThrow({
      where: { projectId, kind: 'STAGE_STATE_CHANGED', actorId: null },
    });
    assert.equal((event.payload as { reason?: string }).reason, approval.AUTO_ACCEPT_NOTE);
    const letters = await prisma.notificationOutbox.findMany({
      where: { projectId, eventKind: 'STAGE_APPROVED', channel: 'EMAIL' },
      select: { userId: true, body: true },
    });
    assert.equal(letters.length, 2, 'письма клиенту и куратору');
    assert.ok(letters.some((letter) => letter.userId === ids.manager && /п\. 7\.3 оферты/u.test(letter.body)));
    const journal = await prisma.auditEvent.findMany({
      where: { objectId: stage.id, action: 'STAGE_APPROVED' },
    });
    assert.equal(journal.length, 1);
    assert.equal(journal[0]!.actorId, null);
  });

  it('клиент после срока: при включённом автозакрытии — отказ, при выключенном — согласует', async () => {
    const { projectId, owner } = await clientWithWork('LATE');
    const stage = await submit(projectId);
    await expire(stage.id);
    process.env.APPROVAL_AUTO_ACCEPT = '1';
    try {
      await assert.rejects(projects.setStageState(owner!, stage.id, 'DONE'), /Срок согласования истёк/u);
      await assert.rejects(projects.returnStage(owner!, stage.id, 'Поздно'), /этап принят по п\. 7\.3 оферты/u);
    } finally {
      delete process.env.APPROVAL_AUTO_ACCEPT;
    }
    const approved = await projects.setStageState(owner!, stage.id, 'DONE');
    assert.equal(approved.state, 'DONE');
  });

  it('приостановка хранит остаток рабочих дней, возобновление даёт срок от дня возобновления', async () => {
    const { projectId } = await clientWithWork('PAUSE');
    const stage = await submit(projectId);
    const calendar = await approval.loadCalendar();
    const left = workdaysBetween(new Date(today().getTime() + DAY), stage.approvalDueOn!, calendar);

    await projects.setProjectStatus(curator(), projectId, 'PAUSED', 'Ждём выписку из протокола кафедры');
    const held = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(held.approvalDueOn, null, 'срок не снят на паузе');
    assert.equal(held.approvalDaysLeft, left);

    await projects.setProjectStatus(curator(), projectId, 'ACTIVE');
    const resumed = await prisma.stage.findUniqueOrThrow({ where: { id: stage.id } });
    assert.equal(resumed.approvalDaysLeft, null);
    assert.equal(key(resumed.approvalDueOn), key(addWorkdays(today(), left, calendar)));
  });

  it('число дней работы — от 5 до 20 и действует со следующей сдачи', async () => {
    const { projectId } = await clientWithWork('DAYS');
    const edit = (approvalDays: number) =>
      projects.editProject(curator(), { projectId, title: 'Работа DAYS', approvalDays });
    await assert.rejects(edit(4), /от 5 до 20/u);
    await assert.rejects(edit(21), /от 5 до 20/u);
    await edit(10);
    const stage = await submit(projectId);
    assert.equal(key(stage.approvalDueOn), key(addWorkdays(today(), 10, await approval.loadCalendar())));
  });

  it('производственный календарь правит руководитель', async () => {
    const day = new Date('2031-06-07T00:00:00Z');
    await assert.rejects(admin.saveCalendarDay(curator(), { day, workday: true }), /не разрешено/u);
    const head = who(ids.head!, 'HEAD');
    await admin.saveCalendarDay(head, { day, workday: true, note: 'Рабочая суббота' });
    const listed = await admin.listCalendarDays(head);
    assert.ok(listed.some((entry) => key(entry.day) === '2031-06-07' && entry.workday));
    assert.equal((await approval.loadCalendar()).get('2031-06-07'), true);
    await admin.removeCalendarDay(head, '2031-06-07');
    await assert.rejects(admin.removeCalendarDay(head, '2031-06-07'), /уже снят/u);
    assert.equal((await approval.loadCalendar()).has('2031-06-07'), false);
  });
});
