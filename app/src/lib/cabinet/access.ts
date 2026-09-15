/**
 * Матрица прав личного кабинета — единственная точка принятия решения о
 * доступе. Критерий приёмки 10.4 брифа: права действуют на уровне сервера,
 * а не интерфейса.
 *
 * Три механизма, по одному на каждый тип ограничения в матрице:
 *
 *   1. `can` / `ensure` — разрешение действия. Ни один обработчик не
 *      содержит проверок роли в своём теле.
 *   2. `scopeProjects` и соседи — ограничение выборки. Списки, реестры,
 *      выгрузки и аналитика строятся только через них, поэтому правило
 *      «эксперт видит только назначенные проекты» невозможно забыть
 *      в отдельно написанном перечне.
 *   3. `presentProject` и соседи — ограничение полей. Контакты клиента,
 *      начисления и маржа не попадают в объект, который получает разметка.
 *      Показать телефон нельзя не потому, что он скрыт стилями, а потому,
 *      что такого свойства у объекта нет.
 *
 * Модуль намеренно не зависит от клиента базы во время выполнения: он
 * оперирует простыми значениями и возвращает фрагменты условий. Это
 * позволяет проверять матрицу тестами без поднятой базы.
 */

export type Role = 'CLIENT' | 'EXPERT' | 'MANAGER' | 'HEAD';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'ERASED';

/**
 * Действующее лицо запроса. Собирается один раз из сессии.
 *
 * `clientProfileId` заполняется только у клиента, `expertNdaSignedAt` —
 * только у эксперта: без договора поручения обработки персональных данных
 * (ч. 3 ст. 6 152-ФЗ) эксперт не получает доступа к материалам клиента,
 * даже будучи назначенным на проект.
 */
export interface Actor {
  readonly id: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly clientProfileId: string | null;
  readonly expertNdaSignedAt: Date | null;
}

/** Реквизиты проекта, достаточные для решения о доступе. */
export interface ProjectRef {
  readonly id: string;
  readonly clientId: string;
  readonly managerId: string;
  readonly expertId: string | null;
}

export const ACTIONS = [
  'PROJECT_VIEW',
  'PROJECT_EDIT',
  'PROJECT_ASSIGN_EXPERT',
  'STAGE_EDIT',
  'STAGE_SET_STATE',
  'STAGE_APPROVE',
  'MATERIAL_VIEW',
  'MATERIAL_UPLOAD',
  'COMMENT_CREATE',
  'COMMENT_MODERATE',
  'MESSAGE_READ',
  'MESSAGE_WRITE',
  'CONTACTS_VIEW',
  'CONTRACT_VIEW',
  'PAYMENT_EDIT',
  'PAYOUT_VIEW_OWN',
  'PAYOUT_MANAGE',
  'MARGIN_VIEW',
  'REQUEST_CREATE',
  'REQUEST_MODERATE',
  'REGISTRY_VIEW',
  'ANALYTICS_VIEW',
  'AUDIT_VIEW',
  'IMPORT_RUN',
  'DIRECTORY_EDIT',
  'USER_MANAGE',
  'ERASURE_EXECUTE',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Отказ в доступе. Обработчик превращает его в 403, отсутствие объекта — в 404. */
export class AccessDenied extends Error {
  readonly action: Action;

  constructor(action: Action) {
    super(`Действие ${action} не разрешено для этой роли`);
    this.name = 'AccessDenied';
    this.action = action;
  }
}

/** Клиент, которому принадлежит проект. */
function isOwnClient(actor: Actor, project: ProjectRef | null): boolean {
  if (actor.role !== 'CLIENT' || actor.clientProfileId === null) return false;
  return project !== null && project.clientId === actor.clientProfileId;
}

/**
 * Эксперт, назначенный на проект. Договор поручения обязателен: без него
 * назначение само по себе доступа не даёт.
 */
function isAssignedExpert(actor: Actor, project: ProjectRef | null): boolean {
  if (actor.role !== 'EXPERT' || actor.expertNdaSignedAt === null) return false;
  return project !== null && project.expertId === actor.id;
}

function isStaff(actor: Actor): boolean {
  return actor.role === 'MANAGER' || actor.role === 'HEAD';
}

/**
 * Разрешено ли действие. Для действий над проектом обязателен `project`:
 * без него отношение к объекту неизвестно, и ответ — «нет».
 */
export function can(actor: Actor, action: Action, project: ProjectRef | null = null): boolean {
  // Приостановленная и обезличенная учётные записи не делают ничего.
  if (actor.status !== 'ACTIVE') return false;

  const own = isOwnClient(actor, project);
  const assigned = isAssignedExpert(actor, project);
  const head = actor.role === 'HEAD';
  const staff = isStaff(actor);

  switch (action) {
    // ── Производство ──────────────────────────────────────────────────────
    case 'PROJECT_VIEW':
    case 'MATERIAL_VIEW':
    case 'MATERIAL_UPLOAD':
    case 'COMMENT_CREATE':
      return own || assigned || staff;

    case 'PROJECT_EDIT':
    case 'PROJECT_ASSIGN_EXPERT':
    case 'STAGE_EDIT':
    case 'STAGE_SET_STATE':
    case 'COMMENT_MODERATE':
      return staff;

    // Согласование этапа — действие клиента. Менеджер и руководитель могут
    // закрыть этап за него, эксперт — нет: он же его и выполнял.
    case 'STAGE_APPROVE':
      return own || staff;

    // ── Переписка ─────────────────────────────────────────────────────────
    // Канал один: клиент — менеджер. Эксперт высказывается комментариями
    // к версиям после модерации; прямой переписки с клиентом у него нет —
    // это и есть технический барьер против переманивания.
    case 'MESSAGE_READ':
    case 'MESSAGE_WRITE':
      return own || staff;

    // ── Персональные данные ───────────────────────────────────────────────
    case 'CONTACTS_VIEW':
      return staff;

    // ── Финансы ───────────────────────────────────────────────────────────
    // Клиент видит свой договор и статус оплаты; эксперт не видит ничего,
    // кроме собственного вознаграждения.
    case 'CONTRACT_VIEW':
      return own || staff;

    // Финансовый контур ведёт руководитель (PD-LK-FUNC-002, п. 3.2).
    case 'PAYMENT_EDIT':
    case 'PAYOUT_MANAGE':
    case 'MARGIN_VIEW':
      return head;

    case 'PAYOUT_VIEW_OWN':
      return actor.role === 'EXPERT' || head;

    // ── Заявки и реестры ──────────────────────────────────────────────────
    case 'REQUEST_CREATE':
      return actor.role === 'CLIENT';

    case 'REQUEST_MODERATE':
    case 'REGISTRY_VIEW':
      return staff;

    // ── Только руководитель ───────────────────────────────────────────────
    case 'ANALYTICS_VIEW':
    case 'AUDIT_VIEW':
    case 'IMPORT_RUN':
    case 'DIRECTORY_EDIT':
    case 'USER_MANAGE':
    case 'ERASURE_EXECUTE':
      return head;

    default: {
      // Новое действие, не описанное в матрице, запрещено по умолчанию.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** То же, но отказ выражается исключением. */
export function ensure(actor: Actor, action: Action, project: ProjectRef | null = null): void {
  if (!can(actor, action, project)) throw new AccessDenied(action);
}

// ═══════════════════════════════ Выборки ═══════════════════════════════════
//
// Фрагменты условий описаны структурно, а не типами Prisma: так модуль
// остаётся проверяемым без подключения к базе, а вызывающий код передаёт
// результат прямо в `where`.

/** Условие видимости проектов. `null` означает «не видно ничего». */
export function scopeProjects(actor: Actor): Record<string, unknown> | null {
  if (actor.status !== 'ACTIVE') return null;
  switch (actor.role) {
    case 'CLIENT':
      return actor.clientProfileId === null ? null : { clientId: actor.clientProfileId };
    case 'EXPERT':
      return actor.expertNdaSignedAt === null ? null : { expertId: actor.id };
    case 'MANAGER':
    case 'HEAD':
      return {};
  }
}

/** Условие видимости материалов — через проект, которому они принадлежат. */
export function scopeMaterials(actor: Actor): Record<string, unknown> | null {
  const projects = scopeProjects(actor);
  if (projects === null) return null;
  // Удалённые материалы не показываются никому, кроме руководителя:
  // ему они нужны при разборе требований об удалении данных.
  const base: Record<string, unknown> =
    actor.role === 'HEAD' ? {} : { deletedAt: null };
  return Object.keys(projects).length === 0 ? base : { ...base, project: projects };
}

/**
 * Условие видимости комментариев к версиям. Клиенту и эксперту видны только
 * опубликованные и собственные: комментарий эксперта не должен доходить до
 * клиента до модерации, и это обеспечивается сужением выборки, а не
 * условием в разметке.
 */
export function scopeComments(actor: Actor): Record<string, unknown> | null {
  if (actor.status !== 'ACTIVE') return null;
  if (isStaff(actor)) return {};
  return { OR: [{ moderationStatus: 'PUBLISHED' }, { authorId: actor.id }] };
}

/** Условие видимости начислений: эксперт видит только своё. */
export function scopePayouts(actor: Actor): Record<string, unknown> | null {
  if (actor.status !== 'ACTIVE') return null;
  if (actor.role === 'HEAD') return {};
  if (actor.role === 'EXPERT') return { expertId: actor.id };
  return null;
}

// ═══════════════════════════════ Поля ══════════════════════════════════════

/** Полный набор сведений о проекте, из которого собирается представление. */
export interface ProjectRecord extends ProjectRef {
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly client: {
    readonly id: string;
    readonly fullName: string;
    readonly university: string | null;
    readonly speciality: string | null;
    /** Далее — сведения, закрытые для клиента и эксперта. */
    readonly phone: string | null;
    readonly email: string | null;
  };
  readonly contractTotal: bigint | null;
  readonly payoutsTotal: bigint | null;
}

/** Представление проекта для клиента и эксперта. */
export interface ProjectPublicView {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly client: {
    readonly id: string;
    readonly fullName: string;
    readonly university: string | null;
    readonly speciality: string | null;
  };
}

/** Представление проекта для менеджера: добавлены контакты. */
export interface ProjectStaffView extends ProjectPublicView {
  readonly client: ProjectPublicView['client'] & {
    readonly phone: string | null;
    readonly email: string | null;
  };
  readonly contractTotal: bigint | null;
}

/** Представление проекта для руководителя: добавлена экономика. */
export interface ProjectHeadView extends ProjectStaffView {
  readonly payoutsTotal: bigint | null;
  readonly margin: bigint | null;
}

export type ProjectView = ProjectPublicView | ProjectStaffView | ProjectHeadView;

/**
 * Собрать представление проекта под роль. Свойства, к которым роль не
 * допущена, в результат не попадают — это и есть ограничение полей.
 */
export function presentProject(actor: Actor, project: ProjectRecord): ProjectView {
  const base: ProjectPublicView = {
    id: project.id,
    code: project.code,
    title: project.title,
    status: project.status,
    client: {
      id: project.client.id,
      fullName: project.client.fullName,
      university: project.client.university,
      speciality: project.client.speciality,
    },
  };

  if (!can(actor, 'CONTACTS_VIEW', project)) return base;

  const withContacts: ProjectStaffView = {
    ...base,
    client: {
      ...base.client,
      phone: project.client.phone,
      email: project.client.email,
    },
    contractTotal: project.contractTotal,
  };

  if (!can(actor, 'MARGIN_VIEW', project)) return withContacts;

  // Маржа нигде не хранится: сумма договора за вычетом начислений эксперту.
  // У исторических строк начислений нет, и маржа равна сумме договора —
  // отдельной ветви для них не требуется.
  const margin =
    project.contractTotal === null
      ? null
      : project.contractTotal - (project.payoutsTotal ?? 0n);

  const withMargin: ProjectHeadView = {
    ...withContacts,
    payoutsTotal: project.payoutsTotal,
    margin,
  };
  return withMargin;
}

/** Есть ли в представлении контактные данные клиента. Используется тестами. */
export function hasContacts(view: ProjectView): boolean {
  return 'phone' in view.client || 'email' in view.client;
}
