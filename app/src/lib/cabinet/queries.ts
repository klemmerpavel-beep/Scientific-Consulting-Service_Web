import type { StageState } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { enqueue } from './outbox.ts';
import { record } from './audit.ts';
import { leadAttachmentKey, sha256, storage } from './storage.ts';
import { can, ensure, scopeComments, scopeMaterials, scopeProjects, type Actor } from './access.ts';
import { now as today } from './clock.ts';

/**
 * Выборки экранов кабинета. Каждая строится через ограничение из модуля
 * прав: правило «эксперт видит только назначенные проекты» невозможно
 * забыть в отдельно написанном перечне, потому что перечня, минующего
 * `scope*`, здесь просто нет.
 */

/** Сколько работ показывается на одной странице перечня. */
export const PROJECT_PAGE_SIZE = 20;

/**
 * С какого числа работ перечень получает отбор.
 *
 * У клиента работ две-три: вкладки и поиск добавили бы сотню пикселей и
 * ничего не сообщили. У руководителя их пятьдесят пять, и без отбора
 * перечень вырастал до шести экранов прокрутки (решение Р-171).
 */
export const PROJECT_FILTER_FROM = 8;

/** Наборы перечня работ. Порядок тот же, что у вкладок на экране. */
export type ProjectFilter = 'active' | 'waiting' | 'done' | 'all';

/**
 * Перечень работ с отбором, поиском и постраничностью.
 *
 * У руководителя работ пятьдесят пять — весь объём книги заказов, — и
 * перечень вырастал до шести экранов прокрутки: чтобы найти работу, её
 * приходилось искать глазами (решение Р-171). Отбор ложится поверх
 * `scopeProjects`, то есть разграничение ролей остаётся на месте.
 *
 * Набор «ждут» — это этап в состоянии ожидания человека: клиенту он
 * говорит «ждут меня», практике — «ждут клиента». Состояние одно, назван
 * со стороны смотрящего.
 */
export async function listProjects(
  actor: Actor,
  { filter, query = '', page = 1 }: { filter?: ProjectFilter; query?: string; page?: number } = {},
) {
  const scope = scopeProjects(actor);
  if (scope === null) {
    return { rows: [], total: 0, page: 1, pages: 1, all: 0, filter: 'all' as ProjectFilter };
  }

  // Сколько работ всего — по этому числу решается и вид экрана, и набор
  // по умолчанию. Пока работ немного, отбора нет вовсе и показываются
  // все; когда их десятки, первым делом нужны действующие.
  const all = await prisma.project.count({ where: scope });
  const applied: ProjectFilter = filter ?? (all > PROJECT_FILTER_FROM ? 'active' : 'all');

  const byFilter =
    applied === 'active'
      ? { status: 'ACTIVE' as const }
      : applied === 'done'
        ? { status: { in: ['COMPLETED' as const, 'CANCELLED' as const] } }
        : applied === 'waiting'
          ? {
              // Только действующие: у закрытой работы застрявший этап —
              // след переноса книги, а не ожидание человека (решение Р-206).
              status: 'ACTIVE' as const,
              stages: { some: { state: { in: ['AWAITING_CLIENT' as const, 'IN_APPROVAL' as const] } } },
            }
          : {};

  const needle = query.trim();
  const byQuery =
    needle === ''
      ? {}
      : {
          OR: [
            { code: { contains: needle, mode: 'insensitive' as const } },
            { title: { contains: needle, mode: 'insensitive' as const } },
            { topic: { contains: needle, mode: 'insensitive' as const } },
            // Клиент ищет среди своих работ, и фамилия там всегда его
            // собственная: искать по ней нечего.
            ...(actor.role === 'CLIENT'
              ? []
              : [{ client: { fullName: { contains: needle, mode: 'insensitive' as const } } }]),
          ],
        };

  const where = { ...scope, ...byFilter, ...byQuery };
  const total = await prisma.project.count({ where });
  const pages = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);

  const rows = await prisma.project.findMany({
    where,
    // Последним ключом идёт код работы: при равных сроках порядок строк
    // иначе задаёт база, и один и тот же перечень выглядит по-разному
    // при каждом открытии (решение Р-186).
    orderBy: [{ status: 'asc' }, { dueOn: 'asc' }, { code: 'asc' }],
    skip: (current - 1) * PROJECT_PAGE_SIZE,
    take: PROJECT_PAGE_SIZE,
    include: {
      serviceType: { select: { name: true } },
      client: { select: { fullName: true } },
      stages: { orderBy: { position: 'asc' } },
      // Число материалов показывается прямо в плашке перечня: сколько по
      // работе приложено, человек должен видеть, не заходя внутрь
      // (решение Р-169). Счётчик идёт тем же запросом, второго обращения
      // к базе не появляется.
      _count: { select: { materials: true } },
    },
  });

  return { rows, total, page: current, pages, all, filter: applied };
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
      // История работы показывается целиком, а не последней дюжиной:
      // заказчик разбирает по ней спор о том, что и когда происходило
      // (решение Р-197). Предел оставлен на случай работы с сотнями
      // событий — свёртка прокручивается, а не растёт бесконечно.
      events: {
        orderBy: { createdAt: 'desc' },
        take: 200,
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
              // Состояние модерации нужно эксперту: его замечание не
              // видно клиенту, пока куратор его не опубликовал, и ждущее
              // публикации он должен видеть у себя (решение Р-200).
              comments: {
                where: commentScope,
                select: { id: true, authorId: true, moderationStatus: true },
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
    orderBy: [{ dueOn: 'asc' }, { awaitingClientSince: 'asc' }, { id: 'asc' }],
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

/**
 * Одна заявка для разбора.
 *
 * Разобранные заявки тоже открываются: ссылка из журнала или из письма
 * должна вести на что-то, а не в «не найдено». Что заявка уже разобрана,
 * видно по её состоянию.
 */
export async function leadById(actor: Actor, id: string) {
  ensure(actor, 'REQUEST_MODERATE');
  return prisma.lead.findUnique({
    where: { id },
    include: {
      attachments: {
        where: { purgedAt: null },
        orderBy: { uploadedAt: 'asc' },
      },
      // Исход разбора: работа, в которую развёрнута заявка, и письмо с
      // причиной отказа. Без них экран предлагал одобрить отклонённую и
      // развёрнутую заявку (решение Р-217).
      project: { select: { code: true } },
      notifications: {
        where: { eventKind: 'LEAD_DECLINED' },
        select: { state: true, lastError: true, sentAt: true },
        take: 1,
      },
    },
  });
}

/**
 * Содержимое вложения заявки.
 *
 * Байты отдаются только через маршрут выдачи и только тому, кто разбирает
 * заявки: у вложения нет работы, а значит, нет и обычной выборки прав по
 * проекту. Обращение записывается в журнал действий — журнал доступа к
 * файлам ведётся по версиям материалов, а вложение версией не является
 * (решение Р-191).
 */
export async function readLeadAttachment(actor: Actor, id: string, ip?: string | null) {
  ensure(actor, 'REQUEST_MODERATE');
  const file = await prisma.leadAttachment.findUnique({ where: { id } });
  if (file === null || file.purgedAt !== null) return null;

  const body = await storage().get(file.storageKey);
  await record(actor, {
    action: 'LEAD_FILE_DOWNLOADED',
    objectType: 'LeadAttachment',
    objectId: file.id,
    ip,
    payload: { leadId: file.leadId },
  });
  return { body, contentType: file.contentType, originalName: file.originalName };
}

/**
 * Справочник типов сопровождения для форм.
 *
 * Спрашивает действующее лицо, хотя видят его все вошедшие: правило
 * модуля — выборка называет, кому она отдаётся, и проверяет это сама, а
 * не полагается на то, что экран её не вызовет (решение Р-185). Прежде
 * функция не принимала актора вовсе.
 */
export async function serviceTypes(actor: Actor) {
  // Справочник нужен по обе стороны заявки: клиент выбирает тип, подавая
  // её, менеджер — разбирая. Право на работу здесь не годится: у клиента
  // оно выдаётся по конкретной работе, а справочник к работе не привязан
  // (решение Р-185).
  if (!can(actor, 'REQUEST_CREATE') && !can(actor, 'REQUEST_MODERATE')) {
    ensure(actor, 'REQUEST_CREATE');
  }
  return prisma.serviceType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Кому можно передать работу: действующие сотрудники практики.
 *
 * Отдаёт ФИО и роли, то есть состав практики, и потому закрыта правом на
 * правку работы. Прежде проверки не было вовсе, и защитой служило лишь
 * то, что экран прячет выбор куратора от того, кому он не положен
 * (решение Р-185).
 */
export async function curators(actor: Actor) {
  ensure(actor, 'PROJECT_EDIT');
  return prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'HEAD'] }, status: 'ACTIVE' },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, role: true },
  });
}

/**
 * Эксперты для назначения: ФИО, специализация и дата договора поручения.
 *
 * Закрыта правом назначать исполнителя — состав привлечённых
 * специалистов клиенту не показывается по решению Р-140, и выборка
 * обязана держать это сама (решение Р-185).
 */
export async function experts(actor: Actor) {
  ensure(actor, 'PROJECT_ASSIGN_EXPERT');
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
  if (scope === null) return { overdue: [], soon: [], stalled: [], lateWorks: [] };
  const mine = Object.keys(scope).length === 0 ? {} : { project: scope };
  // День — у часов кабинета: снимок не зависит от дня съёмки (Р-205).
  const now = today();
  const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Карточка «Требует внимания» должна отвечать на три вопроса сразу:
  // что просрочено, чей ход и сколько денег под угрозой. Состояние этапа
  // и суммы договора берутся здесь же — вторым запросом на каждую строку
  // это стоило бы десятков обращений к базе (решение Р-199).
  const include = {
    project: {
      select: {
        code: true,
        title: true,
        dueOn: true,
        // Куратор нужен, чтобы сказать руководителю, чей ход по чужой
        // работе: «ход за вами» у него значил не то (решение Р-206).
        managerId: true,
        client: { select: { fullName: true } },
        manager: { select: { fullName: true } },
        contract: {
          select: {
            totalAmount: true,
            tranches: { select: { amount: true, status: true } },
          },
        },
      },
    },
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

  // Работа, срок которой прошёл, а просроченного этапа у неё нет. Так
  // выглядит почти вся перенесённая книга: этапов у неё нет, и сорванный
  // срок работы на сводке не появлялся вовсе — ответ говорил «ничего не
  // горит» при просроченных заказах (решение Р-216).
  const lateWorks = await prisma.project.findMany({
    where: {
      ...scope,
      status: 'ACTIVE',
      dueOn: { lt: now },
      stages: { none: { state: live, dueOn: { lt: now } } },
    },
    orderBy: [{ dueOn: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      title: true,
      dueOn: true,
      managerId: true,
      client: { select: { fullName: true } },
      contract: {
        select: {
          totalAmount: true,
          tranches: { select: { amount: true, status: true } },
        },
      },
      _count: { select: { stages: true } },
    },
  });

  return { overdue, soon, stalled, lateWorks };
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

/**
 * Что подставляется в форму новой заявки.
 *
 * Человек уже вошёл, и его ФИО, телефон, вуз и направление известны из
 * карточки: спрашивать их заново значит заставлять набирать то, что у
 * практики есть. Поля остаются правимыми — заявка может идти по другой
 * работе и с другим руководителем (решение Р-191).
 */
export async function requestDefaults(actor: Actor) {
  ensure(actor, 'REQUEST_CREATE');
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      fullName: true,
      phone: true,
      clientProfile: { select: { university: true, speciality: true, phone: true } },
    },
  });
  return {
    fullName: user.fullName,
    phone: user.phone ?? user.clientProfile?.phone ?? '',
    organization: user.clientProfile?.university ?? '',
    speciality: user.clientProfile?.speciality ?? '',
  };
}

/** Что подставляется в заявку из кабинета: контакт и редакция согласия. */
export interface RequestDraft {
  readonly topic: string;
  readonly need: string | null;
  readonly deadline: string | null;
  readonly message: string | null;
  readonly ip: string;
  /** ФИО заказчика: подставляется из учётной записи и правится в форме. */
  readonly applicantName?: string | null;
  /** ФИО научного руководителя: работу ведут с оглядкой на его требования. */
  readonly supervisorName?: string | null;
  readonly organization?: string | null;
  readonly speciality?: string | null;
  readonly phone?: string | null;
  /** Файлы, приложенные к обращению. */
  readonly files?: readonly RequestFile[];
}

/** Файл, приложенный к заявке из кабинета. */
export interface RequestFile {
  readonly originalName: string;
  readonly contentType: string;
  readonly body: Buffer;
}

/** Сколько файлов принимается к одной заявке и какого размера каждый. */
export const REQUEST_FILES_MAX = 5;
export const REQUEST_FILE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Заявка, поданная изнутри кабинета.
 *
 * Собиралась серверным действием, которое само ходило в базу тремя
 * запросами: учётная запись, создание заявки, перечень кураторов для
 * уведомления. Действие — точка входа с формы, а не место для выборок;
 * здесь оно одно, и оно доменное (решение Р-185).
 *
 * Контакт берётся из учётной записи, а не с формы: человек уже вошёл, и
 * спрашивать его заново незачем — заодно подменить его нельзя.
 */
export async function createCabinetRequest(
  actor: Actor,
  draft: RequestDraft,
  consentVersion: string,
): Promise<{ id: string; authorName: string }> {
  ensure(actor, 'REQUEST_CREATE');
  if (draft.topic.length === 0) throw new Error('Тема работы не указана');

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true, fullName: true, consentVersion: true },
  });

  const lead = await prisma.lead.create({
    data: {
      source: 'cabinet',
      form: 'request',
      name: draft.applicantName?.trim() || user.fullName,
      contactKind: 'email',
      contact: user.email,
      topic: draft.topic,
      need: draft.need,
      deadline: draft.deadline,
      message: draft.message,
      supervisorName: draft.supervisorName?.trim() || null,
      organization: draft.organization?.trim() || null,
      speciality: draft.speciality?.trim() || null,
      phone: draft.phone?.trim() || null,
      // Согласие принято при первом входе в кабинет; редакция текста
      // хранится вместе с заявкой, как и у обращений с сайта.
      consentGiven: true,
      consentVersion: user.consentVersion ?? consentVersion,
      termsAccepted: true,
      ip: draft.ip,
    },
  });

  // Вложения кладутся после заявки: ключ объекта строится от её
  // идентификатора, а заявка без файлов остаётся действительной — отказ
  // хранилища не должен терять обращение (решение Р-191).
  for (const file of (draft.files ?? []).slice(0, REQUEST_FILES_MAX)) {
    if (file.body.byteLength === 0) continue;
    if (file.body.byteLength > REQUEST_FILE_MAX_BYTES) {
      throw new Error(
        `Файл больше допустимых ${Math.round(REQUEST_FILE_MAX_BYTES / 1024 / 1024)} МБ`,
      );
    }
    const key = leadAttachmentKey(lead.id, file.originalName);
    await storage().put(key, file.body, file.contentType);
    await prisma.leadAttachment.create({
      data: {
        leadId: lead.id,
        storageKey: key,
        originalName: file.originalName.slice(0, 300),
        sizeBytes: BigInt(file.body.byteLength),
        sha256: sha256(file.body),
        contentType: file.contentType.slice(0, 128),
        uploadedById: actor.id,
      },
    });
  }

  // Менеджеры узнают о заявке из очереди, и постановка идёт здесь же:
  // событие кладётся рядом с самой заявкой, а не в действии экрана —
  // так устроен весь контур уведомлений (решение Р-151). Обращения с
  // сайта идут другим путём, и второе уведомление о том же было бы
  // дублем.
  const moderators = await prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'HEAD'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  for (const moderator of moderators) {
    await enqueue(prisma, {
      userId: moderator.id,
      eventKind: 'REQUEST_CREATED',
      subject: 'Новая заявка из кабинета',
      body: `${user.fullName}: ${draft.topic}\nЗаявка ждёт в очереди модерации.`,
      dedupKey: `lead:${lead.id}:created:${moderator.id}`,
    });
  }

  return { id: lead.id, authorName: user.fullName };
}
