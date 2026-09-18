import { prisma } from '../db.ts';
import { ensure, scopeProjects, type Actor } from './access.ts';
import { hasContacts } from './contacts.ts';
import { projectRef } from './projects.ts';

/**
 * Переписка «клиент — менеджер». Канал один: эксперт высказывается
 * комментариями к версиям после модерации, и прямого выхода на клиента у
 * него нет — это и есть технический барьер против переманивания.
 *
 * Переписка во внешние каналы не дублируется: кабинет сам является каналом,
 * а письмо с содержанием сообщения вынесло бы его за пределы контура.
 */

export async function listMessages(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return [];
  ensure(actor, 'MESSAGE_READ', ref);
  return prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, fullName: true, role: true } } },
  });
}

export async function sendMessage(actor: Actor, projectId: string, body: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'MESSAGE_WRITE', ref);

  const text = body.trim();
  if (text.length === 0) throw new Error('Пустое сообщение не отправляется');

  return prisma.message.create({
    data: {
      projectId,
      authorId: actor.id,
      body: text,
      containsContactHint: hasContacts(text),
    },
  });
}

/**
 * Непрочитанное — это сообщения, написанные не этой стороной. Отметка стоит
 * на самом сообщении, а не на паре «сообщение — читатель»: в канале ровно
 * две стороны, и различать внутри стороны нечего.
 */
export async function unreadCount(actor: Actor, projectId: string): Promise<number> {
  return prisma.message.count({
    where: { projectId, readAt: null, authorId: { not: actor.id } },
  });
}

/** Непрочитанное по всем доступным проектам сразу — для списка работ. */
export async function unreadByProject(
  actor: Actor,
  projectIds: readonly string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await prisma.message.groupBy({
    by: ['projectId'],
    where: { projectId: { in: [...projectIds] }, readAt: null, authorId: { not: actor.id } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

/**
 * Непрочитанное по всем видимым работам — для экрана «Требует внимания».
 *
 * Отличается от `unreadByProject` тем, что перечень работ не передаётся
 * снаружи, а берётся из выборки прав: менеджеру попадают только его
 * работы, руководителю — все (решение Р-149).
 */
export async function unreadInbox(
  actor: Actor,
): Promise<{ code: string; title: string; count: number }[]> {
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  const rows = await prisma.message.groupBy({
    by: ['projectId'],
    where: {
      readAt: null,
      authorId: { not: actor.id },
      ...(Object.keys(scope).length === 0 ? {} : { project: scope }),
    },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: rows.map((row) => row.projectId) } },
    select: { id: true, code: true, title: true },
  });
  const byId = new Map(projects.map((project) => [project.id, project]));

  return rows
    .flatMap((row) => {
      const project = byId.get(row.projectId);
      return project === undefined
        ? []
        : [{ code: project.code, title: project.title, count: row._count._all }];
    })
    .sort((a, b) => b.count - a.count);
}

export async function markRead(actor: Actor, projectId: string): Promise<void> {
  const ref = await projectRef(projectId);
  if (ref === null) return;
  ensure(actor, 'MESSAGE_READ', ref);
  await prisma.message.updateMany({
    where: { projectId, readAt: null, authorId: { not: actor.id } },
    data: { readAt: new Date() },
  });
}

/** Сообщения с признаком передачи контактов — сводка для менеджера. */
export async function flaggedMessages(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  return prisma.message.findMany({
    where: { containsContactHint: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      author: { select: { fullName: true, role: true } },
      project: { select: { code: true, title: true } },
    },
  });
}
