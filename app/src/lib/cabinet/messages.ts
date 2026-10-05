import { prisma } from '../db.ts';
import { record } from './audit.ts';
import { ensure, scopeProjects, staffThreadAllowed, withoutStaffNames, type Actor } from './access.ts';
import { hasContacts } from './contacts.ts';
import { enqueue } from './outbox.ts';
import { projectRef } from './projects.ts';

/**
 * Переписка «клиент — менеджер». Канал один: эксперт высказывается
 * комментариями к версиям после модерации, и прямого выхода на клиента у
 * него нет — это и есть технический барьер против переманивания.
 *
 * Переписка во внешние каналы не дублируется: кабинет сам является каналом,
 * а письмо с содержанием сообщения вынесло бы его за пределы контура.
 *
 * С РК-07 (решение Р-336) в той же таблице — две внутренние ветки:
 * «по работе» (менеджер и руководитель) и «руководитель — сотрудник».
 * Каждая выборка ветки «клиент — менеджер» несёт условие `CLIENT_THREAD`:
 * внутреннее не попадает клиенту ни на экран, ни в данные, ни в счётчики.
 */

/** Условие ветки «клиент — менеджер» — в каждой её выборке. */
const CLIENT_THREAD = { thread: 'CLIENT_MANAGER' as const };

export async function listMessages(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return [];
  ensure(actor, 'MESSAGE_READ', ref);
  const messages = await prisma.message.findMany({
    where: { projectId, ...CLIENT_THREAD },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, fullName: true, role: true } } },
  });
  // Клиенту — без имени менеджера и руководителя в данных (Э-01, ОЭ-3б).
  return withoutStaffNames(actor, messages);
}

/** Предел длины сообщения в переписке. */
export const MESSAGE_MAX = 10_000;

/**
 * Текст сообщения — одни правила для всех веток. Предел длины: без него одно
 * сообщение в мегабайты ложилось в базу и в каждую выдачу (решение Р-242).
 */
function cleanBody(body: string): string {
  const text = body.trim();
  if (text.length === 0) throw new Error('Пустое сообщение не отправляется');
  if (text.length > MESSAGE_MAX) {
    throw new Error(`Сообщение длиннее ${MESSAGE_MAX} знаков: разделите его или приложите файлом`);
  }
  return text;
}

export async function sendMessage(actor: Actor, projectId: string, body: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'MESSAGE_WRITE', ref);

  const text = cleanBody(body);

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        projectId,
        thread: 'CLIENT_MANAGER',
        authorId: actor.id,
        body: text,
        containsContactHint: hasContacts(text),
      },
    });
    await signalMessage(tx, actor, ref, created.id);
    return created;
  });
  // В журнал — факт отправки без текста: переписка остаётся в работе и
  // затирается по требованию субъекта, а журнал хранит идентификаторы
  // (решение Р-239).
  await record(actor, {
    action: 'MESSAGE_SENT',
    objectType: 'Message',
    objectId: message.id,
    projectId,
    payload: { contactHint: message.containsContactHint },
  });
  return message;
}

/**
 * Сигнал второй стороне о новом сообщении (решение Р-228).
 *
 * Сигнал, а не содержание: переписка во внешние каналы не уходит, письмо
 * и сообщение в Telegram говорят только, что в работе есть новое. Клиенту
 * пишет практика — сигнал идёт клиенту; клиент пишет — куратору работы.
 * Пока предыдущее сообщение той же стороны не прочитано, второй сигнал не
 * ставится: человек и так знает, что его ждут, а десять писем на десять
 * реплик приучили бы его их не читать.
 */
async function signalMessage(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  actor: Actor,
  ref: { id: string; managerId: string; clientId: string },
  messageId: string,
): Promise<void> {
  const fromClient = actor.role === 'CLIENT';
  const pending = await tx.message.count({
    where: {
      projectId: ref.id,
      ...CLIENT_THREAD,
      id: { not: messageId },
      readAt: null,
      author: fromClient ? { role: 'CLIENT' } : { role: { not: 'CLIENT' } },
    },
  });
  if (pending > 0) return;

  const project = await tx.project.findUnique({
    where: { id: ref.id },
    select: { code: true, client: { select: { userId: true } } },
  });
  if (project === null) return;
  const userId = fromClient ? ref.managerId : project.client.userId;
  if (userId === null || userId === actor.id) return;

  await enqueue(tx, {
    userId,
    projectId: ref.id,
    eventKind: 'MESSAGE_RECEIVED',
    subject: `Новое сообщение по работе ${project.code}`,
    body: 'В переписке по работе новое сообщение. Прочитать и ответить можно в кабинете.',
    dedupKey: `message:${messageId}:${userId}`,
    // Кнопка письма — в переписку работы (Т-06, Р-309).
    path: `/cabinet/projects/${project.code}/messages`,
  });
}

/**
 * Непрочитанное — это сообщения, написанные другой стороной. Отметка стоит
 * на самом сообщении, а не на паре «сообщение — читатель»: в канале ровно
 * две стороны — клиент и практика.
 *
 * Сторона определяется ролью автора, а не тем, кто спрашивает. Прежде
 * «другой стороной» считался любой автор, кроме самого читателя: ответ
 * куратора, открытый руководителем, получал отметку прочтения, и клиент
 * не видел его новым, а сообщение руководителя висело у куратора
 * непрочитанным, как письмо клиента (решение Р-221).
 */
function otherSide(actor: Actor) {
  return actor.role === 'CLIENT'
    ? { author: { role: { not: 'CLIENT' as const } } }
    : { author: { role: 'CLIENT' as const } };
}

/**
 * Счётчик руководителя по чужой работе — по его курсору прочтения: отметку
 * `readAt` ставит менеджер работы (Р-221), и чужое непрочитанное у
 * руководителя прежде не гасло, сколько бы он его ни открывал. Теперь
 * сообщение клиента у руководителя новое, пока его не прочёл менеджер и
 * пока не открыл сам руководитель (требование РК-05, ответ ОР-3, решение
 * Р-337).
 */
async function headUnread(actor: Actor, projectIds: readonly string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const cursors = await prisma.messageThreadRead.findMany({
    where: { userId: actor.id, threadKey: { in: projectIds.map((id) => `CLIENT_MANAGER:${id}`) } },
    select: { threadKey: true, readAt: true },
  });
  const since = new Map(cursors.map((row) => [row.threadKey.slice('CLIENT_MANAGER:'.length), row.readAt]));
  const out = new Map<string, number>();
  for (const projectId of projectIds) {
    const cursor = since.get(projectId);
    const count = await prisma.message.count({
      where: {
        projectId,
        ...CLIENT_THREAD,
        author: { role: 'CLIENT' },
        // Прочитанное менеджером — разобрано; открытое руководителем — тоже.
        readAt: null,
        ...(cursor === undefined ? {} : { createdAt: { gt: cursor } }),
      },
    });
    if (count > 0) out.set(projectId, count);
  }
  return out;
}

/** Работы из перечня, где руководитель не менеджер. */
async function foreignWorks(actor: Actor, projectIds: readonly string[]): Promise<string[]> {
  if (actor.role !== 'HEAD' || projectIds.length === 0) return [];
  const rows = await prisma.project.findMany({
    where: { id: { in: [...projectIds] }, managerId: { not: actor.id } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function unreadCount(actor: Actor, projectId: string): Promise<number> {
  // Принадлежность работы проверяется здесь, а не оставляется на совесть
  // вызывающего: выборка обязана держать разграничение сама, иначе чужой
  // код работы отдаёт число сообщений в чужом канале (решение Р-185).
  const scope = scopeProjects(actor);
  if (scope === null) return 0;
  if ((await foreignWorks(actor, [projectId])).length > 0) {
    return (await headUnread(actor, [projectId])).get(projectId) ?? 0;
  }
  return prisma.message.count({
    where: {
      readAt: null,
      ...CLIENT_THREAD,
      ...otherSide(actor),
      project: { id: projectId, ...scope },
    },
  });
}

/** Непрочитанное по всем доступным проектам сразу — для списка работ. */
export async function unreadByProject(
  actor: Actor,
  projectIds: readonly string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  // Перечень приходит снаружи, и сузить его — обязанность выборки: список
  // может прийти откуда угодно, а разграничение живёт в одном месте
  // (решение Р-185).
  const scope = scopeProjects(actor);
  if (scope === null) return new Map();
  // Руководителю по чужим работам — по его курсору (РК-05, ОР-3).
  const foreign = await foreignWorks(actor, projectIds);
  const own = projectIds.filter((id) => !foreign.includes(id));
  const rows = await prisma.message.groupBy({
    by: ['projectId'],
    where: {
      readAt: null,
      ...CLIENT_THREAD,
      ...otherSide(actor),
      project: { id: { in: own }, ...scope },
    },
    _count: { _all: true },
  });
  const out = new Map<string, number>(
    rows.flatMap((row) => (row.projectId === null ? [] : [[row.projectId, row._count._all] as const])),
  );
  for (const [projectId, count] of await headUnread(actor, foreign)) out.set(projectId, count);
  return out;
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
  const grouped = await prisma.message.groupBy({
    by: ['projectId'],
    where: {
      readAt: null,
      ...CLIENT_THREAD,
      ...otherSide(actor),
      ...(Object.keys(scope).length === 0 ? {} : { project: scope }),
    },
    _count: { _all: true },
  });
  const rows = grouped.flatMap((row) =>
    row.projectId === null ? [] : [{ projectId: row.projectId, count: row._count._all }],
  );
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
        : [{ code: project.code, title: project.title, count: row.count }];
    })
    // Последний ключ сортировки — код работы: при равном числе
    // непрочитанных порядок иначе задавался бы группировкой в базе и
    // менялся от наполнения к наполнению (решение Р-190).
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export async function markRead(actor: Actor, projectId: string): Promise<void> {
  const ref = await projectRef(projectId);
  if (ref === null) return;
  ensure(actor, 'MESSAGE_READ', ref);
  // За практику прочтение отмечает менеджер работы. Руководитель, открывший
  // чужую работу, отметки не ставит: иначе письмо клиента, которое менеджер
  // ещё не видел, перестало бы быть для него новым (решение Р-221). Его
  // собственный счётчик гасит курсор прочтения (РК-05, ОР-3, Р-337).
  if (actor.role === 'HEAD' && ref.managerId !== actor.id) {
    const key = `CLIENT_MANAGER:${projectId}`;
    const now = new Date();
    await prisma.messageThreadRead.upsert({
      where: { userId_threadKey: { userId: actor.id, threadKey: key } },
      create: { userId: actor.id, threadKey: key, readAt: now },
      update: { readAt: now },
    });
    return;
  }
  if (actor.role !== 'CLIENT' && ref.managerId !== actor.id) return;
  await prisma.message.updateMany({
    where: { projectId, readAt: null, ...CLIENT_THREAD, ...otherSide(actor) },
    data: { readAt: new Date() },
  });
}

/** Сообщения с признаком передачи контактов — сводка для менеджера. */
export async function flaggedMessages(actor: Actor) {
  ensure(actor, 'REGISTRY_VIEW');
  // Текст сообщения с телефоном или почтой — персональные данные клиента:
  // менеджер видит только сообщения своих работ. Прежде выборка шла по
  // всей практике, и реестр показывал чужих клиентов (решение Р-220).
  const scope = scopeProjects(actor);
  if (scope === null) return [];
  return prisma.message.findMany({
    where: { containsContactHint: true, ...CLIENT_THREAD, project: scope },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    include: {
      author: { select: { fullName: true, role: true } },
      project: { select: { code: true, title: true } },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Внутренние ветки (требование РК-07, решение Р-336)                  */
/* ------------------------------------------------------------------ */

type InternalThread = 'WORK_INTERNAL' | 'HEAD_STAFF';

/** Ключ ветки для курсора прочтения: `{ветка}:{работа или сотрудник}`. */
export function threadKey(thread: InternalThread, target: string): string {
  return `${thread}:${target}`;
}

const AUTHOR = { author: { select: { id: true, fullName: true, role: true } } } as const;

/** Условие выборки сообщений ветки. */
function threadWhere(thread: InternalThread, target: string) {
  return thread === 'WORK_INTERNAL'
    ? { thread: 'WORK_INTERNAL' as const, projectId: target }
    : { thread: 'HEAD_STAFF' as const, staffId: target };
}

/** Непрочитанное участником: чужие сообщения ветки новее его курсора. */
async function unreadFor(userId: string, thread: InternalThread, target: string): Promise<number> {
  const cursor = await prisma.messageThreadRead.findUnique({
    where: { userId_threadKey: { userId, threadKey: threadKey(thread, target) } },
    select: { readAt: true },
  });
  return prisma.message.count({
    where: {
      ...threadWhere(thread, target),
      authorId: { not: userId },
      ...(cursor === null ? {} : { createdAt: { gt: cursor.readAt } }),
    },
  });
}

/**
 * Сигнал участнику ветки — без текста; повторно не ставится, пока у
 * адресата есть непрочитанное в этой ветке (правило `signalMessage`).
 */
async function signalThread(
  recipients: readonly string[],
  thread: InternalThread,
  target: string,
  messageId: string,
  letter: { eventKind: 'INTERNAL_MESSAGE' | 'STAFF_QUESTION' | 'HEAD_REPLY'; subject: string; body: string; path: string; projectId: string | null },
): Promise<void> {
  for (const userId of recipients) {
    // Новое сообщение уже лежит в ветке: «есть ещё непрочитанное» — больше одного.
    if ((await unreadFor(userId, thread, target)) > 1) continue;
    await enqueue(prisma, {
      userId,
      projectId: letter.projectId,
      eventKind: letter.eventKind,
      subject: letter.subject,
      body: letter.body,
      dedupKey: `thread:${messageId}:${userId}`,
      path: letter.path,
    });
  }
}

/** Отметить ветку прочитанной смотрящим — открытие ветки и есть прочтение. */
async function markThread(actor: Actor, thread: InternalThread, target: string): Promise<void> {
  const key = threadKey(thread, target);
  const now = new Date();
  await prisma.messageThreadRead.upsert({
    where: { userId_threadKey: { userId: actor.id, threadKey: key } },
    create: { userId: actor.id, threadKey: key, readAt: now },
    update: { readAt: now },
  });
}

/** Внутренняя переписка по работе — менеджер работы и руководитель. */
export async function listInternal(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return [];
  ensure(actor, 'INTERNAL_MESSAGE', ref);
  return prisma.message.findMany({
    where: threadWhere('WORK_INTERNAL', projectId),
    orderBy: { createdAt: 'asc' },
    include: AUTHOR,
  });
}

/** Непрочитанное во внутренней ветке работы — для вкладки. */
export async function internalUnread(actor: Actor, projectId: string): Promise<number> {
  const ref = await projectRef(projectId);
  if (ref === null) return 0;
  ensure(actor, 'INTERNAL_MESSAGE', ref);
  return unreadFor(actor.id, 'WORK_INTERNAL', projectId);
}

export async function readInternal(actor: Actor, projectId: string): Promise<void> {
  const ref = await projectRef(projectId);
  if (ref === null) return;
  ensure(actor, 'INTERNAL_MESSAGE', ref);
  await markThread(actor, 'WORK_INTERNAL', projectId);
}

/**
 * Написать во внутреннюю ветку работы. Менеджер пишет — сигнал
 * руководителям; руководитель пишет — менеджеру работы.
 */
export async function sendInternal(actor: Actor, projectId: string, body: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'INTERNAL_MESSAGE', ref);
  const text = cleanBody(body);
  const message = await prisma.message.create({
    data: { projectId, thread: 'WORK_INTERNAL', authorId: actor.id, body: text, containsContactHint: hasContacts(text) },
  });
  await markThread(actor, 'WORK_INTERNAL', projectId);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } });
  const heads = await prisma.user.findMany({
    where: { role: 'HEAD', status: 'ACTIVE', id: { not: actor.id } },
    select: { id: true },
  });
  const recipients =
    actor.id === ref.managerId ? heads.map((head) => head.id) : ref.managerId === actor.id ? [] : [ref.managerId];
  await signalThread(recipients, 'WORK_INTERNAL', projectId, message.id, {
    eventKind: 'INTERNAL_MESSAGE',
    subject: `Внутренняя переписка по работе ${project.code}`,
    body: 'Во внутренней переписке по работе новое сообщение. Прочитать и ответить можно в кабинете.',
    path: `/cabinet/projects/${project.code}/messages?tab=internal`,
    projectId,
  });
  await record(actor, {
    action: 'MESSAGE_SENT',
    objectType: 'Message',
    objectId: message.id,
    projectId,
    payload: { thread: 'WORK_INTERNAL' },
  });
  return message;
}

/** Сотрудник ветки «руководитель — сотрудник» — действующий менеджер. */
async function staffOf(staffId: string) {
  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, fullName: true, role: true, status: true } });
  if (staff === null || staff.role !== 'MANAGER') throw new Error('Сотрудник не найден');
  return staff;
}

/** Ветка «руководитель — сотрудник»: руководителю — любая, менеджеру — своя. */
export async function listStaffThread(actor: Actor, staffId: string) {
  if (!staffThreadAllowed(actor, staffId)) throw new Error('Действие не разрешено');
  await staffOf(staffId);
  return prisma.message.findMany({
    where: threadWhere('HEAD_STAFF', staffId),
    orderBy: { createdAt: 'asc' },
    include: AUTHOR,
  });
}

export async function readStaffThread(actor: Actor, staffId: string): Promise<void> {
  if (!staffThreadAllowed(actor, staffId)) throw new Error('Действие не разрешено');
  await markThread(actor, 'HEAD_STAFF', staffId);
}

/** Непрочитанное смотрящим в ветке с руководителем (у менеджера — ответы). */
export async function staffThreadUnread(actor: Actor, staffId: string): Promise<number> {
  if (!staffThreadAllowed(actor, staffId)) return 0;
  return unreadFor(actor.id, 'HEAD_STAFF', staffId);
}

/**
 * Написать в ветку «руководитель — сотрудник». Пишет менеджер — сигнал
 * `STAFF_QUESTION` руководителям; пишет руководитель — `HEAD_REPLY`
 * менеджеру. Заменяет письмо «Спросить руководителя» (Р-199, Р-306).
 */
export async function sendStaff(actor: Actor, staffId: string, body: string) {
  if (!staffThreadAllowed(actor, staffId)) throw new Error('Действие не разрешено');
  const staff = await staffOf(staffId);
  const text = cleanBody(body);
  const message = await prisma.message.create({
    data: { thread: 'HEAD_STAFF', staffId, authorId: actor.id, body: text, containsContactHint: hasContacts(text) },
  });
  await markThread(actor, 'HEAD_STAFF', staffId);
  if (actor.id === staffId) {
    const heads = await prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
    await signalThread(heads.map((head) => head.id), 'HEAD_STAFF', staffId, message.id, {
      eventKind: 'STAFF_QUESTION',
      subject: `Вопрос от менеджера: ${staff.fullName}`,
      body: 'Менеджер написал вам в кабинете. Прочитать и ответить — «Управление → Команда».',
      path: `/cabinet/manage/team/${staffId}`,
      projectId: null,
    });
  } else {
    await signalThread([staffId], 'HEAD_STAFF', staffId, message.id, {
      eventKind: 'HEAD_REPLY',
      subject: 'Руководитель ответил в кабинете',
      body: 'В переписке с руководителем новое сообщение. Прочитать можно в кабинете.',
      path: '/cabinet/head',
      projectId: null,
    });
  }
  await record(actor, {
    action: 'MESSAGE_SENT',
    objectType: 'Message',
    objectId: message.id,
    payload: { thread: 'HEAD_STAFF' },
  });
  return message;
}

/**
 * Ветки «руководитель — сотрудник» для руководителя: по менеджеру —
 * последнее сообщение и непрочитанное; непрочитанные сверху.
 */
export async function staffThreads(actor: Actor) {
  if (actor.role !== 'HEAD' || actor.status !== 'ACTIVE') return [];
  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER', status: 'ACTIVE' },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    select: { id: true, fullName: true },
  });
  const rows = await Promise.all(
    managers.map(async (manager) => {
      const [unread, last] = await Promise.all([
        unreadFor(actor.id, 'HEAD_STAFF', manager.id),
        prisma.message.findFirst({
          where: threadWhere('HEAD_STAFF', manager.id),
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, authorId: true },
        }),
      ]);
      return { staffId: manager.id, fullName: manager.fullName, unread, lastAt: last?.createdAt ?? null };
    }),
  );
  return rows.sort(
    (a, b) =>
      b.unread - a.unread ||
      (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) ||
      a.fullName.localeCompare(b.fullName),
  );
}
