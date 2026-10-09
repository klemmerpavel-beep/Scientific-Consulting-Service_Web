/**
 * Поручения руководителя (требование РК-19, решение Р-352; В-19): ставит
 * только руководитель; исполнитель должен вести работу поручения; при
 * постановке — уведомление исполнителю; поручение — в делах исполнителя;
 * просроченное — дело руководителя и колонка «Команды»; исполнитель
 * переводит «в работе» и «сделано», чужой — нет; сделанное — уведомление
 * руководителю; руководитель отзывает; напоминание за день до срока — один
 * раз.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'b'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('поручения руководителя (РК-19)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const assignments = await import('../src/lib/cabinet/assignments.ts');
  const { attentionParts, attentionSources } = await import('../src/lib/cabinet/attention.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const today = () => new Date(Math.floor((Date.now() + 3 * 3_600_000) / DAY) * DAY);
  const outbox = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, eventKind, channel: 'EMAIL' } });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `as-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, otherUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Поручений'),
      make('mgr', 'MANAGER', 'Менеджер Поручений'),
      make('oth', 'MANAGER', 'Другой Менеджер Поручений'),
      make('cur', 'EXPERT', 'Куратор Поручений'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент Поручений', normalizedName: `as клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `as-${stamp}`, name: 'Проверка поручений' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-AS-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа поручений',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      other: otherUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.other!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.assignment.deleteMany({ where: { assigneeId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('ставит только руководитель; исполнитель должен вести работу поручения', async () => {
    const input = { assigneeId: ids.manager!, text: 'Позвонить клиенту', dueOn: new Date(today().getTime() + 3 * DAY) };
    await assert.rejects(assignments.createAssignment(manager(), input), AccessDenied);
    await assert.rejects(assignments.createAssignment(head(), { ...input, assigneeId: ids.other!, projectCode: ids.code }), /не ведёт эту работу/u);
    await assert.rejects(assignments.createAssignment(head(), { ...input, dueOn: new Date(today().getTime() - DAY) }), /не раньше сегодняшнего/u);
    const { id } = await assignments.createAssignment(head(), { ...input, projectCode: ids.code });
    ids.first = id;
    const [letter] = await outbox(ids.manager!, 'ASSIGNMENT_CREATED');
    assert.ok(letter !== undefined, 'исполнителю нет уведомления');
    assert.match(letter.body, /Позвонить клиенту/u);
    const curatorTask = await assignments.createAssignment(head(), { ...input, assigneeId: ids.curator!, projectCode: ids.code, text: 'Сдать главу' });
    ids.curatorTask = curatorTask.id;
  });

  it('поручение — в делах исполнителя («Сегодня» менеджера, первый экран куратора)', async () => {
    assert.ok((await assignments.myAssignments(manager())).some((row) => row.id === ids.first));
    assert.ok((await assignments.myAssignments(curator())).some((row) => row.id === ids.curatorTask));
    const parts = attentionParts(await attentionSources(manager()));
    assert.ok(parts.assignment.some((row) => row.id === ids.first));
  });

  it('название работы — пока исполнитель её видит; потом — код (Р-420)', async () => {
    const titleOf = async (actor: Actor, id: string) =>
      (await assignments.myAssignments(actor)).find((row) => row.id === id)?.project;
    assert.deepEqual(await titleOf(curator(), ids.curatorTask!), { code: ids.code, title: 'Работа поручений' });
    await prisma.project.update({ where: { id: ids.project }, data: { expertId: null, managerId: ids.other! } });
    try {
      assert.deepEqual(await titleOf(curator(), ids.curatorTask!), { code: ids.code, title: null });
      assert.deepEqual(await titleOf(manager(), ids.first!), { code: ids.code, title: null });
    } finally {
      await prisma.project.update({ where: { id: ids.project }, data: { expertId: ids.curator!, managerId: ids.manager! } });
    }
    const unsigned: Actor = { ...curator(), expertNdaSignedAt: null };
    assert.deepEqual(await titleOf(unsigned, ids.curatorTask!), { code: ids.code, title: null });
  });

  it('просроченное — дело руководителя и колонка «Команды»', async () => {
    await prisma.assignment.update({ where: { id: ids.first }, data: { dueOn: new Date(today().getTime() - 2 * DAY) } });
    const parts = attentionParts(await attentionSources(head()));
    assert.ok(parts.assignmentOverdue.some((row) => row.id === ids.first));
    const load = await assignments.assignmentLoad(head());
    assert.deepEqual(load.get(ids.manager!), { open: 1, overdue: 1 });
    assert.equal((await assignments.assignmentLoad(manager())).size, 0, 'менеджеру — загрузка по поручениям');
  });

  it('исполнитель переводит «в работе» и «сделано»; чужой — нет; сделанное — уведомление руководителю', async () => {
    await assert.rejects(assignments.setAssignmentStatus(who(ids.other!, 'MANAGER'), ids.first!, 'DONE'), /не разрешено/u);
    await assignments.setAssignmentStatus(manager(), ids.first!, 'IN_PROGRESS');
    await assignments.setAssignmentStatus(manager(), ids.first!, 'DONE');
    await assert.rejects(assignments.setAssignmentStatus(manager(), ids.first!, 'DONE'), /уже переведено/u);
    const [done] = await outbox(ids.head!, 'ASSIGNMENT_DONE');
    assert.ok(done !== undefined, 'руководителю нет уведомления о выполнении');
    assert.equal((await assignments.myAssignments(manager())).length, 0);
  });

  it('руководитель отзывает; исполнитель отозвать не может', async () => {
    await assert.rejects(assignments.setAssignmentStatus(curator(), ids.curatorTask!, 'WITHDRAWN'), /не разрешено/u);
    await assignments.setAssignmentStatus(head(), ids.curatorTask!, 'WITHDRAWN');
    const row = await prisma.assignment.findUniqueOrThrow({ where: { id: ids.curatorTask } });
    assert.equal(row.status, 'WITHDRAWN');
  });

  it('открытое поручение видно руководителю и за пятьюстами закрытыми (Р-535)', async () => {
    // Закрытые не удаляются и копятся; прежде предел стоял на общей
    // выборке по раннему сроку, и старые закрытые вытесняли новое открытое.
    await prisma.assignment.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        assigneeId: ids.other!,
        text: `Давнее поручение ${index}`,
        dueOn: new Date(Date.UTC(1990, 0, 1) + index * DAY),
        status: 'DONE' as const,
        createdById: ids.head!,
      })),
    });
    const { id } = await assignments.createAssignment(head(), {
      assigneeId: ids.other!,
      text: 'Свежее поручение',
      dueOn: new Date(today().getTime() + 7 * DAY),
    });
    const rows = await assignments.allAssignments(head());
    assert.ok(rows.some((row) => row.id === id), 'новое открытое поручение пропало с экрана');
    const firstClosed = rows.findIndex((row) => row.status !== 'ASSIGNED' && row.status !== 'IN_PROGRESS');
    assert.ok(rows.slice(firstClosed).every((row) => row.status !== 'ASSIGNED' && row.status !== 'IN_PROGRESS'), 'открытые не сверху');
    await prisma.assignment.updateMany({ where: { id }, data: { status: 'WITHDRAWN' } });
  });

  it('напоминание за день до срока — один раз', async () => {
    const { id } = await assignments.createAssignment(head(), {
      assigneeId: ids.manager!,
      text: 'Подготовить отчёт',
      dueOn: new Date(today().getTime() + DAY),
    });
    await assignments.enqueueAssignmentReminders();
    await assignments.enqueueAssignmentReminders();
    const reminders = (await outbox(ids.manager!, 'ASSIGNMENT_DUE')).filter((row) => row.dedupKey.startsWith(`assignment:${id}:`));
    assert.equal(reminders.length, 1);
  });
});
