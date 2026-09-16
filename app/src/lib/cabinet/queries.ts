import { prisma } from '../db.ts';
import { ensure, scopeComments, scopeMaterials, scopeProjects, type Actor } from './access.ts';

/**
 * Выборки экранов кабинета. Каждая строится через ограничение из модуля
 * прав: правило «эксперт видит только назначенные проекты» невозможно
 * забыть в отдельно написанном перечне, потому что перечня, минующего
 * `scope*`, здесь просто нет.
 */

export async function listProjects(actor: Actor) {
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  return prisma.project.findMany({
    where: scope,
    orderBy: [{ status: 'asc' }, { dueOn: 'asc' }],
    include: {
      serviceType: { select: { name: true } },
      client: { select: { fullName: true } },
      stages: { orderBy: { position: 'asc' } },
    },
  });
}

export async function projectByCode(actor: Actor, code: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  return prisma.project.findFirst({
    where: { code, ...scope },
    include: {
      serviceType: true,
      client: true,
      manager: { select: { id: true, fullName: true } },
      expert: {
        select: { id: true, fullName: true, expertProfile: true },
      },
      stages: { orderBy: { position: 'asc' } },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { actor: { select: { fullName: true, role: true } } },
      },
    },
  });
}

export async function stageById(actor: Actor, stageId: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const materialScope = scopeMaterials(actor) ?? {};
  const commentScope = scopeComments(actor) ?? {};
  return prisma.stage.findFirst({
    where: { id: stageId, project: scope },
    include: {
      project: { select: { id: true, code: true, title: true, clientId: true, managerId: true, expertId: true } },
      expert: { select: { fullName: true, expertProfile: { select: { degree: true } } } },
      materials: {
        where: materialScope,
        orderBy: { createdAt: 'asc' },
        include: {
          versions: {
            orderBy: { number: 'desc' },
            include: {
              uploadedBy: { select: { fullName: true, role: true } },
              comments: {
                where: commentScope,
                orderBy: { createdAt: 'asc' },
                include: { author: { select: { fullName: true, role: true } } },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Блок «сейчас от вас требуется» — композиционный центр главного экрана.
 * Собирается из состояний этапов: ожидание материалов от клиента и этапы,
 * ждущие его согласования. Основная потеря календарного времени в проектах
 * приходится именно на эти два состояния.
 */
export async function pendingActions(actor: Actor) {
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  const stages = await prisma.stage.findMany({
    where: {
      project: scope,
      state: { in: ['AWAITING_CLIENT', 'IN_APPROVAL'] },
    },
    orderBy: [{ dueOn: 'asc' }, { awaitingClientSince: 'asc' }],
    include: { project: { select: { code: true, title: true } } },
  });
  return stages;
}

/** Очередь заявок для менеджера и руководителя. */
export async function leadQueue(actor: Actor) {
  ensure(actor, 'REQUEST_MODERATE');
  return prisma.lead.findMany({
    where: { status: { in: ['NEW', 'IN_PROGRESS'] }, projectId: null },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
}

export async function serviceTypes() {
  return prisma.serviceType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function experts() {
  return prisma.user.findMany({
    where: { role: 'EXPERT', status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    include: { expertProfile: { select: { specialization: true, ndaSignedAt: true } } },
  });
}
