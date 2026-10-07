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
  /**
   * Сессия открыта ссылкой, которую выдал сотрудник (ОМ-3, Р-292). Прав
   * не меняет: согласование этапа в такой сессии записывается с пометкой.
   */
  readonly viaStaffLink?: boolean;
}

/**
 * Закрытая работа — только чтение (требования Т-17 и М-10, решение Р-293).
 *
 * Прежде службы загрузки и замечаний состояния работы и этапа не
 * проверяли: экраны прятали формы частично, а прямой вызов проходил. Одно
 * правило для служб и экранов:
 *
 * - работа завершена или отменена — материалы, замечания и их разбор
 *   закрыты всем ролям; карточка и исполнитель — тоже. Возобновить работу
 *   можно, и это снимает запрет;
 * - этап «Завершён» у действующей или приостановленной работы — клиенту и
 *   эксперту файлы и замечания не принимаются, практике — да;
 * - приостановленная работа — материалы, замечания и переписка работают.
 *
 * Документы оплат и переписка правилом не закрыты (Р-244).
 */
export function workClosed(projectStatus: string): boolean {
  return projectStatus === 'COMPLETED' || projectStatus === 'CANCELLED';
}

export const CLOSED_FOR_PRACTICE = 'Работа закрыта: чтобы изменить, возобновите её';
export const CLOSED_FOR_PARTY = 'Работа закрыта. Если нужно передать файл, напишите менеджеру';
export const STAGE_DONE_FOR_PARTY = 'Этап завершён. Если нужно передать файл, напишите менеджеру';

/** Текст отказа во вкладе в материалы и замечания или `null`, если можно. */
export function contributionRefusal(
  actor: Actor,
  projectStatus: string,
  stageState: string | null,
): string | null {
  const practice = actor.role === 'MANAGER' || actor.role === 'HEAD';
  if (workClosed(projectStatus)) return practice ? CLOSED_FOR_PRACTICE : CLOSED_FOR_PARTY;
  if (stageState === 'DONE' && !practice) return STAGE_DONE_FOR_PARTY;
  return null;
}

/** То же правило для служб: отказ — обычной ошибкой с текстом. */
export function ensureContributionOpen(actor: Actor, projectStatus: string, stageState: string | null): void {
  const refusal = contributionRefusal(actor, projectStatus, stageState);
  if (refusal !== null) throw new Error(refusal);
}

/**
 * Ветка «руководитель — сотрудник» (требование РК-07, решение Р-336):
 * руководитель — с любым менеджером, менеджер — только своя ветка. Куратор
 * в ветках не участвует (ответ С-2).
 */
export function staffThreadAllowed(actor: Actor, staffId: string): boolean {
  if (actor.status !== 'ACTIVE') return false;
  if (actor.role === 'HEAD') return true;
  return actor.role === 'MANAGER' && actor.id === staffId;
}

/** Карточка работы и исполнитель закрытой работы не правятся. */
export function ensureWorkOpen(projectStatus: string): void {
  if (workClosed(projectStatus)) throw new Error(CLOSED_FOR_PRACTICE);
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
  'PROJECT_SET_MANAGER',
  'STAGE_EDIT',
  'STAGE_SET_STATE',
  'STAGE_APPROVE',
  'STAGE_RETURN',
  'STAGE_HAND_OVER',
  'STAGE_HAND_BACK',
  'MATERIAL_VIEW',
  'MATERIAL_UPLOAD',
  'COMMENT_CREATE',
  'COMMENT_MODERATE',
  'MESSAGE_READ',
  'MESSAGE_WRITE',
  'INTERNAL_MESSAGE',
  'CONTACTS_VIEW',
  'CURATOR_CONTACTS_VIEW',
  'CLIENT_ACCESS_OPEN',
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
  // Поручения ставит только руководитель (требование РК-19, решение
  // Р-352; В-19).
  'ASSIGNMENT_CREATE',
  'FEEDBACK_REVIEW',
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
 * Практика по отношению к работе: руководитель — к любой, менеджер — к
 * той, где он куратор (решение Р-149).
 *
 * Прежде действия над работой разрешались всей практике: менеджер,
 * которому чужая работа не видна ни в одном перечне, мог перевести её
 * этап, написать её клиенту, опубликовать замечание или скачать файл по
 * прямому адресу — выборки держали разграничение, а права нет (решение
 * Р-220). Без работы вопрос о кураторстве не встаёт: так спрашивают
 * перечни, и их сужает `scopeProjects`.
 */
function isPracticeFor(actor: Actor, project: ProjectRef | null): boolean {
  if (actor.role === 'HEAD') return true;
  if (actor.role !== 'MANAGER') return false;
  return project === null || project.managerId === actor.id;
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
  const practice = isPracticeFor(actor, project);

  switch (action) {
    // ── Производство ──────────────────────────────────────────────────────
    case 'PROJECT_VIEW':
    case 'MATERIAL_VIEW':
    case 'MATERIAL_UPLOAD':
    case 'COMMENT_CREATE':
      return own || assigned || practice;

    case 'PROJECT_EDIT':
    case 'PROJECT_ASSIGN_EXPERT':
    case 'STAGE_EDIT':
    case 'STAGE_SET_STATE':
    case 'COMMENT_MODERATE':
      return practice;

    // Согласование этапа — действие клиента. Менеджер и руководитель могут
    // закрыть этап за него, эксперт — нет: он же его и выполнял.
    case 'STAGE_APPROVE':
      return own || practice;

    // Вернуть этап с замечаниями может только сам клиент: это его право по
    // п. 7.2 оферты. Практика возвращает этап обычным переводом
    // (решение Р-281).
    case 'STAGE_RETURN':
      return own;

    // Сдать этап менеджеру и отозвать сдачу — действие назначенного
    // куратора с договором поручения; вернуть сданный этап куратору с
    // причиной — практики работы. Состояние этапа куратор по-прежнему не
    // меняет (требование Э-05, решение Р-325).
    case 'STAGE_HAND_OVER':
      return assigned;

    case 'STAGE_HAND_BACK':
      return practice;

    // ── Переписка ─────────────────────────────────────────────────────────
    // Канал один: клиент — менеджер. Эксперт высказывается комментариями
    // к версиям после модерации; прямой переписки с клиентом у него нет —
    // это и есть технический барьер против переманивания.
    case 'MESSAGE_READ':
    case 'MESSAGE_WRITE':
      return own || practice;

    // Внутренняя переписка по работе — менеджер работы и руководитель;
    // клиенту и куратору — нет (требование РК-07, решение Р-336; Р-150,
    // ответ ОЭ-1, С-2). Без работы ветки нет.
    case 'INTERNAL_MESSAGE':
      return project !== null && practice;

    // ── Персональные данные ───────────────────────────────────────────────
    case 'CONTACTS_VIEW':
      return practice;

    // Способы связи куратора — менеджеру работ, где он назначен, и
    // руководителю; клиенту и другим кураторам — нет (требование Э-10,
    // решение Р-330; Р-298).
    case 'CURATOR_CONTACTS_VIEW':
      return project !== null && practice;

    // Открыть клиенту своей работы вход в кабинет: создать учётную запись
    // по почте карточки и выдать разовую ссылку. Прежде это умел только
    // руководитель (Р-195); решение владельца В-9 отдаёт это куратору
    // работы (решение Р-285). Без работы действие не разрешается:
    // `practice` при `project = null` разрешил бы менеджеру любое.
    case 'CLIENT_ACCESS_OPEN':
      return project !== null && practice;

    // ── Финансы ───────────────────────────────────────────────────────────
    // Клиент видит свой договор и статус оплаты; эксперт не видит ничего,
    // кроме собственного вознаграждения.
    case 'CONTRACT_VIEW':
      return own || practice;

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
    // Раздача работ между кураторами — распоряжение практикой, а не
    // ведение своей работы: менеджер не передаёт работы ни себе, ни
    // другому (решение Р-149).
    case 'PROJECT_SET_MANAGER':
    case 'ANALYTICS_VIEW':
    case 'AUDIT_VIEW':
    case 'IMPORT_RUN':
    case 'DIRECTORY_EDIT':
    case 'USER_MANAGE':
    case 'ERASURE_EXECUTE':
      return head;

    // Поручения ставит и отзывает руководитель (РК-19, Р-352; В-19).
    case 'ASSIGNMENT_CREATE':
    // Разбор замечаний с виджета — раз в неделю, у руководителя: он решает,
    // что править и в каком порядке (решение Р-403). Отдельное действие, а
    // не право на журналы: журналы — надзор, замечания — работа над сайтом,
    // и смешивать их значило бы выдавать одно вместе с другим.
    case 'FEEDBACK_REVIEW':
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
    // Менеджер ведёт свои работы, а не всю практику: он видит те, где
    // назначен куратором (решение Р-149). Руководитель видит всё.
    case 'MANAGER':
      return { managerId: actor.id };
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
 * Версии, которые видит клиент: без строки модерации или опубликованные
 * (требование Т-18, решение Р-294).
 */
export const CLIENT_VISIBLE_VERSION: Record<string, unknown> = {
  OR: [{ moderation: { is: null } }, { moderation: { is: { status: 'PUBLISHED' } } }],
};

/**
 * Условие видимости версий материалов (требование Т-18, решение Р-294).
 * Версия эксперта видна клиенту только после публикации куратором:
 * практике — всё, клиенту — опубликованные и не требующие публикации,
 * эксперту — то же плюс свои. Сужается выборка, а не разметка — как у
 * замечаний.
 */
export function scopeVersions(actor: Actor): Record<string, unknown> | null {
  if (actor.status !== 'ACTIVE') return null;
  if (isStaff(actor)) return {};
  if (actor.role === 'EXPERT') {
    return { OR: [CLIENT_VISIBLE_VERSION, { uploadedById: actor.id }] };
  }
  return CLIENT_VISIBLE_VERSION;
}

/** Видна ли версия этому человеку — то же правило для одной строки. */
export function versionVisible(
  actor: Actor,
  version: { readonly uploadedById: string; readonly moderation: { readonly status: string } | null },
): boolean {
  if (isStaff(actor)) return true;
  if (version.moderation === null || version.moderation.status === 'PUBLISHED') return true;
  return actor.role === 'EXPERT' && version.uploadedById === actor.id;
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

/**
 * Условие видимости заявок для того, кто их разбирает (решение Р-251).
 *
 * Неразобранная заявка работы не имеет и видна всем, кто разбирает
 * заявки. Развёрнутая в работу — только тому, кому видна сама работа:
 * прежде менеджер через перечень, выгрузку и карточку заявки читал
 * контакты и вложения по чужим работам, которые выборка работ от него
 * закрывает (Р-149). Руководитель видит всё.
 */
export function scopeLeads(actor: Actor): Record<string, unknown> | null {
  if (actor.status !== 'ACTIVE') return null;
  if (!isStaff(actor)) return null;
  const projects = scopeProjects(actor);
  if (projects === null) return { projectId: null };
  if (Object.keys(projects).length === 0) return {};
  return { OR: [{ projectId: null }, { project: projects }] };
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

/**
 * Текст замечаний клиента при возврате этапа — так, как его можно показать
 * смотрящему (решение Р-281, О-5).
 *
 * Клиент и практика видят текст всегда. Эксперт видит его, только если в
 * тексте нет телефона, почты или ссылки на мессенджер: прямого канала
 * «клиент — эксперт» нет (Р-150), и замечание с контактом стало бы им.
 * Вместо такого текста эксперту — строка «Замечания у куратора».
 */
export function presentReturnText(
  actor: Actor,
  change: { readonly reason: string | null; readonly contactHint: boolean },
): string | null {
  if (change.reason === null) return null;
  if (actor.role === 'EXPERT' && change.contactHint) return RETURN_TEXT_WITH_CURATOR;
  return change.reason;
}

/** Что видит эксперт вместо замечаний с контактом. */
export const RETURN_TEXT_WITH_CURATOR = 'Замечания у менеджера: в тексте были контакты.';

/**
 * Причина перевода этапа или работы в истории работы — так, как её можно
 * показать смотрящему (решение Р-414).
 *
 * Причину пишет практика для клиента: остановка, отмена, возврат в работу,
 * «ждём материалы». В ней бывают контакты и обстоятельства клиента, а
 * прямого канала «клиент — куратор» нет (Р-150), поэтому куратор видит
 * переход без причины — так же, как в письмах ему (Э-09, Р-328). Клиент и
 * практика видят причину целиком.
 */
export function presentClientReason(actor: Actor, reason: unknown): string | null {
  if (typeof reason !== 'string' || reason === '') return null;
  return actor.role === 'EXPERT' ? null : reason;
}

// ─────────────────────── Представление участника работы ────────────────────

/**
 * Роль куратора в работе — для практики (требование Т-11, решение Р-297).
 * Клиент роли не видит: для него куратор при любой роли — «Куратор»
 * (Э-01, ответ ОЭ-3а). ФИО и контакты куратора клиенту не показываются
 * (Р-150).
 */
export const EXPERT_ROLE_LABEL = {
  SUBJECT_EXPERT: 'Куратор по специальности',
  METHODOLOGIST: 'Методолог',
  SCIENCE_EDITOR: 'Научный редактор',
} as const;

export type ExpertRoleKey = keyof typeof EXPERT_ROLE_LABEL;

export function expertRoleLabel(role: string | null | undefined): string {
  return EXPERT_ROLE_LABEL[(role ?? 'SUBJECT_EXPERT') as ExpertRoleKey] ?? EXPERT_ROLE_LABEL.SUBJECT_EXPERT;
}

/** Как клиент называет куратора — при любой роли в работе (ОЭ-3а). */
export const CURATOR_FOR_CLIENT = 'Куратор';

/**
 * Как назвать автора файла, замечания или события. Себя смотрящий видит
 * как «Вы»; клиент куратора — «Куратор», менеджера и руководителя —
 * «Менеджер», без имён (Э-01, ответы ОЭ-3а, ОЭ-3б и С-3); остальные видят
 * имя.
 */
export function presentAuthor(
  author: { readonly fullName: string; readonly role: string },
  viewer: { readonly id?: string; readonly role: string },
  authorId?: string,
): string {
  if (authorId !== undefined && authorId === viewer.id) return 'Вы';
  if (viewer.role === 'CLIENT' && author.role === 'EXPERT') return CURATOR_FOR_CLIENT;
  if (viewer.role === 'CLIENT' && (author.role === 'MANAGER' || author.role === 'HEAD')) return 'Менеджер';
  return author.fullName;
}

/** Регалии без пустых частей: «к. т. н., 2.8.6». */
function regalia(parts: readonly (string | null | undefined)[]): string {
  return parts.map((part) => (part ?? '').trim()).filter((part) => part !== '').join(', ');
}

/** «Куратор — ФИО, степень, специальность»: пустые части не выводятся. */
export function curatorLine(manager: {
  readonly fullName: string;
  readonly expertProfile: { readonly degree: string | null; readonly specialization: string | null } | null;
}): string {
  return regalia([manager.fullName, manager.expertProfile?.degree, manager.expertProfile?.specialization]);
}

/** «Степень, шифр» эксперта для клиента — без ФИО и контактов. */
export function expertLine(profile: { readonly degree: string | null; readonly specialtyCode: string | null } | null): string {
  return regalia([profile?.degree, profile?.specialtyCode]);
}

/** Роли, чьё имя и почта не попадают в данные экрана клиента. */
const HIDDEN_FROM_CLIENT: readonly string[] = ['EXPERT', 'MANAGER', 'HEAD'];

/**
 * Поля, которые клиенту не отдаются. Сдача этапа куратором менеджеру —
 * внутреннее дело практики, для клиента этап остаётся «В работе»
 * (требование Э-05, решение Р-325). День решения о публикации версии
 * куратора — след модерации, его видит только куратор (Э-06, Р-326).
 */
const INTERNAL_FOR_CLIENT: readonly string[] = [
  'handedOverAt',
  'handoverNote',
  'handbackAt',
  'handbackReason',
  'decidedAt',
];

/**
 * Данные экрана клиента без ФИО и почты сотрудников (требование Т-11,
 * решение Р-297; Э-01, ответ ОЭ-3б).
 *
 * Экран клиента не печатает имени эксперта (Р-143, Р-277), а с Э-01 — и
 * имени менеджера: клиент видит «Менеджер». Выборки брали имена вместе с
 * авторами версий, замечаний, сообщений и событий. Ограничение полей
 * снимает их с данных: у любого вложенного объекта с ролью сотрудника имя
 * и почта пустеют. Заодно снимаются служебные поля сдачи этапа куратором
 * (Э-05, Р-325). Сотрудникам и куратору данные отдаются как есть.
 */
export function withoutStaffNames<T>(viewer: Actor, value: T): T {
  if (viewer.role !== 'CLIENT') return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return node;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) {
      if (!INTERNAL_FOR_CLIENT.includes(key)) out[key] = walk(item);
    }
    const hidden = typeof out.role === 'string' && HIDDEN_FROM_CLIENT.includes(out.role);
    if (hidden && 'fullName' in out) out.fullName = '';
    if (hidden && 'email' in out) out.email = '';
    return out;
  };
  return walk(value) as T;
}

/**
 * Исполнитель работы для практики: «эксперт — ФИО · без договора
 * поручения» (требование М-16, решение Р-298). Клиенту не показывается.
 */
export function staffExpertLine(
  expert: { readonly fullName: string; readonly expertProfile: { readonly ndaSignedAt: Date | null } | null } | null,
  expertNameRaw?: string | null,
): string {
  if (expert !== null) {
    const nda = expert.expertProfile?.ndaSignedAt ?? null;
    return `куратор — ${expert.fullName}${nda === null ? ' · без договора поручения' : ''}`;
  }
  const raw = (expertNameRaw ?? '').trim();
  return raw === '' ? 'куратор не назначен' : `куратор — ${raw}`;
}
