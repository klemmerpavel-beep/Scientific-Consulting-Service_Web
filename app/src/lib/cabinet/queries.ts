import type { StageState } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { enqueue } from './outbox.ts';
import { record } from './audit.ts';
import { leadAttachmentKey, openObject, sha256, storage } from './storage.ts';
import {
  can,
  ensure,
  scopeComments,
  scopeLeads,
  scopeMaterials,
  scopeProjects,
  scopeVersions,
  withoutStaffNames,
  type Actor,
} from './access.ts';
import { fileRefusal } from './file-guard.ts';
import { loadCalendar } from './approval.ts';
import { previousWorkday } from './workdays.ts';
import { clientWaitDays, turnLabel, type StageStateKey } from './stage-state.ts';
import { curatorTasks } from './curator-tasks.ts';
import { moscowToday, now as today } from './clock.ts';
import { LEAD_STATUS_LABEL } from './lead-labels.ts';

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
  {
    filter,
    query = '',
    page = 1,
    manager,
    curator,
    due,
  }: { filter?: ProjectFilter; query?: string; page?: number; manager?: string; curator?: string; due?: string } = {},
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
      ? // Приостановленная работа не закрыта: прежде она не попадала ни в
        // «Действующие», ни в «Завершённые» и пропадала с экрана, открытого
        // по умолчанию (решение Р-245).
        { status: { in: ['ACTIVE' as const, 'PAUSED' as const] } }
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

  // Отбор по сотруднику — только руководителю: у менеджера выборка и так
  // ограничена его работами, и параметр её не расширяет (требование
  // РК-03, решение Р-341).
  const byPerson =
    actor.role === 'HEAD'
      ? { ...(manager ? { managerId: manager } : {}), ...(curator ? { expertId: curator } : {}) }
      : {};
  // Отбор по месяцу срока работы `ГГГГ-ММ` — проверка числа «К пику» на
  // «Команде» (требование РК-22, решение Р-354).
  const dueMatch = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(due ?? '');
  const byDue =
    dueMatch === null
      ? {}
      : {
          dueOn: {
            gte: new Date(Date.UTC(Number(dueMatch[1]), Number(dueMatch[2]) - 1, 1)),
            lt: new Date(Date.UTC(Number(dueMatch[1]), Number(dueMatch[2]), 1)),
          },
        };
  const where = { ...scope, ...byFilter, ...byQuery, ...byPerson, ...byDue };
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
      // Исполнитель — в строке фактов у практики (требование М-16, Р-298).
      expert: { select: { id: true, fullName: true, role: true, expertProfile: { select: { ndaSignedAt: true } } } },
      // Менеджер — в строке фактов руководителя (РК-03, Р-341).
      manager: { select: { id: true, fullName: true, role: true } },
      stages: { orderBy: { position: 'asc' } },
      // Число материалов показывается прямо в плашке перечня: сколько по
      // работе приложено, человек должен видеть, не заходя внутрь
      // (решение Р-169). Счётчик идёт тем же запросом, второго обращения
      // к базе не появляется.
      // Считается видимое: материал, у которого видна хотя бы одна версия
      // (требование Т-18, решение Р-294), — по правилу карточки: без
      // удалённых и без документов оплат (улучшение УК-12, решение Р-359).
      _count: { select: { materials: { where: materialCountWhere(actor) } } },
    },
  });

  return { rows: withoutStaffNames(actor, rows), total, page: current, pages, all, filter: applied };
}

export async function projectByCode(actor: Actor, code: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const project = await prisma.project.findFirst({
    where: { code, ...scope },
    include: {
      serviceType: true,
      client: true,
      // Регалии менеджера и эксперта — для «О работе» (Т-11, Р-297). Роль
      // нужна, чтобы снять имя менеджера с данных клиента (ОЭ-3б).
      manager: {
        select: {
          id: true,
          fullName: true,
          // Почта менеджера — куратору в «О работе» (Э-12, С-4); клиенту её
          // затирает `withoutStaffNames`.
          email: true,
          role: true,
          expertProfile: { select: { degree: true, specialization: true } },
        },
      },
      expert: {
        select: { id: true, fullName: true, role: true, expertProfile: true },
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
  // Клиенту — без ФИО сотрудников и в данных, не только на экране (Р-297, ОЭ-3б).
  return withoutStaffNames(actor, project);
}

export async function stageById(actor: Actor, stageId: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const materialScope = scopeMaterials(actor) ?? {};
  const commentScope = scopeComments(actor) ?? {};
  // Версия эксперта видна клиенту после публикации (Т-18, Р-294).
  const versionScope = scopeVersions(actor) ?? {};
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, project: scope },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          clientId: true,
          managerId: true,
          expertId: true,
          // Роль эксперта в работе — подпись его версий клиенту (Р-297).
          expertRole: true,
          // Исполнитель работы — в шапке этапа у практики; поле этапа
          // скрыто (требование М-16, решение Р-298).
          expertNameRaw: true,
          expert: { select: { fullName: true, role: true, expertProfile: { select: { ndaSignedAt: true } } } },
          // Есть ли у клиента вход: без него срок согласования не идёт
          // (требование М-13, решение Р-291).
          client: { select: { userId: true } },
        },
      },

      // Последний возврат клиентом: текст замечаний под шапкой этапа
      // (решение Р-281). Эксперту текст отдаёт `presentReturnText`.
      changes: {
        where: { via: 'CLIENT_RETURN' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { reason: true, contactHint: true, createdAt: true },
      },
      materials: {
        // Материал без единой видимой версии не показывается: у клиента он
        // висел бы пустым до публикации версии эксперта (М-14, Р-295).
        where: { ...materialScope, ...visibleMaterial(versionScope) },
        orderBy: { createdAt: 'asc' },
        include: {
          versions: {
            where: versionScope,
            orderBy: { number: 'desc' },
            include: {
              uploadedBy: { select: { fullName: true, role: true } },
              moderation: { select: { status: true, note: true, decidedAt: true, identityHint: true } },
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
  return withoutStaffNames(actor, stage);
}

/** Условие «у материала есть видимая версия»; практике — без условия. */
/**
 * Какие материалы входят в число на плашке перечня — те же, что в списке
 * материалов карточки (улучшение УК-12, решение Р-359).
 */
export function materialCountWhere(actor: Actor): Record<string, unknown> {
  const { project: _byProject, ...base } = scopeMaterials(actor) ?? {};
  void _byProject;
  return { ...base, kind: 'STAGE_MATERIAL', ...visibleMaterial(scopeVersions(actor) ?? {}) };
}

function visibleMaterial(versionScope: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(versionScope).length === 0 ? {} : { versions: { some: versionScope } };
}

/**
 * Ожидание клиента на этапе после последнего переноса срока — для
 * подсказки менеджеру (часть F, МП-05, решение Р-381). Только тому, кто
 * правит этап.
 */
export async function stageClientWait(
  actor: Actor,
  stageId: string,
  now: Date,
): Promise<{ days: number; until: Date | null }> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    select: {
      projectId: true,
      dueOn: true,
      project: { select: { id: true, clientId: true, managerId: true, expertId: true } },
      changes: { select: { toState: true, createdAt: true } },
    },
  });
  if (stage === null || !can(actor, 'STAGE_EDIT', stage.project)) return { days: 0, until: null };
  const moved = await prisma.projectEvent.findFirst({
    where: { projectId: stage.projectId, kind: 'STAGE_DUE_CHANGED', payload: { path: ['stageId'], equals: stageId } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const days = clientWaitDays(stage.changes, moved?.createdAt ?? null, now);
  // Срок, перенесённый на те же дни: календарные дни, как в оферте.
  const until = stage.dueOn === null || days === 0 ? null : new Date(stage.dueOn.getTime() + days * 86_400_000);
  return { days, until };
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
  // Версия эксперта видна клиенту после публикации (Т-18, Р-294).
  const versionScope = scopeVersions(actor) ?? {};

  const project = await prisma.project.findFirst({
    where: { code, ...scope },
    select: {
      id: true,
      code: true,
      title: true,
      clientId: true,
      managerId: true,
      expertId: true,
      // Состояние работы и этапов: закрытая работа и завершённый этап —
      // только чтение (Т-17, М-10, решение Р-293).
      status: true,
      expertRole: true,
      stages: {
        orderBy: { position: 'asc' },
        select: { id: true, position: true, title: true, state: true },
      },
      materials: {
        where: { ...materialScope, kind: 'STAGE_MATERIAL', ...visibleMaterial(versionScope) },
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: { id: true, position: true, title: true, state: true } },
          createdBy: { select: { fullName: true, role: true } },
          versions: {
            where: versionScope,
            orderBy: { number: 'desc' },
            include: {
              uploadedBy: { select: { fullName: true, role: true } },
              moderation: { select: { status: true, note: true, decidedAt: true, identityHint: true } },
              // Состояние модерации нужно эксперту: его замечание не
              // видно клиенту, пока куратор его не опубликовал, и ждущее
              // публикации он должен видеть у себя (решение Р-200).
              // Текст и автор — для материалов вне этапов: их замечания
              // читаются и разбираются на этом экране (решение Р-284).
              comments: {
                where: commentScope,
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  authorId: true,
                  body: true,
                  createdAt: true,
                  moderationStatus: true,
                  moderationNote: true,
                  author: { select: { fullName: true, role: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return withoutStaffNames(actor, project);
}

/**
 * Действующие работы с этапами — для ответа в шапке «Мои работы» и
 * «Назначенные работы». Ответ говорит обо всех работах человека, а не о
 * странице перечня: прежде он строился по отобранной выборке, и клиент,
 * открывший «Завершённые», читал «Действующих работ нет» (решение Р-245).
 */
export async function liveWorks(actor: Actor) {
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  return prisma.project.findMany({
    where: { ...scope, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      stages: {
        orderBy: { position: 'asc' },
        // Сданный куратором этап — ход за менеджером (Э-05, Р-325).
        select: { id: true, title: true, state: true, dueOn: true, handedOverAt: true },
      },
    },
  });
}

/**
 * Дела куратора (требование Э-04, решение Р-329): этапы его работ,
 * действующих и приостановленных (Д-4), свои версии и замечания с решением
 * менеджера — одной выборкой на вид. Правила — в `curatorTasks`.
 */
export async function curatorTasksData(actor: Actor) {
  const scope = scopeProjects(actor);
  if (actor.role !== 'EXPERT' || scope === null) return curatorTasks([]);
  const openWork = { ...scope, status: { in: ['ACTIVE' as const, 'PAUSED' as const] } };
  const stageRef = { select: { id: true, dueOn: true } };
  const [works, versions, comments] = await Promise.all([
    prisma.project.findMany({
      where: openWork,
      orderBy: { code: 'asc' },
      select: {
        code: true,
        title: true,
        status: true,
        stages: {
          where: { state: 'IN_PROGRESS', handedOverAt: null },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            state: true,
            dueOn: true,
            handedOverAt: true,
            handbackAt: true,
            returnedAt: true,
          },
        },
      },
    }),
    prisma.materialVersion.findMany({
      where: {
        uploadedById: actor.id,
        purgedAt: null,
        moderation: { isNot: null },
        material: { deletedAt: null, kind: 'STAGE_MATERIAL', project: openWork },
      },
      select: {
        id: true,
        number: true,
        moderation: { select: { status: true } },
        material: { select: { id: true, title: true, project: { select: { code: true } }, stage: stageRef } },
      },
    }),
    prisma.versionComment.findMany({
      where: {
        authorId: actor.id,
        version: { purgedAt: null, material: { deletedAt: null, project: openWork } },
      },
      select: {
        versionId: true,
        createdAt: true,
        moderationStatus: true,
        version: {
          select: { material: { select: { title: true, project: { select: { code: true } }, stage: stageRef } } },
        },
      },
    }),
  ]);
  return curatorTasks(
    works,
    versions.map((version) => ({
      versionId: version.id,
      materialId: version.material.id,
      materialTitle: version.material.title,
      number: version.number,
      status: version.moderation?.status ?? 'PUBLISHED',
      code: version.material.project.code,
      stage: version.material.stage,
    })),
    comments.map((comment) => ({
      versionId: comment.versionId,
      createdAt: comment.createdAt,
      status: comment.moderationStatus,
      materialTitle: comment.version.material.title,
      code: comment.version.material.project.code,
      stage: comment.version.material.stage,
    })),
  );
}

/**
 * Этапы, которые клиент вернул с замечаниями и куратор ещё не принял в
 * работу (требование М-04, решение Р-283). Дело уходит с «Требует
 * внимания», когда куратор нажал «Замечания приняты в работу» или сдал
 * этап заново.
 */
export async function returnedStages(actor: Actor) {
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  return prisma.stage.findMany({
    where: {
      returnedAt: { not: null },
      returnAckAt: null,
      state: { not: 'IN_APPROVAL' },
      project: { ...scope, status: 'ACTIVE' },
    },
    orderBy: [{ returnedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      returnedAt: true,
      project: { select: { code: true, title: true, client: { select: { fullName: true } } } },
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
      // Только действующие работы: этап приостановленной или закрытой
      // работы от клиента ничего не ждёт (решение Р-240).
      project: { ...scope, status: 'ACTIVE' as const },
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
  // Отзыв — не заявка: у него нет контакта, и одобрить его в работу нельзя.
  // Прежде отзывы стояли в очереди, счётчик расходился с «Все заявки», а
  // одобренный отзыв заводил клиента с пустой почтой (решение Р-245).
  const where = {
    status: { in: ['NEW' as const, 'IN_PROGRESS' as const] },
    projectId: null,
    form: { not: 'review' },
  };
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
  // Заявка, развёрнутая в чужую работу, для менеджера не существует — как
  // и сама работа (решение Р-251).
  const scope = scopeLeads(actor);
  if (scope === null) return null;
  return prisma.lead.findFirst({
    where: { AND: [{ id }, scope] },
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
      // Внутренние комментарии — от старых к новым, как переписка (Р-270).
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, fullName: true, role: true } },
        },
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
  // Вложение видно тому, кому видна его заявка: по заявке, развёрнутой в
  // чужую работу, менеджер файлов не получает (решение Р-251).
  const scope = scopeLeads(actor);
  if (scope === null) return null;
  const file = await prisma.leadAttachment.findFirst({ where: { id, lead: scope } });
  if (file === null || file.purgedAt !== null) return null;

  // Потоком, а не целиком (решение Р-247).
  const opened = await openObject(storage(), file.storageKey);
  await record(actor, {
    action: 'LEAD_FILE_DOWNLOADED',
    objectType: 'LeadAttachment',
    objectId: file.id,
    ip,
    payload: { leadId: file.leadId },
  });
  return {
    stream: opened.stream,
    sizeBytes: opened.sizeBytes,
    contentType: file.contentType,
    originalName: file.originalName,
  };
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
  const types = await prisma.serviceType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { stageTemplates: { where: { isActive: true } } } } },
  });
  // Есть ли у типа шаблон этапов: экран разбора заявки прежде показывал
  // флажок «Применить шаблон» при пустом справочнике шаблонов, и флажок
  // молча ничего не делал (решение Р-254).
  return types.map(({ _count, ...type }) => ({ ...type, hasTemplate: _count.stageTemplates > 0 }));
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
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
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
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    include: { expertProfile: { select: { specialization: true, ndaSignedAt: true } } },
  });
}

/**
 * Светофор по срокам. Полосы отвечают каждая на свой вопрос: что уже
 * сорвано и где работа стоит из-за клиента дольше недели (Р-304). Последняя
 * полоса нужна отдельно: просрочки там может ещё не быть, а проект уже
 * фактически не движется. Полоса «на этой неделе» снята: её никто не
 * выводил, а ближайшие сроки руководитель видит на «Сводке» (Р-342;
 * улучшение УР-02, решение Р-386).
 */
export async function trafficLight(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  // Светофор строится через ту же выборку, что и перечень работ: иначе
  // менеджер, видящий только свои работы, получал бы сроки всей практики
  // (решение Р-149). Правило модуля прав — списки и реестры идут через
  // `scope*`, а не через отдельное условие.
  const scope = scopeProjects(actor);
  if (scope === null) return { overdue: [], stalled: [], lateWorks: [] };
  // Этапы только действующих работ. Прежде этап отменённой или
  // завершённой работы, брошенный незакрытым, висел в «Требует внимания»
  // бессрочно, а изменить его было уже нельзя (решение Р-240).
  const mine = { project: { ...scope, status: 'ACTIVE' as const } };
  // День — у часов кабинета: снимок не зависит от дня съёмки (Р-205).
  // Сравнение идёт с началом дня: срок — день, и срок «сегодня» сорванным
  // не считается до конца этого дня. Прежде он становился просроченным с
  // первой минуты суток (решение Р-240). Сутки — московские, как у
  // всех «срок прошёл» кабинета: по UTC вчерашний срок до трёх часов ночи
  // ещё не считался сорванным (решение Р-257).
  const moment = today();
  const now = moscowToday(moment);
  // Порог «ждёт клиента» — неделя, а не две: за две недели работа успевала
  // встать (требование М-06, решение Р-304).
  const weekAgo = new Date(moment.getTime() - 7 * 24 * 60 * 60 * 1000);

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
        // Чей ход у этапа «в работе» — эксперта, если он назначен (Р-288).
        expertId: true,
        expertNameRaw: true,
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

  const [overdue, stalled] = await Promise.all([
    prisma.stage.findMany({
      where: { ...mine, state: live, dueOn: { lt: now } },
      // Второй ключ — идентификатор: сроки хранятся днём, совпадения часты, а
      // первая строка решает, куда ведёт «Начать с главного» (решение Р-229).
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
      include,
    }),
    prisma.stage.findMany({
      where: { ...mine, state: 'AWAITING_CLIENT', awaitingClientSince: { lt: weekAgo } },
      orderBy: { awaitingClientSince: 'asc' },
      include,
    }),
  ]);

  // Работа, срок которой прошёл, а просроченного этапа у неё нет. Так
  // выглядит почти вся перенесённая книга: этапов у неё нет, и сорванный
  // срок работы на сводке не появлялся вовсе — ответ говорил «ничего не
  // горит» при просроченных заказах (решение Р-216).
  const lateWorks = await prisma.project.findMany({
    // Приостановленная работа со сроком в прошлом — тоже работа с
    // прошедшим сроком: отчёт и аналитика считают её среди «действующих»,
    // а главная прежде молчала о ней, и счёт на двух экранах расходился
    // (решение Р-257). Её этапы в перечень просроченных не входят, поэтому
    // условие «нет просроченного этапа» к ней не применяется.
    where: {
      ...scope,
      dueOn: { lt: now },
      OR: [
        { status: 'ACTIVE', stages: { none: { state: live, dueOn: { lt: now } } } },
        { status: 'PAUSED' },
      ],
    },
    orderBy: [{ dueOn: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
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

  // Дело «ждёт клиента» гаснет, когда практика после этой даты написала
  // клиенту в переписке: напоминание уже сделано (М-06, М-21, Р-304).
  const nudged =
    stalled.length === 0
      ? []
      : await prisma.message.findMany({
          where: {
            projectId: { in: stalled.map((stage) => stage.projectId) },
            author: { role: { in: ['MANAGER', 'HEAD'] } },
            createdAt: {
              gt: new Date(Math.min(...stalled.map((stage) => stage.awaitingClientSince?.getTime() ?? Date.now()))),
            },
          },
          select: { projectId: true, createdAt: true },
        });
  const stillStalled = stalled.filter(
    (stage) =>
      !nudged.some(
        (message) =>
          message.projectId === stage.projectId &&
          stage.awaitingClientSince !== null &&
          message.createdAt > stage.awaitingClientSince,
      ),
  );

  return { overdue, stalled: stillStalled, lateWorks };
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
    // Сведённая карточка-дубль в реестр не попадает: её работы уже у
    // основной (решение Р-245).
    where: { ...mine, erasedAt: null, mergedIntoId: null },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    include: {
      // Работы — в пределах видимого: менеджер видел число и чужих работ
      // клиента, вопреки Р-149 (решение Р-245).
      projects: { where: scope, select: { id: true, status: true } },
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
  // Загрузка эксперта считается по видимым работам: менеджеру — по своим.
  // Прежде в число шли и чужие работы, и по разнице чисел менеджер узнавал
  // о работах, которые выборка от него закрывает (решение Р-251). Сам
  // перечень экспертов не сужается: назначать эксперта менеджер выбирает
  // из всех.
  const scope = scopeProjects(actor);
  const rows = await prisma.user.findMany({
    where: { role: 'EXPERT', status: 'ACTIVE' },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    include: {
      expertProfile: true,
      expertProjects: {
        where: scope ?? { id: { in: [] } },
        select: { id: true, status: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    // Пустая строка — то же, что «не указано»: так регалии заводились до
    // решения Р-225, и реестр печатал «Имя · » и пустую клетку.
    degree: row.expertProfile?.degree || null,
    specialization: row.expertProfile?.specialization || null,
    ndaSignedAt: row.expertProfile?.ndaSignedAt ?? null,
    // Действующие — идущие и приостановленные, как на «Сводке»; число
    // приостановленных — пометкой (Р-257; требование РК-04, решение Р-342).
    active: row.expertProjects.filter((p) => p.status === 'ACTIVE' || p.status === 'PAUSED').length,
    paused: row.expertProjects.filter((p) => p.status === 'PAUSED').length,
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
  /**
   * Верхняя граница даты заявки. Выгрузка перебирает страницы по одной, и
   * заявка, пришедшая посреди перебора, вставала первой строкой и сдвигала
   * страницы: последняя строка прочитанной страницы повторялась на
   * следующей (решение Р-252). Выгрузка фиксирует границу на момент начала.
   */
  readonly until?: Date;
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
  // Заявки, развёрнутые в чужие работы, менеджеру не видны ни в перечне,
  // ни в выгрузке — она идёт через эту же выборку (решение Р-251).
  const scope = scopeLeads(actor);
  if (scope === null) return { rows: [], total: 0, page: 1, pages: 1 };

  const query = (filter.query ?? '').trim();
  const where = {
    // Условие видимости стоит в AND: поиск ниже занимает собственный OR,
    // и сложение объектов одно из условий потеряло бы.
    AND: [scope],
    // Отзывы приходят той же формой и лежат в той же таблице; в перечне
    // обращений им не место — у них свой порядок работы (Р-111).
    form: { not: 'review' },
    ...(filter.until === undefined ? {} : { createdAt: { lte: filter.until } }),
    ...(filter.source ? { source: filter.source } : {}),
    // Состояние — из перечня; неизвестное значение — «любое»: прежде оно
    // уходило в базу и роняло экран и выгрузку ошибкой (решение Р-245).
    ...(filter.status && Object.hasOwn(LEAD_STATUS_LABEL, filter.status)
      ? { status: filter.status as 'NEW' }
      : {}),
    ...(query.length === 0
      ? {}
      : {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { contact: { contains: query, mode: 'insensitive' as const } },
            // Заявка из кабинета держит телефон отдельно от контакта
            // (Р-191): поиск «по телефону», обещанный в поле, его не видел
            // (решение Р-227).
            { phone: { contains: query, mode: 'insensitive' as const } },
            { organization: { contains: query, mode: 'insensitive' as const } },
            { topic: { contains: query, mode: 'insensitive' as const } },
            // Столбец «Тема» выводит `topic ?? need`: искать нужно и там.
            { need: { contains: query, mode: 'insensitive' as const } },
          ],
        }),
  };

  const total = await prisma.lead.count({ where });
  const pages = Math.max(1, Math.ceil(total / LEAD_LIST_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pages);

  const rows = await prisma.lead.findMany({
    where,
    // Здесь порядок обратный очереди: перечень просматривают сверху вниз,
    // и наверху должно быть свежее. Второй ключ — идентификатор: заявки с
    // одной секундой иначе менялись местами между страницами выгрузки
    // (решение Р-227).
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
      consentAcceptedAt: true,
      clientProfile: { select: { university: true, speciality: true, phone: true } },
    },
  });
  return {
    // Согласие спрашивается в форме, пока его нет в учётной записи
    // (решение Р-238).
    consentNeeded: user.consentAcceptedAt === null,
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
  /** Отметки согласия и акцепта с формы — нужны, пока согласия нет в записи. */
  readonly consent?: boolean;
  readonly terms?: boolean;
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
): Promise<{ id: string; authorName: string; filesLost: number }> {
  ensure(actor, 'REQUEST_CREATE');
  if (draft.topic.length === 0) throw new Error('Тема работы не указана');

  // Размер проверяется до заявки: прежде проверка стояла в цикле после
  // неё, и слишком большой второй файл оставлял заявку с первым, без
  // уведомления менеджерам, а повторная отправка давала дубль (Р-231).
  const files = (draft.files ?? [])
    .slice(0, REQUEST_FILES_MAX)
    .filter((file) => file.body.byteLength > 0);
  if (files.some((file) => file.body.byteLength > REQUEST_FILE_MAX_BYTES)) {
    throw new Error(
      `Файл больше допустимых ${Math.round(REQUEST_FILE_MAX_BYTES / 1024 / 1024)} МБ`,
    );
  }
  // Исполняемые файлы — до заявки, как и предел размера: отказ не оставляет
  // заявку без части вложений (требование Т-22, решение Р-296).
  for (const file of files) {
    const refusal = fileRefusal(file.originalName, file.body);
    if (refusal !== null) throw new Error(refusal);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true, fullName: true, consentVersion: true, consentAcceptedAt: true },
  });

  // Согласие на обработку и акцепт оферты. Прежде заявка из кабинета
  // помечалась согласованной со ссылкой на «согласие при первом входе»,
  // которого не существовало: учётная запись, заведённая руководителем
  // или переносом книги, согласия не давала никогда. Теперь согласие
  // либо уже записано (дано в заявке с сайта и перенесено при одобрении),
  // либо даётся здесь теми же отметками и той же редакцией, что на сайте
  // (решение Р-238).
  const accepted = user.consentAcceptedAt !== null;
  if (!accepted && !(draft.consent === true && draft.terms === true)) {
    throw new Error('Нужны согласие на обработку персональных данных и принятие оферты');
  }
  if (!accepted) {
    await prisma.user.update({
      where: { id: actor.id },
      data: { consentAcceptedAt: new Date(), consentVersion },
    });
  }

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
      // Согласие записано в учётной записи — ранее или только что; его
      // редакция хранится вместе с заявкой, как у обращений с сайта.
      consentGiven: true,
      consentVersion: accepted ? (user.consentVersion ?? consentVersion) : consentVersion,
      termsAccepted: true,
      ip: draft.ip,
    },
  });

  // Вложения кладутся после заявки: ключ объекта строится от её
  // идентификатора, а заявка без файлов остаётся действительной — отказ
  // хранилища не должен терять обращение (решение Р-191). Отказ на одном
  // файле не прерывает остальные и не отменяет уведомление: сколько файлов
  // не легло, человек узнаёт на экране (решение Р-231).
  let filesLost = 0;
  for (const file of files) {
    const key = leadAttachmentKey(lead.id, file.originalName);
    try {
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
    } catch (error) {
      filesLost += 1;
      console.error('Вложение заявки не сохранено', lead.id, error);
    }
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
      path: `/cabinet/manage/leads/${lead.id}`,
    });
  }

  return { id: lead.id, authorName: user.fullName, filesLost };
}

/**
 * Имена назначенных исполнителей для истории работы — только куратору и
 * руководителю (требование М-16, ОМ-24, решение Р-298). Имя берётся по
 * идентификатору при показе и в событие не пишется: иначе оно пережило бы
 * обезличивание.
 */
export async function executorNames(actor: Actor, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0 || !can(actor, 'PROJECT_ASSIGN_EXPERT')) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] }, role: 'EXPERT' },
    select: { id: true, fullName: true },
  });
  return new Map(rows.map((row) => [row.id, row.fullName]));
}

/**
 * Неразобранное по работе — для экрана подтверждения смены состояния
 * (требование М-09, ОМ-17, решение Р-299): после закрытия разобрать его
 * будет нельзя (Р-293).
 */
export async function pendingReview(
  actor: Actor,
  projectId: string,
): Promise<{ comments: number; versions: number; openStages: number }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, managerId: true, expertId: true },
  });
  if (project === null) return { comments: 0, versions: 0, openStages: 0 };
  ensure(actor, 'PROJECT_EDIT', project);
  const [comments, versions, openStages] = await Promise.all([
    prisma.versionComment.count({
      where: { moderationStatus: 'PENDING', version: { material: { projectId, deletedAt: null } } },
    }),
    prisma.versionModeration.count({
      where: { status: 'PENDING', version: { purgedAt: null, material: { projectId, deletedAt: null } } },
    }),
    // Незавершённые этапы — предупреждение при завершении работы (УМ-10, Р-378).
    prisma.stage.count({ where: { projectId, state: { not: 'DONE' } } }),
  ]);
  return { comments, versions, openStages };
}

/**
 * Новые дела рабочего экрана «Сегодня» (требование М-06, решение Р-304).
 *
 * Дела по работам — только по своим, где смотрящий куратор: экран общий с
 * руководителем, и чужие работы заняли бы его делами других. Заявки — общие
 * для всех, кто их разбирает. У каждого дела — экран, где его закрывают, и
 * условие, при котором оно исчезает само.
 */
export async function todayItems(actor: Actor) {
  const empty = {
    accepted: [] as { stageTitle: string; projectTitle: string; nextTitle: string | null; href: string }[],
    handedOver: [] as { stageTitle: string; projectTitle: string; handedOverAt: Date; href: string }[],
    noPlan: [] as { code: string; title: string; client: string }[],
    noExpert: [] as { code: string; title: string; client: string }[],
    noNda: [] as { code: string; title: string; expert: string }[],
    ndaWaiting: [] as { id: string; fullName: string; requestedAt: Date | null; works: number }[],
    week: [] as { key: string; title: string; dueOn: Date; href: string; turn: string | null }[],
    lateLeads: [] as { id: string; name: string | null; createdAt: Date }[],
    reviewLeads: [] as { id: string; name: string | null; status: string; since: Date }[],
  };
  if (!can(actor, 'REQUEST_MODERATE')) return empty;
  const at = new Date();
  const today = moscowToday(at);
  const DAY = 86_400_000;
  const inWeek = new Date(today.getTime() + 7 * DAY);

  const own = await prisma.project.findMany({
    where: { managerId: actor.id, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: {
      code: true,
      title: true,
      source: true,
      dueOn: true,
      expertId: true,
      expertNameRaw: true,
      client: { select: { fullName: true } },
      expert: { select: { fullName: true, expertProfile: { select: { ndaSignedAt: true } } } },
      stages: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          state: true,
          dueOn: true,
          handedOverAt: true,
          changes: {
            where: { toState: 'DONE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { via: true },
          },
        },
      },
    },
  });

  const out = { ...empty, accepted: [...empty.accepted], handedOver: [...empty.handedOver], noPlan: [...empty.noPlan], noExpert: [...empty.noExpert], noNda: [...empty.noNda], ndaWaiting: [...empty.ndaWaiting], week: [...empty.week] };
  for (const project of own) {
    const stages = project.stages;
    // Этап принят клиентом, по сроку или за клиента, а следующий не начат:
    // его пора запускать; у последнего — закрывать работу.
    const lastDone = stages.map((stage) => stage.state).lastIndexOf('DONE');
    if (lastDone >= 0 && stages.slice(lastDone + 1).every((stage) => stage.state === 'NOT_STARTED')) {
      const done = stages[lastDone]!;
      const via = done.changes[0]?.via ?? null;
      if (via === 'CLIENT_APPROVE' || via === 'AUTO_ACCEPT' || via === 'STAFF_FOR_CLIENT') {
        const next = stages[lastDone + 1] ?? null;
        out.accepted.push({
          stageTitle: done.title,
          projectTitle: project.title,
          nextTitle: next?.title ?? null,
          href: next === null ? `/cabinet/projects/${project.code}/status?to=COMPLETED` : `/cabinet/stages/${next.id}`,
        });
      }
    }
    // Куратор сдал этап: решение за менеджером — на согласование или
    // вернуть куратору с причиной (требование Э-05, решение Р-325).
    for (const stage of stages) {
      if (stage.state === 'IN_PROGRESS' && stage.handedOverAt !== null) {
        out.handedOver.push({
          stageTitle: stage.title,
          projectTitle: project.title,
          handedOverAt: stage.handedOverAt,
          href: `/cabinet/stages/${stage.id}`,
        });
      }
    }
    // Работы из книги заказов этапов и эксперта в кабинете не заводят
    // (ОМ-9): делами они не становятся.
    if (project.source !== 'IMPORT' && stages.length === 0) {
      out.noPlan.push({ code: project.code, title: project.title, client: project.client.fullName });
    }
    if (project.source !== 'IMPORT' && project.expertId === null && (project.expertNameRaw ?? '').trim() === '') {
      out.noExpert.push({ code: project.code, title: project.title, client: project.client.fullName });
    }
    // Руководителю то же дело приходит одним на куратора — «Нужен договор
    // поручения» ниже (Э-12, Р-331): по работе его не дублируем.
    if (
      actor.role !== 'HEAD' &&
      project.expert !== null &&
      (project.expert.expertProfile?.ndaSignedAt ?? null) === null
    ) {
      out.noNda.push({ code: project.code, title: project.title, expert: project.expert.fullName });
    }
    for (const stage of stages) {
      if (stage.state !== 'DONE' && stage.dueOn !== null && stage.dueOn >= today && stage.dueOn <= inWeek) {
        out.week.push({
          key: `stage-${stage.id}`,
          title: `${stage.title} · ${project.title}`,
          dueOn: stage.dueOn,
          href: `/cabinet/stages/${stage.id}`,
          // Подпись хода — та же, что на шкале и экране этапа (Р-288).
          turn: turnLabel(
            stage.state as StageStateKey,
            'curator',
            project.expertId !== null || (project.expertNameRaw ?? '').trim() !== '',
          ),
        });
      }
    }
    if (project.dueOn !== null && project.dueOn >= today && project.dueOn <= inWeek) {
      out.week.push({
        key: `work-${project.code}`,
        title: `Срок работы · ${project.title}`,
        dueOn: project.dueOn,
        href: `/cabinet/projects/${project.code}`,
        turn: null,
      });
    }
  }
  out.week.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());

  // Руководителю — кураторы без договора поручения: сообщили, что ждут
  // его, или назначены на действующую работу. Дело ведёт к строке
  // куратора в «Учётных записях» и гаснет при отметке договора
  // (требование Э-12, решение Р-331; дело РК-09).
  if (actor.role === 'HEAD') {
    const waiting = await prisma.user.findMany({
      where: {
        role: 'EXPERT',
        status: 'ACTIVE',
        AND: [
          { OR: [{ expertProfile: null }, { expertProfile: { ndaSignedAt: null } }] },
          {
            OR: [
              { expertProfile: { ndaRequestedAt: { not: null } } },
              { expertProjects: { some: { status: 'ACTIVE' } } },
            ],
          },
        ],
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        fullName: true,
        expertProfile: { select: { ndaRequestedAt: true } },
        _count: { select: { expertProjects: { where: { status: 'ACTIVE' } } } },
      },
    });
    for (const user of waiting) {
      out.ndaWaiting.push({
        id: user.id,
        fullName: user.fullName,
        requestedAt: user.expertProfile?.ndaRequestedAt ?? null,
        works: user._count.expertProjects,
      });
    }
  }

  // Заявки: новая без ответа дольше рабочего дня и заявки в разборе с
  // давностью (Lead.statusChangedAt).
  const leadScope = scopeLeads(actor) ?? {};
  const calendar = await loadCalendar();
  const lastWorkday = previousWorkday(today, calendar);
  const [late, review] = await Promise.all([
    prisma.lead.findMany({
      where: { ...leadScope, status: 'NEW', projectId: null, form: { not: 'review' }, createdAt: { lt: new Date(lastWorkday.getTime() + DAY - 3 * 3_600_000) } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.lead.findMany({
      where: { ...leadScope, status: { in: ['IN_PROGRESS', 'AWAITING_REPLY', 'CONSULTED'] }, projectId: null },
      orderBy: { statusChangedAt: 'asc' },
      take: 20,
      select: { id: true, name: true, status: true, statusChangedAt: true },
    }),
  ]);
  return {
    ...out,
    lateLeads: late,
    reviewLeads: review.map((lead) => ({ id: lead.id, name: lead.name, status: lead.status, since: lead.statusChangedAt })),
  };
}
