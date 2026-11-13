/**
 * «Редактировать заказ» (запрос владельца 13.11.2026, решение Р-872).
 *
 * Карточка заказа правится одним экраном: название, тема, описание, вид
 * работы, срок, срок согласования и сумма договора. Права — те же, что у
 * карточки и денег работы: руководитель по любой, менеджер по своей
 * (`PROJECT_EDIT`, `PAYMENT_EDIT`, Р-870). Закрытая и перенесённая из книги
 * работа правится тоже: закрытость запрещает этапы, а не учёт (Р-293
 * в этой части заменяется).
 *
 * Писем клиенту из-за правки полей карточки нет. Исключение прежнее —
 * перенос срока действующей работы, заведённой в кабинете: клиент получает
 * причину (УМ-12, Р-391). У закрытой работы и у работы из книги срок —
 * учётная правка: без причины и без письма.
 */

import { prisma } from '../db.ts';
import { ensure, scopeProjects, workClosed, type Actor } from './access.ts';
import { APPROVAL_DAYS_MAX, APPROVAL_DAYS_MIN } from './approval.ts';
import { record } from './audit.ts';
import { ORDER_FIELD_LABEL } from './code-labels.ts';
import { setOrderTotal } from './finance.ts';
import { orderBalance } from './money.ts';
import type { ProjectStatusKey } from './project-status.ts';
import type { OrderRowView } from './table-views.ts';
import { announceWorkDueChange, dueChange, normalizeName, projectRef } from './projects.ts';

export interface OrderEditInput {
  readonly projectId: string;
  /**
   * Когда карточка была прочитана формой (`Project.updatedAt`): правка,
   * сделанная в другой вкладке или другим сотрудником, молча не
   * затирается (приём Р-360, Р-467). `null` — без сверки.
   */
  readonly updatedAt: string | null;
  readonly title: string;
  readonly topic?: string | null;
  readonly summary?: string | null;
  readonly serviceTypeId: string;
  readonly dueOn: Date | null;
  /** Причина переноса срока действующей работы из кабинета: её читает клиент. */
  readonly dueReason?: string | null;
  /** Срок согласования этапа, рабочих дней; не передан — не меняется. */
  readonly approvalDays?: number;
  /** Сумма договора в копейках; `null` — поле пустое, сумма не меняется. */
  readonly contractTotal?: bigint | null;
}

export { ORDER_FIELD_LABEL };

type OrderField = keyof typeof ORDER_FIELD_LABEL;

const text = (value: string | null | undefined): string | null => {
  const clean = (value ?? '').trim();
  return clean === '' ? null : clean;
};

const dayKey = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/**
 * Сохранить карточку заказа. Карточка, срок с письмом о переносе, сумма
 * договора и журнал — одна транзакция: отказ суммы (ниже полученного) не
 * оставляет карточку наполовину сохранённой.
 */
export async function editOrder(actor: Actor, input: OrderEditInput): Promise<{ changed: OrderField[] }> {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);

  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (title.length === 0) throw new Error('Работа без названия не заводится');
  // Пределы — те же, что у карточки работы (Р-242, Р-279).
  if (title.length > 300) throw new Error('Название работы — не длиннее 300 знаков');
  const topic = text(input.topic);
  if ((topic ?? '').length > 500) throw new Error('Тема — не длиннее 500 знаков');
  const summary = text(input.summary);
  if ((summary ?? '').length > 2000) throw new Error('Описание — не длиннее 2000 знаков');
  if (
    input.approvalDays !== undefined &&
    (!Number.isInteger(input.approvalDays) ||
      input.approvalDays < APPROVAL_DAYS_MIN ||
      input.approvalDays > APPROVAL_DAYS_MAX)
  ) {
    throw new Error(
      `Срок согласования — от ${APPROVAL_DAYS_MIN} до ${APPROVAL_DAYS_MAX} рабочих дней: меньше пяти не допускает п. 7.2 оферты`,
    );
  }

  const before = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: {
      code: true,
      title: true,
      topic: true,
      summary: true,
      status: true,
      source: true,
      dueOn: true,
      approvalDays: true,
      updatedAt: true,
      serviceTypeId: true,
      serviceType: { select: { name: true } },
    },
  });
  if (input.updatedAt !== null && input.updatedAt !== before.updatedAt.toISOString()) {
    throw new Error('Заказ уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите');
  }

  // Вид работы — из справочника; снятый с действия вид остаётся у работы,
  // которая уже его носит, но новой не выбирается.
  const type =
    input.serviceTypeId === before.serviceTypeId
      ? { id: before.serviceTypeId, name: before.serviceType.name }
      : await prisma.serviceType.findFirst({ where: { id: input.serviceTypeId, isActive: true }, select: { id: true, name: true } });
  if (type === null) throw new Error('Выберите вид работы из справочника');

  // Срок, который уже был, у действующей работы из кабинета меняется с
  // причиной для клиента (УМ-12, Р-391). Закрытая работа и работа из книги
  // — учётная правка: причины и письма нет.
  const quiet = workClosed(before.status) || before.source === 'IMPORT';
  const shifted = before.dueOn !== null && dayKey(before.dueOn) !== dayKey(input.dueOn);
  const why = (input.dueReason ?? '').trim();
  if (shifted && !quiet) {
    if (why === '') {
      throw new Error('Срок работы переносится с причиной: её получит клиент — без неё перенос читается как срыв');
    }
    if (why.length > 1000) throw new Error('Причина переноса — не длиннее 1000 знаков');
  }

  const changed: OrderField[] = [];
  if (title !== before.title) changed.push('title');
  if (topic !== before.topic) changed.push('topic');
  if (summary !== before.summary) changed.push('summary');
  if (type.id !== before.serviceTypeId) changed.push('serviceType');
  if (dayKey(input.dueOn) !== dayKey(before.dueOn)) changed.push('dueOn');
  if (input.approvalDays !== undefined && input.approvalDays !== before.approvalDays) changed.push('approvalDays');

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.project.updateMany({
      where: { id: input.projectId, updatedAt: before.updatedAt },
      data: {
        title,
        topic,
        summary,
        serviceTypeId: type.id,
        dueOn: input.dueOn,
        ...(input.approvalDays === undefined ? {} : { approvalDays: input.approvalDays }),
      },
    });
    if (claimed.count === 0) {
      throw new Error('Заказ уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите');
    }
    if (shifted && !quiet) await announceWorkDueChange(tx, actor, input.projectId, before.dueOn, input.dueOn, why);
    if (input.contractTotal !== undefined && input.contractTotal !== null) {
      if (await setOrderTotal(tx, actor, ref, before.code, input.contractTotal)) changed.push('contract');
    }
    const cardChanged = changed.filter((field) => field !== 'contract');
    if (cardChanged.length > 0) {
      // В журнал — название и что изменилось; тексты темы и описания не
      // пишутся. Запись затирает обезличивание, как всю правку карточки
      // (Р-234).
      await record(
        actor,
        {
          action: 'PROJECT_EDITED',
          objectType: 'Project',
          objectId: input.projectId,
          projectId: input.projectId,
          payload: {
            title,
            fields: cardChanged,
            ...dueChange(before.dueOn, input.dueOn),
            ...(type.id === before.serviceTypeId ? {} : { serviceTypeFrom: before.serviceType.name, serviceTypeTo: type.name }),
            ...(input.approvalDays === undefined || input.approvalDays === before.approvalDays
              ? {}
              : { approvalDaysFrom: before.approvalDays, approvalDaysTo: input.approvalDays }),
          },
        },
        tx,
      );
    }
  });
  return { changed };
}

// ───────────────────── Перенос работы к другому клиенту ─────────────────────

/** Почему письмо прежнему клиенту не ушло: работу перенесли к другому (Р-873). */
export const CLIENT_MOVED_NOTE = 'работа перенесена к другому клиенту до отправки';

/** Карточки, к которым менеджер переносит работу: те же, что в «Новом заказе» (Р-419). */
function reachable(actor: Actor) {
  return actor.role === 'MANAGER' ? { projects: { none: { managerId: { not: actor.id } } } } : {};
}

const ALIVE = { mergedIntoId: null, erasedAt: null } as const;

/**
 * Что держит работу у прежнего клиента (решение Р-873).
 *
 * Клиент видит свою работу целиком: материалы, переписку, историю. Если у
 * работы есть материалы (в них и ФИО на титуле, и вложения заявки),
 * переписка с клиентом, его согласования и возвраты в истории или его
 * оценка, перенос открыл бы их новому клиенту — чужому человеку. Такую
 * работу кабинет не переносит: если это один человек с двумя карточками,
 * руководитель сводит карточки; если работа заведена не на того — её
 * заводят заново на нужного клиента. Работа без этого — чаще всего
 * перенесённая из книги или ручной заказ — переносится.
 */
export async function transferBlockers(actor: Actor, projectId: string): Promise<string[]> {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);
  const [card, materials, messages, clientEvents, rating] = await Promise.all([
    prisma.clientProfile.findUniqueOrThrow({ where: { id: ref.clientId }, select: { erasedAt: true } }),
    prisma.material.count({ where: { projectId, deletedAt: null } }),
    prisma.message.count({ where: { projectId, thread: 'CLIENT_MANAGER' } }),
    prisma.projectEvent.count({ where: { projectId, actor: { role: 'CLIENT' } } }),
    prisma.workRating.count({ where: { projectId } }),
  ]);
  const out: string[] = [];
  if (card.erasedAt !== null) out.push('данные прежнего клиента удалены по его требованию');
  if (materials > 0) out.push(`материалы работы — ${materials}`);
  if (messages > 0) out.push(`переписка с клиентом — ${messages}`);
  if (clientEvents > 0) out.push('согласования и возвраты клиента в истории работы');
  if (rating > 0) out.push('оценка сопровождения от клиента');
  return out;
}

export interface ClientCandidate {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly works: number;
}

/**
 * Карточки, к которым можно перенести работу, по части ФИО, почты или
 * телефона: живые, не текущая, менеджеру — только не занятые другим
 * менеджером (Р-419). Не больше двадцати: остальное уточняется запросом.
 */
export async function clientCandidates(actor: Actor, projectId: string, query: string): Promise<ClientCandidate[]> {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);
  const q = query.replace(/\s+/gu, ' ').trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/gu, '');
  const rows = await prisma.clientProfile.findMany({
    where: {
      ...ALIVE,
      ...reachable(actor),
      id: { not: ref.clientId },
      OR: [
        { normalizedName: { contains: normalizeName(q) } },
        { email: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        ...(digits.length >= 5 ? [{ phone: { contains: digits.slice(-7) } }] : []),
      ],
    },
    orderBy: [{ fullName: 'asc' }, { createdAt: 'asc' }],
    take: 20,
    select: { id: true, fullName: true, email: true, phone: true, user: { select: { email: true } }, _count: { select: { projects: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email ?? row.user?.email ?? null,
    phone: row.phone,
    works: row._count.projects,
  }));
}

/**
 * Перенести работу к другому существующему клиенту (запрос владельца
 * 13.11.2026, решение Р-873). Только с явным подтверждением: прежний
 * клиент сразу теряет доступ к работе — выборки кабинета строятся от
 * `Project.clientId`, своего доступа у клиента к работе нет. Его
 * неотправленные письма по работе гасятся. Договор, оплаты, этапы, заявка,
 * из которой работа заведена (она видна только практике), и строки книги
 * заказов остаются при работе: мост книги узнаёт строку по её ключу, а не по
 * карточке клиента. Писем клиентам нет; в истории работы — строка для
 * практики, клиенту она не показывается.
 */
export async function moveOrderToClient(
  actor: Actor,
  input: { readonly projectId: string; readonly clientId: string; readonly confirm: boolean },
): Promise<void> {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);
  if (input.clientId === '') throw new Error('Выберите карточку нового клиента');
  if (input.clientId === ref.clientId) throw new Error('Работа уже у этого клиента');
  if (!input.confirm) {
    throw new Error('Подтвердите перенос: прежний клиент сразу потеряет доступ к работе и её материалам');
  }
  const blockers = await transferBlockers(actor, input.projectId);
  if (blockers.length > 0) {
    throw new Error(`Работа не переносится: перенос открыл бы новому клиенту то, что относится к прежнему (${blockers.join('; ')})`);
  }
  const target = await prisma.clientProfile.findFirst({
    where: { id: input.clientId, ...ALIVE, ...reachable(actor) },
    select: { id: true },
  });
  if (target === null) {
    throw new Error(
      actor.role === 'MANAGER'
        ? 'Карточка не найдена или это клиент другого менеджера: такой перенос делает руководитель'
        : 'Карточка не найдена: она сведена в другую или удалена',
    );
  }
  const former = await prisma.clientProfile.findUniqueOrThrow({ where: { id: ref.clientId }, select: { userId: true } });

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.project.updateMany({
      where: { id: input.projectId, clientId: ref.clientId },
      data: { clientId: target.id },
    });
    if (claimed.count === 0) throw new Error('Клиента работы уже сменили: обновите страницу');
    // Неотправленное прежнему клиенту о работе не уходит (приём Р-421).
    if (former.userId !== null) {
      await tx.notificationOutbox.updateMany({
        where: { userId: former.userId, projectId: input.projectId, state: { in: ['PENDING', 'FAILED'] } },
        data: { state: 'EXPIRED', failure: null, lastError: CLIENT_MOVED_NOTE, scheduledAt: new Date() },
      });
    }
    await tx.projectEvent.create({
      data: { projectId: input.projectId, actorId: actor.id, kind: 'CLIENT_CHANGED', payload: { from: ref.clientId, to: target.id } },
    });
    await record(
      actor,
      {
        action: 'PROJECT_CLIENT_CHANGED',
        objectType: 'Project',
        objectId: input.projectId,
        projectId: input.projectId,
        payload: { from: ref.clientId, to: target.id },
      },
      tx,
    );
  });
}

// ──────────────────────────────── «Заказы» ─────────────────────────────────

export const ORDER_STATUS_FILTERS = ['all', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];
export const ORDER_DEBT_FILTERS = ['all', 'owing', 'settled'] as const;
export type OrderDebtFilter = (typeof ORDER_DEBT_FILTERS)[number];

/** Отбор из адреса: неизвестное значение — «все» (как Р-245). */
export function orderFilters(status: string | undefined, debt: string | undefined) {
  return {
    status: (ORDER_STATUS_FILTERS as readonly string[]).includes(status ?? '') ? (status as OrderStatusFilter) : 'all',
    debt: (ORDER_DEBT_FILTERS as readonly string[]).includes(debt ?? '') ? (debt as OrderDebtFilter) : 'all',
  } as const;
}

const owing = (row: OrderRowView) => (row.rest ?? 0n) > 0n;

/**
 * «Заказы» — книга заказов в кабинете (запрос владельца 13.11.2026,
 * решение Р-874): у руководителя все работы, у менеджера — свои
 * (`scopeProjects`, Р-149). Столбцы — как в книге владельца: дата,
 * заказчик, тип, описание, срок, стоимость, статус, оплачено и остаток.
 * Отбор — по состоянию работы и по долгу; числа у вкладок — по другому
 * отбору, как стоит на экране. Порядок — новые заказы сверху, строки
 * книги без даты заказа — в конце.
 *
 * Деньги здесь — договор и поступления, без маржи и вознаграждения
 * кураторов: их видит только руководитель на «Деньгах» (Р-870).
 */
export async function ordersTable(
  actor: Actor,
  filter: { readonly status: OrderStatusFilter; readonly debt: OrderDebtFilter },
): Promise<{
  readonly rows: OrderRowView[];
  readonly all: number;
  readonly byStatus: Record<OrderStatusFilter, number>;
  readonly byDebt: Record<OrderDebtFilter, number>;
}> {
  ensure(actor, 'REGISTRY_VIEW');
  const scope = scopeProjects(actor);
  if (scope === null) {
    return {
      rows: [],
      all: 0,
      byStatus: { all: 0, ACTIVE: 0, PAUSED: 0, COMPLETED: 0, CANCELLED: 0 },
      byDebt: { all: 0, owing: 0, settled: 0 },
    };
  }
  const projects = await prisma.project.findMany({
    where: scope,
    orderBy: [{ startedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { code: 'desc' }],
    select: {
      code: true,
      title: true,
      topic: true,
      status: true,
      dueOn: true,
      startedOn: true,
      client: { select: { fullName: true } },
      serviceType: { select: { name: true } },
      contract: {
        select: { totalAmount: true, tranches: { select: { id: true, amount: true, status: true, plannedDate: true } } },
      },
    },
  });
  const every: OrderRowView[] = projects.map((project) => {
    const balance =
      project.contract === null ? null : orderBalance(project.status, project.contract.totalAmount, project.contract.tranches);
    return {
      code: project.code,
      orderedOn: project.startedOn,
      client: project.client.fullName,
      type: project.serviceType.name,
      title: project.title,
      topic: project.topic,
      dueOn: project.dueOn,
      status: project.status as ProjectStatusKey,
      contract: balance?.contract ?? null,
      received: balance?.received ?? 0n,
      rest: balance?.rest ?? null,
      overpaid: balance?.overpaid ?? 0n,
    };
  });
  const byStatusOf = (row: OrderRowView, status: OrderStatusFilter) => status === 'all' || row.status === status;
  const byDebtOf = (row: OrderRowView, debt: OrderDebtFilter) =>
    debt === 'all' || (debt === 'owing' ? owing(row) : !owing(row));
  const inDebt = every.filter((row) => byDebtOf(row, filter.debt));
  const inStatus = every.filter((row) => byStatusOf(row, filter.status));
  return {
    rows: inStatus.filter((row) => byDebtOf(row, filter.debt)),
    all: every.length,
    byStatus: Object.fromEntries(
      ORDER_STATUS_FILTERS.map((status) => [status, inDebt.filter((row) => byStatusOf(row, status)).length]),
    ) as Record<OrderStatusFilter, number>,
    byDebt: Object.fromEntries(
      ORDER_DEBT_FILTERS.map((debt) => [debt, inStatus.filter((row) => byDebtOf(row, debt)).length]),
    ) as Record<OrderDebtFilter, number>,
  };
}
