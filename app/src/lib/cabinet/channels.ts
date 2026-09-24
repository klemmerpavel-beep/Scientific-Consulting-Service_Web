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
  PHONE_CALL: 'Звонок куратора',
  MESSENGER: 'Мессенджер или социальная сеть',
  FULL_SUPPORT: 'Полное сопровождение',
};

/** Что человек получит, выбрав этот способ. Пишется на экране под строкой. */
export const CONTACT_NOTE: Record<ContactKind, string> = {
  EMAIL: 'Уведомления и ответы куратора приходят письмом.',
  TELEGRAM: 'То же, но сообщением в Telegram — быстрее письма.',
  PHONE_CALL: 'Куратор звонит по важным поворотам работы, а не по каждой мелочи.',
  MESSENGER: 'Куратор пишет туда, где вам удобно отвечать.',
  FULL_SUPPORT: 'Куратор ведёт работу сам и связывается первым, не дожидаясь вопросов.',
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

export interface ContactInput {
  readonly kind: ContactKind;
  readonly value?: string | null;
  readonly note?: string | null;
  readonly preferred?: boolean;
}

/** Добавить способ связи себе. */
export async function addContact(actor: Actor, input: ContactInput): Promise<void> {
  const value = (input.value ?? '').trim();
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
        note: (input.note ?? '').trim() || null,
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
 * Перечень закрыт и совпадает с тем, что очередь ставит практике: сетку
 * видят только менеджер и руководитель. Прежде в ней стояли события,
 * которые уходят одному клиенту (этап ждёт клиента, этап на
 * согласовании, срок через три дня), и «новое сообщение», которого
 * очередь не ставила вовсе: снятая галочка ничем не управляла (решение
 * Р-228).
 */
export const RULE_EVENTS: readonly { kind: string; title: string }[] = [
  { kind: 'MESSAGE_RECEIVED', title: 'Клиент написал в переписке' },
  { kind: 'VERSION_UPLOADED', title: 'Приложена новая версия материала' },
  // Обращения с сайта идут своим путём, сразу в оба канала практики, и
  // правилами не разводятся (Р-161).
  { kind: 'REQUEST_CREATED', title: 'Новое обращение из кабинета' },
  { kind: 'HELP_REQUESTED', title: 'Куратор просит помощи (руководителю)' },
];

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
  const known = new Set(RULE_EVENTS.map((event) => event.kind));
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

/* ------------------------------------------------------------------ */
/* Обращение куратора за помощью                                       */
/* ------------------------------------------------------------------ */

/**
 * Куратор спрашивает руководителя практики.
 *
 * Прежде спросить было негде: переписка в кабинете — только с клиентом,
 * а служебные разделы молчали. Вопрос кладётся в ту же очередь, что и
 * прочие уведомления, и приходит руководителю выбранным им каналом
 * (решение Р-199).
 */
export async function askForHelp(actor: Actor, text: string): Promise<void> {
  const body = text.trim();
  if (body.length === 0) throw new Error('Напишите, в чём нужна помощь');

  const { prisma: db } = await import('../db.ts');
  const { enqueue } = await import('./outbox.ts');

  const me = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { fullName: true },
  });
  const heads = await db.user.findMany({
    where: { role: 'HEAD', status: 'ACTIVE' },
    select: { id: true },
  });

  const stamp = new Date().toISOString().slice(0, 16);
  for (const head of heads) {
    await enqueue(db, {
      userId: head.id,
      eventKind: 'HELP_REQUESTED',
      subject: `Вопрос от куратора: ${me.fullName}`,
      // Содержание вопроса в письме идёт целиком: это служебная переписка
      // практики, а не разговор с клиентом, чьё содержание наружу не
      // пересылается.
      body,
      dedupKey: `help:${actor.id}:${stamp}:${head.id}`,
    });
  }

  await record(actor, {
    action: 'HELP_REQUESTED',
    objectType: 'User',
    objectId: actor.id,
    payload: { heads: heads.length },
  });
}
