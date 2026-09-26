import { prisma } from '../db.ts';
import { record } from './audit.ts';
import { ensure, scopeProjects, type Actor } from './access.ts';
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
 */

export async function listMessages(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return [];
  ensure(actor, 'MESSAGE_READ', ref);
  return prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, fullName: true, role: true } } },
  });
}

export async function sendMessage(actor: Actor, projectId: string, body: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'MESSAGE_WRITE', ref);

  const text = body.trim();
  if (text.length === 0) throw new Error('Пустое сообщение не отправляется');

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        projectId,
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

export async function unreadCount(actor: Actor, projectId: string): Promise<number> {
  // Принадлежность работы проверяется здесь, а не оставляется на совесть
  // вызывающего: выборка обязана держать разграничение сама, иначе чужой
  // код работы отдаёт число сообщений в чужом канале (решение Р-185).
  const scope = scopeProjects(actor);
  if (scope === null) return 0;
  return prisma.message.count({
    where: {
      readAt: null,
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
  const rows = await prisma.message.groupBy({
    by: ['projectId'],
    where: {
      readAt: null,
      ...otherSide(actor),
      project: { id: { in: [...projectIds] }, ...scope },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
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
  const rows = await prisma.message.groupBy({
    by: ['projectId'],
    where: {
      readAt: null,
      ...otherSide(actor),
      ...(Object.keys(scope).length === 0 ? {} : { project: scope }),
    },
    _count: { _all: true },
  });
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
        : [{ code: project.code, title: project.title, count: row._count._all }];
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
  // За практику прочтение отмечает куратор работы. Руководитель, открывший
  // чужую работу, отметки не ставит: иначе письмо клиента, которое куратор
  // ещё не видел, перестало бы быть для него новым (решение Р-221).
  if (actor.role !== 'CLIENT' && ref.managerId !== actor.id) return;
  await prisma.message.updateMany({
    where: { projectId, readAt: null, ...otherSide(actor) },
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
    where: { containsContactHint: true, project: scope },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    include: {
      author: { select: { fullName: true, role: true } },
      project: { select: { code: true, title: true } },
    },
  });
}
