/**
 * Поручения руководителя (требование РК-19, решение Р-352; решение
 * владельца В-19).
 *
 * Руководитель ставит поручение менеджеру или куратору: текст, срок, по
 * желанию — работа. Исполнитель видит его в делах первого экрана
 * («Сегодня» менеджера, «Назначенные работы» куратора) и сам переводит в
 * «в работе» и «сделано»; руководитель может отозвать. Просроченное
 * поручение видно в трёх местах: дело «Поручение просрочено» у
 * руководителя, колонка «Команды», дело у исполнителя. Уведомления — при
 * постановке, за день до срока и при выполнении. Ставить поручения может
 * только руководитель (`ASSIGNMENT_CREATE`), проверка — здесь, на сервере.
 */

import type { AssignmentStatus } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { can, ensure, type Actor } from './access.ts';
import { formatDay } from './approval-text.ts';
import { record } from './audit.ts';
import { moscowToday, now as clockNow } from './clock.ts';
import { enqueue } from './outbox.ts';
import { dayKey } from './workdays.ts';

const DAY = 86_400_000;
export const ASSIGNMENT_TEXT_MAX = 2000;

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  ASSIGNED: 'поставлено',
  IN_PROGRESS: 'в работе',
  DONE: 'сделано',
  WITHDRAWN: 'отозвано',
};

const OPEN: AssignmentStatus[] = ['ASSIGNED', 'IN_PROGRESS'];

export interface AssignmentInput {
  readonly assigneeId: string;
  readonly text: string;
  readonly dueOn: Date | null;
  readonly projectCode?: string | null;
}

/** Поставить поручение — только руководитель (В-19). */
export async function createAssignment(actor: Actor, input: AssignmentInput): Promise<{ id: string }> {
  ensure(actor, 'ASSIGNMENT_CREATE');
  const text = input.text.replace(/\s+/gu, ' ').trim();
  if (text.length === 0) throw new Error('Опишите поручение');
  if (text.length > ASSIGNMENT_TEXT_MAX) throw new Error(`Поручение — не длиннее ${ASSIGNMENT_TEXT_MAX} знаков`);
  if (input.dueOn === null || Number.isNaN(input.dueOn.getTime())) throw new Error('Укажите срок поручения');
  if (input.dueOn.getTime() < moscowToday().getTime()) throw new Error('Срок поручения — не раньше сегодняшнего дня');
  const assignee = await prisma.user.findFirst({
    where: { id: input.assigneeId, status: 'ACTIVE', role: { in: ['MANAGER', 'EXPERT'] } },
    select: { id: true, role: true, fullName: true },
  });
  if (assignee === null) throw new Error('Поручить можно действующему менеджеру или куратору');
  let projectId: string | null = null;
  let projectCode: string | null = null;
  const code = (input.projectCode ?? '').trim();
  if (code !== '') {
    const project = await prisma.project.findUnique({
      where: { code },
      select: { id: true, code: true, managerId: true, expertId: true },
    });
    if (project === null) throw new Error('Работа с таким кодом не найдена');
    // Исполнитель должен видеть работу: менеджер — свою, куратор — назначенную.
    const sees = assignee.role === 'MANAGER' ? project.managerId === assignee.id : project.expertId === assignee.id;
    if (!sees) throw new Error('Сотрудник не ведёт эту работу и не увидит её');
    projectId = project.id;
    projectCode = project.code;
  }
  const by = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true } });
  const created = await prisma.assignment.create({
    data: { assigneeId: assignee.id, text, dueOn: input.dueOn, projectId, createdById: actor.id },
    select: { id: true },
  });
  await enqueue(prisma, {
    userId: assignee.id,
    projectId,
    eventKind: 'ASSIGNMENT_CREATED',
    subject: `Поручение руководителя до ${formatDay(input.dueOn)}`,
    body: `${by.fullName} поставил поручение до ${formatDay(input.dueOn)}:\n${text}\nОтметить «в работе» и «сделано» можно в кабинете.`,
    dedupKey: `assignment:${created.id}:created`,
    path: '/cabinet/assignments',
  });
  await record(actor, {
    action: 'ASSIGNMENT_CREATED',
    objectType: 'Assignment',
    objectId: created.id,
    projectId,
    payload: { assigneeId: assignee.id, dueOn: dayKey(input.dueOn), project: projectCode },
  });
  return created;
}

const NEXT: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  ASSIGNED: ['IN_PROGRESS', 'DONE', 'WITHDRAWN'],
  IN_PROGRESS: ['DONE', 'WITHDRAWN'],
  DONE: [],
  WITHDRAWN: [],
};

/**
 * Перевести поручение: исполнитель — «в работе» и «сделано», руководитель
 * — «отозвано». Сделанное — письмо поставившему.
 */
export async function setAssignmentStatus(actor: Actor, id: string, status: AssignmentStatus): Promise<void> {
  const row = await prisma.assignment.findUnique({
    where: { id },
    select: { id: true, status: true, assigneeId: true, createdById: true, text: true, projectId: true, assignee: { select: { fullName: true } } },
  });
  if (row === null) throw new Error('Поручение не найдено');
  const own = row.assigneeId === actor.id && actor.status === 'ACTIVE';
  const withdraw = status === 'WITHDRAWN';
  if (withdraw ? !can(actor, 'ASSIGNMENT_CREATE') : !own) throw new Error('Действие не разрешено');
  if (!NEXT[row.status].includes(status)) throw new Error('Поручение уже переведено: обновите страницу');
  const moved = await prisma.assignment.updateMany({
    where: { id, status: row.status },
    data: { status, ...(status === 'DONE' ? { doneAt: clockNow() } : {}) },
  });
  if (moved.count === 0) throw new Error('Поручение уже переведено: обновите страницу');
  if (status === 'DONE' && row.createdById !== null) {
    await enqueue(prisma, {
      userId: row.createdById,
      projectId: row.projectId,
      eventKind: 'ASSIGNMENT_DONE',
      subject: `Поручение выполнено: ${row.assignee.fullName}`,
      body: `${row.assignee.fullName} отметил поручение выполненным:\n${row.text}`,
      dedupKey: `assignment:${id}:done`,
      path: '/cabinet/manage/assignments',
    });
  }
  await record(actor, {
    action: 'ASSIGNMENT_STATUS',
    objectType: 'Assignment',
    objectId: id,
    projectId: row.projectId,
    payload: { from: row.status, to: status },
  });
}

const view = {
  id: true,
  text: true,
  dueOn: true,
  status: true,
  createdAt: true,
  doneAt: true,
  assigneeId: true,
  assignee: { select: { fullName: true, role: true } },
  createdBy: { select: { fullName: true } },
  project: { select: { code: true, title: true } },
} as const;

/**
 * Открытые поручения исполнителя — его дела. Название работы — только
 * пока исполнитель её видит: после смены куратора, передачи работы другому
 * менеджеру или без договора поручения остаётся код, как в письмах куратору
 * без договора (Р-301, решение Р-420).
 */
export async function myAssignments(actor: Actor) {
  if (actor.status !== 'ACTIVE' || (actor.role !== 'MANAGER' && actor.role !== 'EXPERT')) return [];
  const rows = await prisma.assignment.findMany({
    where: { assigneeId: actor.id, status: { in: OPEN } },
    orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
    select: {
      ...view,
      project: { select: { id: true, code: true, title: true, clientId: true, managerId: true, expertId: true } },
    },
  });
  return rows.map(({ project, ...row }) => ({
    ...row,
    project:
      project === null
        ? null
        : { code: project.code, title: can(actor, 'PROJECT_VIEW', project) ? project.title : null },
  }));
}

/** Сколько закрытых поручений показывать руководителю: последние по дате. */
export const CLOSED_ASSIGNMENTS_SHOWN = 500;

/**
 * Все поручения практики — руководителю: открытые сверху, по сроку.
 *
 * Открытые — все, закрытые — последние `CLOSED_ASSIGNMENTS_SHOWN`. Прежде
 * предел стоял на общей выборке по раннему сроку: когда выполненных и
 * отозванных накапливалось больше пятисот, в неё попадали старые
 * закрытые, а новое открытое поручение со сроком через неделю пропадало с
 * экрана (решение Р-535).
 */
export async function allAssignments(actor: Actor) {
  ensure(actor, 'ASSIGNMENT_CREATE');
  const order = [{ dueOn: 'asc' as const }, { createdAt: 'asc' as const }];
  const [open, closed] = await Promise.all([
    prisma.assignment.findMany({ where: { status: { in: OPEN } }, orderBy: order, select: view }),
    prisma.assignment.findMany({
      where: { status: { notIn: OPEN } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: view,
      take: CLOSED_ASSIGNMENTS_SHOWN,
    }),
  ]);
  const byDue = (a: { dueOn: Date; createdAt: Date }, b: { dueOn: Date; createdAt: Date }) =>
    a.dueOn.getTime() - b.dueOn.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
  return [...open, ...closed.sort(byDue)];
}

/** Просроченные поручения — дело руководителя «Поручение просрочено». */
export async function overdueAssignments(actor: Actor, at: Date = clockNow()) {
  if (!can(actor, 'ASSIGNMENT_CREATE')) return [];
  return prisma.assignment.findMany({
    where: { status: { in: OPEN }, dueOn: { lt: moscowToday(at) } },
    orderBy: { dueOn: 'asc' },
    select: view,
  });
}

/** Просрочено ли поручение: срок раньше сегодняшнего дня, поручение открыто. */
export function isAssignmentOverdue(row: { status: AssignmentStatus; dueOn: Date }, at: Date = clockNow()): boolean {
  return OPEN.includes(row.status) && row.dueOn.getTime() < moscowToday(at).getTime();
}

/** Напоминание исполнителю за день до срока — по расписанию, один раз. */
export async function enqueueAssignmentReminders(at: Date = clockNow()): Promise<number> {
  const tomorrow = new Date(moscowToday(at).getTime() + DAY);
  const rows = await prisma.assignment.findMany({
    where: { status: { in: OPEN }, dueOn: { gte: tomorrow, lt: new Date(tomorrow.getTime() + DAY) } },
    select: { id: true, text: true, dueOn: true, assigneeId: true, projectId: true },
  });
  let queued = 0;
  for (const row of rows) {
    queued += await enqueue(prisma, {
      userId: row.assigneeId,
      projectId: row.projectId,
      eventKind: 'ASSIGNMENT_DUE',
      subject: `Завтра срок поручения`,
      body: `Срок поручения — ${formatDay(row.dueOn)}:\n${row.text}`,
      dedupKey: `assignment:${row.id}:due`,
      path: '/cabinet/assignments',
    });
  }
  return queued;
}

/** Открытые и просроченные поручения по исполнителям — колонка «Команды». */
export async function assignmentLoad(actor: Actor, at: Date = clockNow()): Promise<Map<string, { open: number; overdue: number }>> {
  if (!can(actor, 'ASSIGNMENT_CREATE')) return new Map();
  const rows = await prisma.assignment.findMany({
    where: { status: { in: OPEN } },
    select: { assigneeId: true, dueOn: true, status: true },
  });
  const out = new Map<string, { open: number; overdue: number }>();
  for (const row of rows) {
    const cell = out.get(row.assigneeId) ?? { open: 0, overdue: 0 };
    cell.open += 1;
    if (isAssignmentOverdue(row, at)) cell.overdue += 1;
    out.set(row.assigneeId, cell);
  }
  return out;
}
