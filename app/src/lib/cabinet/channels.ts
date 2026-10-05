/**
 * Как с человеком связываться и какое событие каким каналом приходит.
 *
 * Два понятия разведены сознательно (решение Р-198):
 *
 * **Канал доставки** — то, что умеет система: письмо и Telegram. Им
 * занимается очередь уведомлений, и другого в ней быть не может: звонить
 * и писать в соцсетях приложение не умеет, а обещать то, чего нет, —
 * худший способ потерять доверие.
 *
 * **Способ связи** — то, что человек сообщает о себе: «звоните»,
 * «пишите в мессенджер», «ведите полностью сами». Это справочные
 * сведения для куратора, а не команда машине. Куратор их видит и так и
 * поступает.
 *
 * Правка ограничена своей учётной записью по построению: чужой
 * идентификатор в эти функции не передаётся вовсе.
 */

import { ensure, type Actor, type ProjectRef } from './access.ts';
import { record } from './audit.ts';

import { prisma } from '../db.ts';

export type ContactKind = 'EMAIL' | 'TELEGRAM' | 'PHONE_CALL' | 'MESSENGER' | 'FULL_SUPPORT';

export const CONTACT_LABEL: Record<ContactKind, string> = {
  EMAIL: 'Письмо на почту',
  TELEGRAM: 'Сообщение в Telegram',
  PHONE_CALL: 'Звонок менеджера',
  MESSENGER: 'Мессенджер или социальная сеть',
  FULL_SUPPORT: 'Полное сопровождение',
};

/** Что человек получит, выбрав этот способ. Пишется на экране под строкой. */
export const CONTACT_NOTE: Record<ContactKind, string> = {
  EMAIL: 'Уведомления и ответы менеджера приходят письмом.',
  TELEGRAM: 'То же, но сообщением в Telegram — быстрее письма.',
  PHONE_CALL: 'Менеджер звонит по важным поворотам работы, а не по каждой мелочи.',
  MESSENGER: 'Менеджер пишет туда, где вам удобно отвечать.',
  FULL_SUPPORT: 'Менеджер ведёт работу сам и связывается первым, не дожидаясь вопросов.',
};

/** Нужен ли этому способу адрес или номер. */
export function needsValue(kind: ContactKind): boolean {
  return kind === 'PHONE_CALL' || kind === 'MESSENGER';
}

export interface ContactRow {
  readonly id: string;
  readonly kind: ContactKind;
  readonly value: string | null;
  readonly note: string | null;
  readonly preferred: boolean;
}

/** Способы связи своей учётной записи. */
export async function ownContacts(actor: Actor): Promise<ContactRow[]> {
  const rows = await prisma.contactChannel.findMany({
    where: { userId: actor.id },
    orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, kind: true, value: true, note: true, preferred: true },
  });
  return rows as ContactRow[];
}

/**
 * Способы связи человека — для куратора.
 *
 * Право то же, что на контакты клиента: телефон и ссылка на мессенджер
 * — персональные данные, и эксперту они не видны (решение Р-122).
 */
export async function contactsOf(
  actor: Actor,
  project: ProjectRef,
  userId: string,
): Promise<ContactRow[]> {
  // Право проверяется по работе: контакты клиента видит куратор его
  // работы, а не любой менеджер практики (решение Р-220).
  ensure(actor, 'CONTACTS_VIEW', project);
  const rows = await prisma.contactChannel.findMany({
    where: { userId },
    orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, kind: true, value: true, note: true, preferred: true },
  });
  return rows as ContactRow[];
}

/**
 * Способы связи куратора работы — менеджеру этой работы и руководителю
 * (требование Э-10, решение Р-330; Р-298). Клиенту они не отдаются ни на
 * экране, ни в данных: связь с куратором идёт через менеджера.
 */
export async function curatorContacts(actor: Actor, project: ProjectRef): Promise<ContactRow[]> {
  ensure(actor, 'CURATOR_CONTACTS_VIEW', project);
  if (project.expertId === null) return [];
  const rows = await prisma.contactChannel.findMany({
    where: { userId: project.expertId },
    orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, kind: true, value: true, note: true, preferred: true },
  });
  return rows as ContactRow[];
}

export interface ContactInput {
  readonly kind: ContactKind;
  readonly value?: string | null;
  readonly note?: string | null;
  readonly preferred?: boolean;
}

/** Предел длины способа связи и заметки к нему. */
export const CONTACT_MAX = 500;

/** Добавить способ связи себе. */
export async function addContact(actor: Actor, input: ContactInput): Promise<void> {
  const value = (input.value ?? '').trim();
  const note = (input.note ?? '').trim();
  // Пределы длины: телефон и ссылка не бывают длиннее, а заметка — это
  // «звонить после шести», а не письмо (решение Р-242).
  if (value.length > CONTACT_MAX || note.length > CONTACT_MAX) {
    throw new Error(`Способ связи и заметка к нему — не длиннее ${CONTACT_MAX} знаков`);
  }
  if (needsValue(input.kind) && value.length === 0) {
    throw new Error(
      input.kind === 'PHONE_CALL'
        ? 'Укажите номер телефона: без него звонок не состоится'
        : 'Укажите ссылку или имя в мессенджере',
    );
  }

  await prisma.$transaction(async (tx) => {
    if (input.preferred === true) {
      await tx.contactChannel.updateMany({
        where: { userId: actor.id },
        data: { preferred: false },
      });
    }
    await tx.contactChannel.create({
      data: {
        userId: actor.id,
        kind: input.kind,
        value: needsValue(input.kind) ? value : null,
        note: note || null,
        preferred: input.preferred === true,
      },
    });
  });

  // Что именно человек указал, в журнал не пишется: там был бы его
  // телефон, а журнал живёт дольше самих сведений.
  await record(actor, {
    action: 'CONTACT_ADDED',
    objectType: 'ContactChannel',
    objectId: actor.id,
    payload: { kind: input.kind },
  });
}

/** Убрать свой способ связи. */
export async function dropContact(actor: Actor, id: string): Promise<void> {
  const removed = await prisma.contactChannel.deleteMany({
    where: { id, userId: actor.id },
  });
  if (removed.count === 0) return;
  await record(actor, {
    action: 'CONTACT_REMOVED',
    objectType: 'ContactChannel',
    objectId: actor.id,
  });
}

/** Назначить способ предпочтительным. */
export async function preferContact(actor: Actor, id: string): Promise<void> {
  const own = await prisma.contactChannel.findFirst({
    where: { id, userId: actor.id },
    select: { id: true, kind: true },
  });
  if (own === null) return;
  await prisma.$transaction([
    prisma.contactChannel.updateMany({ where: { userId: actor.id }, data: { preferred: false } }),
    prisma.contactChannel.update({ where: { id: own.id }, data: { preferred: true } }),
  ]);
  await record(actor, {
    action: 'CONTACT_PREFERRED',
    objectType: 'ContactChannel',
    objectId: actor.id,
    payload: { kind: own.kind },
  });
}

/* ------------------------------------------------------------------ */
/* Правила: какое событие каким каналом                                */
/* ------------------------------------------------------------------ */

export type Channel = 'EMAIL' | 'TELEGRAM';

export interface RuleRow {
  readonly eventKind: string;
  readonly channel: Channel;
  readonly enabled: boolean;
}

/**
 * Виды событий, которые человек разводит по каналам.
 *
 * Перечень закрыт и совпадает с тем, что очередь ставит практике и
 * куратору: сетку видят менеджер, руководитель и куратор (требование Э-09,
 * решение Р-328). Прежде в ней стояли события,
 * которые уходят одному клиенту (этап ждёт клиента, этап на
 * согласовании, срок через три дня), и «новое сообщение», которого
 * очередь не ставила вовсе: снятая галочка ничем не управляла (решение
 * Р-228).
 */
export const RULE_EVENTS: readonly {
  readonly kind: string;
  readonly title: string;
  /** Группа строк сетки (требование М-07, решение Р-300). */
  readonly group: string;
  /** Кому строка показывается: событие, которое роли не приходит, ею не правится. */
  readonly roles: readonly ('MANAGER' | 'HEAD' | 'EXPERT')[];
}[] = [
  // Приёмка этапа: следующий этап и оплата зависят от неё, а куратор
  // прежде узнавал о ней, только открыв кабинет (решение Р-282).
  { kind: 'STAGE_APPROVED', title: 'Этап согласован или принят по сроку', group: 'Приёмка этапа', roles: ['MANAGER', 'HEAD'] },
  { kind: 'STAGE_RETURNED', title: 'Клиент вернул этап с замечаниями', group: 'Приёмка этапа', roles: ['MANAGER', 'HEAD'] },
  { kind: 'STAGE_HANDED_OVER', title: 'Куратор сдал этап', group: 'Приёмка этапа', roles: ['MANAGER', 'HEAD'] },
  // Материалы и замечания: замечание клиента и то, что ждёт публикации,
  // прежде до куратора не доходили (требование М-07, решение Р-300).
  { kind: 'VERSION_UPLOADED', title: 'Приложена новая версия материала', group: 'Материалы и замечания', roles: ['MANAGER', 'HEAD'] },
  { kind: 'MODERATION_PENDING', title: 'Замечания или версии куратора ждут публикации', group: 'Материалы и замечания', roles: ['MANAGER', 'HEAD'] },
  { kind: 'CLIENT_COMMENT', title: 'Клиент оставил замечание к версии', group: 'Материалы и замечания', roles: ['MANAGER', 'HEAD'] },
  // Сроки этапов теперь приходят и куратору: за три дня и при срыве
  // (требование М-08, решение Р-301).
  { kind: 'DEADLINE_IN_3_DAYS', title: 'Срок этапа через три дня', group: 'Сроки', roles: ['MANAGER', 'HEAD'] },
  { kind: 'DEADLINE_MISSED', title: 'Срок этапа сорван', group: 'Сроки', roles: ['MANAGER', 'HEAD'] },
  { kind: 'MESSAGE_RECEIVED', title: 'Клиент написал в переписке', group: 'Переписка и работы', roles: ['MANAGER', 'HEAD'] },
  { kind: 'CURATOR_ASSIGNED', title: 'Вам передана работа', group: 'Переписка и работы', roles: ['MANAGER', 'HEAD'] },
  // Прежнему менеджеру — работа ушла к другому (РК-08, Р-344).
  { kind: 'WORK_TRANSFERRED', title: 'Работа передана другому менеджеру', group: 'Переписка и работы', roles: ['MANAGER', 'HEAD'] },
  // Куратору ваших работ отмечен договор поручения (УМ-05, Р-375).
  { kind: 'CURATOR_NDA_SIGNED', title: 'Куратору ваших работ открыт доступ к материалам', group: 'Переписка и работы', roles: ['MANAGER'] },
  // Обращения с сайта идут своим путём, сразу в оба канала практики, и
  // правилами не разводятся (Р-161).
  { kind: 'REQUEST_CREATED', title: 'Новое обращение из кабинета', group: 'Переписка и работы', roles: ['MANAGER', 'HEAD'] },
  // Внутренняя переписка по работе и ветка с руководителем (РК-07, Р-336).
  { kind: 'INTERNAL_MESSAGE', title: 'Сообщение во внутренней переписке по работе', group: 'Переписка и работы', roles: ['MANAGER', 'HEAD'] },
  { kind: 'HEAD_REPLY', title: 'Руководитель ответил в переписке', group: 'Переписка и работы', roles: ['MANAGER'] },
  // Поручения руководителя (РК-19, Р-352).
  { kind: 'ASSIGNMENT_CREATED', title: 'Руководитель поставил поручение', group: 'Переписка и работы', roles: ['MANAGER'] },
  { kind: 'ASSIGNMENT_DUE', title: 'Завтра срок поручения', group: 'Переписка и работы', roles: ['MANAGER'] },
  { kind: 'ASSIGNMENT_DONE', title: 'Поручение выполнено', group: 'Руководителю', roles: ['HEAD'] },
  // Только руководителю: вопрос сотрудника (вместо «Менеджер просит
  // помощи», РК-07), выдача входа клиенту (Р-285) и договор поручения
  // (Р-298). Менеджеру эти строки ничем не управляли.
  { kind: 'STAFF_QUESTION', title: 'Вопрос сотрудника', group: 'Руководителю', roles: ['HEAD'] },
  { kind: 'CLIENT_ACCESS_OPENED', title: 'Менеджер открыл вход клиенту', group: 'Руководителю', roles: ['HEAD'] },
  { kind: 'NDA_NEEDED', title: 'Нужен договор поручения', group: 'Руководителю', roles: ['HEAD'] },
  // Клиент запросил удаление данных из «Настроек» (часть F, П-08, Р-400).
  { kind: 'CLIENT_ERASURE_REQUEST', title: 'Клиент просит удалить персональные данные', group: 'Руководителю', roles: ['HEAD'] },
  // Куратор сам сообщил, что ждёт договор (Э-12, Р-331).
  { kind: 'NDA_WAITING', title: 'Куратор ждёт договор поручения', group: 'Руководителю', roles: ['HEAD'] },
  // Сбой отправки — тем каналом, который работает (РК-02, Р-334).
  { kind: 'OUTBOX_FAILED', title: 'Уведомления не доставлены', group: 'Руководителю', roles: ['HEAD'] },
  // Возврат завершённого этапа в работу — руководителю (М-11, Р-303).
  { kind: 'STAGE_REOPENED', title: 'Этап возвращён в работу', group: 'Руководителю', roles: ['HEAD'] },
  // Этап принят — акт и счёт за следующий этап (РК-12, Р-338).
  { kind: 'STAGE_ACCEPTED', title: 'Этап принят: акт и счёт', group: 'Руководителю', roles: ['HEAD'] },
  // Договор, заведённый менеджером в «Новом заказе» (М-18, Р-308).
  { kind: 'ORDER_WITH_CONTRACT', title: 'Менеджер завёл заказ с договором', group: 'Руководителю', roles: ['HEAD'] },
  // Утренняя сводка дел и просроченный платёж (РК-13, Р-347).
  { kind: 'HEAD_DIGEST', title: 'Утренняя сводка дел по рабочим дням', group: 'Руководителю', roles: ['HEAD'] },
  { kind: 'TRANCHE_OVERDUE', title: 'Просрочен платёж по траншу', group: 'Руководителю', roles: ['HEAD'] },
  // Письмо 1-го числа — рекомендации на месяц (РК-17, Р-350).
  { kind: 'HEAD_MONTHLY', title: 'Рекомендации на месяц (1-го числа)', group: 'Руководителю', roles: ['HEAD'] },
  // Куратору — события его работ (требование Э-09, решение Р-328).
  // Приглашение и отметка договора поручения приходят до того, как
  // куратор откроет настройки, и строками не разводятся.
  { kind: 'CURATOR_TURN', title: 'Ход за вами: этап запущен или возвращён', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'STAGE_RETURNED', title: 'Клиент вернул этап с замечаниями', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'VERSION_UPLOADED', title: 'Приложена новая версия материала', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'EXPERT_DECISION', title: 'Менеджер опубликовал вашу версию или решил по замечанию', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'VERSION_REJECTED', title: 'Ваша версия не опубликована', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'DEADLINE_IN_3_DAYS', title: 'Срок этапа через три дня', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'DEADLINE_MISSED', title: 'Срок этапа сорван', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'STAGE_DUE_CHANGED', title: 'Изменён срок этапа', group: 'Работа куратора', roles: ['EXPERT'] },
  // Срок всей работы — с причиной (УМ-12, Р-391).
  { kind: 'PROJECT_DUE_CHANGED', title: 'Изменён срок работы', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'STAGE_APPROVED', title: 'Этап согласован или принят по сроку', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'PROJECT_STATUS_CHANGED', title: 'Работа приостановлена, возобновлена, завершена или отменена', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'WORK_ASSIGNED', title: 'Вас назначили куратором работы', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'WORK_UNASSIGNED', title: 'Работа передана другому куратору', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'MANAGER_CHANGED', title: 'Сменился менеджер работы', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'ASSIGNMENT_CREATED', title: 'Руководитель поставил поручение', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'ASSIGNMENT_DUE', title: 'Завтра срок поручения', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'PAYOUT_ACCRUED', title: 'Начислено вознаграждение', group: 'Работа куратора', roles: ['EXPERT'] },
  { kind: 'PAYOUT_PAID', title: 'Вознаграждение выплачено', group: 'Работа куратора', roles: ['EXPERT'] },
];

/** Строки сетки для роли (требование М-07, решение Р-300). */
export function rulesFor(role: string): readonly (typeof RULE_EVENTS)[number][] {
  return RULE_EVENTS.filter((event) => (event.roles as readonly string[]).includes(role));
}

/** Правила своей учётной записи. */
export async function ownRules(actor: Actor): Promise<RuleRow[]> {
  const rows = await prisma.notifyRule.findMany({
    where: { userId: actor.id },
    select: { eventKind: true, channel: true, enabled: true },
  });
  return rows as RuleRow[];
}

/**
 * Переписать правила целиком: форма присылает состояние всей решётки,
 * а не изменённую клетку. Так проще и надёжнее — снятая галочка не
 * теряется.
 */
export async function saveRules(
  actor: Actor,
  rules: readonly { eventKind: string; channel: Channel; enabled: boolean }[],
): Promise<void> {
  const known = new Set(rulesFor(actor.role).map((event) => event.kind));
  const clean = rules.filter((rule) => known.has(rule.eventKind));

  await prisma.$transaction(async (tx) => {
    await tx.notifyRule.deleteMany({ where: { userId: actor.id } });
    if (clean.length > 0) {
      await tx.notifyRule.createMany({
        data: clean.map((rule) => ({
          userId: actor.id,
          eventKind: rule.eventKind,
          channel: rule.channel,
          enabled: rule.enabled,
        })),
      });
    }
  });

  await record(actor, {
    action: 'NOTIFY_RULES_SAVED',
    objectType: 'NotifyRule',
    objectId: actor.id,
    payload: { rules: clean.filter((rule) => rule.enabled).length },
  });
}

/**
 * Блок первого входа на «Моих работах» (требование Т-10, решение Р-310):
 * показывается клиенту, пока тот его не закрыл; кнопка «Подключить
 * Telegram» — только если бот настроен и Telegram ещё не подключён.
 * Только своя запись: идентификатор берётся из сессии. Куратору — свой
 * блок на «Назначенных работах» и на экране без доступа (требование Э-12,
 * решение Р-331).
 */
export async function welcomeState(actor: Actor): Promise<{ open: boolean; telegram: boolean }> {
  if ((actor.role !== 'CLIENT' && actor.role !== 'EXPERT') || actor.status !== 'ACTIVE') {
    return { open: false, telegram: false };
  }
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { welcomeClosedAt: true, telegramChatId: true },
  });
  if (user === null || user.welcomeClosedAt !== null) return { open: false, telegram: false };
  const { telegramBindAvailable } = await import('./auth.ts');
  return { open: true, telegram: user.telegramChatId === null && telegramBindAvailable() };
}

/** «Понятно»: блок первого входа закрыт навсегда (Т-10, Р-310; Э-12, Р-331). */
export async function closeWelcome(actor: Actor): Promise<void> {
  await prisma.user.updateMany({
    where: { id: actor.id, welcomeClosedAt: null },
    data: { welcomeClosedAt: new Date() },
  });
}
