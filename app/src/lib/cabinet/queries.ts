import type { StageState } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { can, ensure, scopeComments, scopeMaterials, scopeProjects, type Actor } from './access.ts';

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
        include: { actor: { select: { id: true, fullName: true, role: true } } },
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
 * Материалы проекта целиком, включая не привязанные к этапу.
 *
 * Экран этапа показывает только его материалы, и файл, приложенный к
 * проекту в обход этапов, оставался бы недостижимым: строка в базе есть,
 * дойти до неё нельзя. Закрывающие документы сюда не попадают — они живут
 * на экране оплат при договоре и траншах, где видно, какой платёж каким
 * документом закрыт.
 */
export async function projectMaterials(actor: Actor, code: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const materialScope = scopeMaterials(actor) ?? {};
  const commentScope = scopeComments(actor) ?? {};

  return prisma.project.findFirst({
    where: { code, ...scope },
    select: {
      id: true,
      code: true,
      title: true,
      clientId: true,
      managerId: true,
      expertId: true,
      stages: { orderBy: { position: 'asc' }, select: { id: true, position: true, title: true } },
      materials: {
        where: { ...materialScope, kind: 'STAGE_MATERIAL' },
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: { id: true, position: true, title: true } },
          createdBy: { select: { fullName: true, role: true } },
          versions: {
            orderBy: { number: 'desc' },
            include: {
              uploadedBy: { select: { fullName: true, role: true } },
              comments: { where: commentScope, select: { id: true } },
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
/** Сколько заявок показывается на одной странице очереди. */
export const LEAD_PAGE_SIZE = 20;

/**
 * Очередь заявок постранично.
 *
 * Прежде выбирались первые пятьдесят и больше ничего: при четырёхстах с
 * лишним обращениях, накопившихся с открытия сайта, остальные не были видны
 * и об их существовании ничего не сообщалось. Теперь возвращается и общее
 * число, и номер страницы — по ним экран говорит, сколько заявок всего и
 * какие показаны (решение Р-157).
 *
 * Порядок — от старых к новым: очередь разбирается с головы, а не с хвоста.
 */
export async function leadQueue(actor: Actor, page = 1) {
  ensure(actor, 'REQUEST_MODERATE');
  const where = { status: { in: ['NEW' as const, 'IN_PROGRESS' as const] }, projectId: null };
  const total = await prisma.lead.count({ where });
  const pages = Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE));
  // Страница за пределами перечня — не ошибка: ссылку могли сохранить, а
  // заявки за это время разобрать. Показывается последняя существующая.
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const rows = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip: (current - 1) * LEAD_PAGE_SIZE,
    take: LEAD_PAGE_SIZE,
  });
  return { rows, total, page: current, pages };
}

export async function serviceTypes() {
  return prisma.serviceType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Кому можно передать работу: действующие сотрудники практики. */
export async function curators() {
  return prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'HEAD'] }, status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, role: true },
  });
}

export async function experts() {
  return prisma.user.findMany({
    where: { role: 'EXPERT', status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    include: { expertProfile: { select: { specialization: true, ndaSignedAt: true } } },
  });
}

/**
 * Светофор по срокам. Три полосы, и каждая отвечает на свой вопрос: что уже
 * сорвано, что сорвётся на этой неделе и где работа стоит из-за клиента
 * дольше двух недель. Последняя полоса нужна отдельно: просрочки там может
 * ещё не быть, а проект уже фактически не движется.
 */
export async function trafficLight(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  // Светофор строится через ту же выборку, что и перечень работ: иначе
  // менеджер, видящий только свои работы, получал бы сроки всей практики
  // (решение Р-149). Правило модуля прав — списки и реестры идут через
  // `scope*`, а не через отдельное условие.
  const scope = scopeProjects(actor);
  if (scope === null) return { overdue: [], soon: [], stalled: [] };
  const mine = Object.keys(scope).length === 0 ? {} : { project: scope };
  const now = new Date();
  const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const include = {
    project: { select: { code: true, title: true, client: { select: { fullName: true } } } },
  } as const;
  // Незакрытые этапы: завершённые в светофор не попадают по определению.
  const live = {
    in: ['NOT_STARTED', 'IN_PROGRESS', 'AWAITING_CLIENT', 'IN_APPROVAL'] as StageState[],
  };

  const [overdue, soon, stalled] = await Promise.all([
    prisma.stage.findMany({
      where: { ...mine, state: live, dueOn: { lt: now } },
      orderBy: { dueOn: 'asc' },
      include,
    }),
    prisma.stage.findMany({
      where: { ...mine, state: live, dueOn: { gte: now, lte: inWeek } },
      orderBy: { dueOn: 'asc' },
      include,
    }),
    prisma.stage.findMany({
      where: { ...mine, state: 'AWAITING_CLIENT', awaitingClientSince: { lt: twoWeeksAgo } },
      orderBy: { awaitingClientSince: 'asc' },
      include,
    }),
  ]);

  return { overdue, soon, stalled };
}

/** Реестр клиентов. Контакты отдаются только ролям, которым они положены. */
export async function clientRegistry(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  // Клиент попадает в реестр вместе со своей работой: менеджер видит тех,
  // чьи работы ведёт, руководитель — всех (решение Р-149).
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  const mine = Object.keys(scope).length === 0 ? {} : { projects: { some: scope } };
  const rows = await prisma.clientProfile.findMany({
    where: { ...mine, erasedAt: null },
    orderBy: { fullName: 'asc' },
    include: {
      projects: { select: { id: true, status: true } },
      user: { select: { lastLoginAt: true } },
    },
  });
  const contacts = can(actor, 'CONTACTS_VIEW');
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    university: row.university,
    speciality: row.speciality,
    projects: row.projects.length,
    active: row.projects.filter((p) => p.status === 'ACTIVE').length,
    lastLoginAt: row.user?.lastLoginAt ?? null,
    // Контакты не «скрываются на экране», а не попадают в объект вовсе.
    ...(contacts ? { email: row.email, phone: row.phone } : {}),
  }));
}

/** Реестр экспертов с их загрузкой. */
export async function expertRegistry(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  const rows = await prisma.user.findMany({
    where: { role: 'EXPERT', status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    include: {
      expertProfile: true,
      expertProjects: { select: { id: true, status: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    degree: row.expertProfile?.degree ?? null,
    specialization: row.expertProfile?.specialization ?? null,
    ndaSignedAt: row.expertProfile?.ndaSignedAt ?? null,
    active: row.expertProjects.filter((p) => p.status === 'ACTIVE').length,
    total: row.expertProjects.length,
  }));
}

/** Сколько заявок показывается на странице перечня «Все заявки». */
export const LEAD_LIST_PAGE_SIZE = 50;

export interface LeadFilter {
  /** Страница сайта: landing, postgrad, students, business, cabinet. */
  readonly source?: string;
  readonly status?: string;
  /** Поиск по имени, контакту, организации и теме. */
  readonly query?: string;
  readonly page?: number;
}

/**
 * Все заявки с фильтрами — в отличие от очереди, которая показывает только
 * неразобранные.
 *
 * Раздел заменяет выгрузку во внешнее хранилище: смотреть обращения нужно
 * целиком, а вывоз персональных данных к третьему лицу требует договора
 * поручения обработки. Здесь данные не покидают сервер (решение Р-159).
 */
export async function leadList(actor: Actor, filter: LeadFilter = {}) {
  ensure(actor, 'REQUEST_MODERATE');

  const query = (filter.query ?? '').trim();
  const where = {
    // Отзывы приходят той же формой и лежат в той же таблице; в перечне
    // обращений им не место — у них свой порядок работы (Р-111).
    form: { not: 'review' },
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.status ? { status: filter.status as 'NEW' } : {}),
    ...(query.length === 0
      ? {}
      : {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { contact: { contains: query, mode: 'insensitive' as const } },
            { organization: { contains: query, mode: 'insensitive' as const } },
            { topic: { contains: query, mode: 'insensitive' as const } },
          ],
        }),
  };

  const total = await prisma.lead.count({ where });
  const pages = Math.max(1, Math.ceil(total / LEAD_LIST_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pages);

  const rows = await prisma.lead.findMany({
    where,
    // Здесь порядок обратный очереди: перечень просматривают сверху вниз,
    // и наверху должно быть свежее.
    orderBy: { createdAt: 'desc' },
    skip: (current - 1) * LEAD_LIST_PAGE_SIZE,
    take: LEAD_LIST_PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      source: true,
      form: true,
      name: true,
      contact: true,
      contactKind: true,
      organization: true,
      topic: true,
      need: true,
      deadline: true,
      message: true,
      status: true,
      projectId: true,
      consentGiven: true,
      marketingOptIn: true,
    },
  });

  return { rows, total, page: current, pages };
}
