/**
 * Исполнение требования субъекта об удалении персональных данных
 * (ст. 14 и ст. 21 Федерального закона № 152-ФЗ).
 *
 * Модель смешанная, и это не компромисс, а следствие столкновения двух
 * обязанностей. Полное физическое удаление противоречит обязанности
 * хранить первичные учётные документы: договоры, счета и акты живут
 * своими сроками. Поэтому персональные данные затираются необратимо,
 * а учётные величины — суммы договоров, транши, коды проектов —
 * сохраняются: по ним нельзя опознать человека.
 *
 * Что затирается:
 *   ФИО, телефон, почта, вуз, специальность, заметки карточки;
 *   тема проекта (она пересказывает работу и косвенно опознаёт автора);
 *   имя файла, контрольная сумма и сам объект в хранилище;
 *   тела сообщений — строки остаются, чтобы переписка не рассыпалась;
 *   привязка Telegram и учётная запись, если она была.
 *
 * Что сохраняется:
 *   код проекта, суммы договора и траншей, даты, состояния;
 *   строки версий материалов без имени и содержимого;
 *   записи журналов — в них персональные данные сведены к идентификатору.
 *
 * По завершении отзываются все сессии и гасятся все выданные ссылки входа:
 * иначе открытая вкладка продолжала бы работать от имени стёртого лица.
 */

import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { prisma } from '../db.ts';
import { storage } from './storage.ts';

/** Маркер вместо затёртого значения: пустая строка читалась бы как потеря. */
const ERASED = '[удалено по требованию субъекта]';

export interface ErasureReport {
  readonly requestId: string;
  readonly clientId: string;
  readonly executedAt: Date;
  readonly scope: 'PERSONAL_DATA' | 'PERSONAL_DATA_AND_FILES';
  readonly projects: number;
  readonly messages: number;
  readonly versions: number;
  readonly objectsPurged: number;
  readonly objectsFailed: number;
  readonly sessionsRevoked: number;
  readonly tokensBurned: number;
  readonly userErased: boolean;
  /** Сохранённые учётные величины — доказательство, что деньги не тронуты. */
  readonly preserved: { readonly contracts: number; readonly contractTotal: string };
}

export async function requestErasure(
  actor: Actor,
  clientId: string,
  scope: 'PERSONAL_DATA' | 'PERSONAL_DATA_AND_FILES' = 'PERSONAL_DATA_AND_FILES',
) {
  ensure(actor, 'ERASURE_EXECUTE');
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: { id: true },
  });
  if (client === null) throw new Error('Карточка клиента не найдена');

  const request = await prisma.erasureRequest.create({
    data: { clientId, scope },
    select: { id: true },
  });
  await record(actor, {
    action: 'ERASURE_REQUESTED',
    objectType: 'ErasureRequest',
    objectId: request.id,
    payload: { clientId, scope },
  });
  return request;
}

/**
 * Исполнить требование. Порядок важен: объекты хранилища удаляются до
 * затирания строк версий, иначе ключ объекта будет потерян и мусор
 * останется в хранилище навсегда.
 */
export async function executeErasure(actor: Actor, requestId: string): Promise<ErasureReport> {
  ensure(actor, 'ERASURE_EXECUTE');

  const request = await prisma.erasureRequest.findUnique({
    where: { id: requestId },
    select: { id: true, clientId: true, scope: true, executedAt: true },
  });
  if (request === null) throw new Error('Требование не найдено');
  if (request.executedAt !== null) throw new Error('Требование уже исполнено');

  const client = await prisma.clientProfile.findUnique({
    where: { id: request.clientId },
    select: { id: true, userId: true, projects: { select: { id: true } } },
  });
  if (client === null) throw new Error('Карточка клиента не найдена');

  const projectIds = client.projects.map((project) => project.id);

  // Учётные величины фиксируются до затирания: отчёт должен показывать,
  // что суммы договоров не изменились.
  const contracts = await prisma.contract.findMany({
    where: { projectId: { in: projectIds } },
    select: { totalAmount: true },
  });
  const contractTotal = contracts.reduce((acc, contract) => acc + contract.totalAmount, 0n);

  const versions = await prisma.materialVersion.findMany({
    where: { material: { projectId: { in: projectIds } }, purgedAt: null },
    select: { id: true, storageKey: true },
  });

  let objectsPurged = 0;
  let objectsFailed = 0;
  if (request.scope === 'PERSONAL_DATA_AND_FILES') {
    for (const version of versions) {
      try {
        await storage().remove(version.storageKey);
        objectsPurged += 1;
      } catch {
        // Объекта может не быть: хранилище чистили вручную либо загрузка
        // оборвалась. Строка версии всё равно затирается, а расхождение
        // попадает в отчёт — молчать о нём нельзя.
        objectsFailed += 1;
      }
    }
  }

  const executedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.clientProfile.update({
      where: { id: client.id },
      data: {
        fullName: ERASED,
        normalizedName: `erased-${client.id}`,
        phone: null,
        email: null,
        university: null,
        speciality: null,
        notes: null,
        erasedAt: executedAt,
      },
    });

    // Тема проекта пересказывает работу и косвенно опознаёт автора;
    // код и суммы остаются.
    await tx.project.updateMany({
      where: { id: { in: projectIds } },
      data: { topic: null, title: ERASED },
    });

    const messages = await tx.message.updateMany({
      where: { projectId: { in: projectIds } },
      data: { body: ERASED, containsContactHint: false },
    });

    let purgedVersions = { count: 0 };
    if (request.scope === 'PERSONAL_DATA_AND_FILES') {
      purgedVersions = await tx.materialVersion.updateMany({
        where: { id: { in: versions.map((version) => version.id) } },
        data: { originalName: ERASED, sha256: '', purgedAt: executedAt },
      });
    }

    let sessionsRevoked = 0;
    let tokensBurned = 0;
    let userErased = false;
    if (client.userId !== null) {
      const sessions = await tx.session.updateMany({
        where: { userId: client.userId, revokedAt: null },
        data: { revokedAt: executedAt },
      });
      sessionsRevoked = sessions.count;
      const tokens = await tx.loginToken.updateMany({
        where: { userId: client.userId, usedAt: null },
        data: { usedAt: executedAt },
      });
      tokensBurned = tokens.count;
      await tx.user.update({
        where: { id: client.userId },
        data: {
          // Адрес заменяется неповторяющимся значением: поле уникально,
          // а два стёртых клиента не должны конфликтовать.
          email: `erased-${client.userId}@invalid`,
          fullName: ERASED,
          phone: null,
          telegramChatId: null,
          notifyEmail: false,
          notifyTelegram: false,
          status: 'ERASED',
          erasedAt: executedAt,
        },
      });
      userErased = true;
    }

    await tx.erasureRequest.update({
      where: { id: request.id },
      data: {
        approvedById: actor.id,
        executedAt,
        report: {
          projects: projectIds.length,
          messages: messages.count,
          versions: purgedVersions.count,
          objectsPurged,
          objectsFailed,
          sessionsRevoked,
          tokensBurned,
          userErased,
          contracts: contracts.length,
          contractTotal: contractTotal.toString(),
        },
      },
    });

    return { messages: messages.count, versions: purgedVersions.count, sessionsRevoked, tokensBurned, userErased };
  });

  // Запись в журнал доступа делается после транзакции и по каждому объекту:
  // изъятие файла — событие того же рода, что и его выдача.
  if (request.scope === 'PERSONAL_DATA_AND_FILES') {
    for (const version of versions) {
      await prisma.fileAccessLog.create({
        data: { versionId: version.id, userId: actor.id, action: 'PURGE' },
      });
    }
  }

  await record(actor, {
    action: 'ERASURE_EXECUTED',
    objectType: 'ErasureRequest',
    objectId: request.id,
    payload: {
      clientId: client.id,
      projects: projectIds.length,
      objectsPurged,
      objectsFailed,
      contractTotal: contractTotal.toString(),
    },
  });

  return {
    requestId: request.id,
    clientId: client.id,
    executedAt,
    scope: request.scope,
    projects: projectIds.length,
    messages: result.messages,
    versions: result.versions,
    objectsPurged,
    objectsFailed,
    sessionsRevoked: result.sessionsRevoked,
    tokensBurned: result.tokensBurned,
    userErased: result.userErased,
    preserved: { contracts: contracts.length, contractTotal: contractTotal.toString() },
  };
}

export async function listErasureRequests(actor: Actor) {
  ensure(actor, 'ERASURE_EXECUTE');
  return prisma.erasureRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      requestedAt: true,
      executedAt: true,
      scope: true,
      report: true,
      client: { select: { id: true, fullName: true, erasedAt: true } },
      approvedBy: { select: { fullName: true } },
    },
  });
}

/** Карточки, по которым требование ещё не исполнено. */
export async function erasableClients(actor: Actor) {
  ensure(actor, 'ERASURE_EXECUTE');
  return prisma.clientProfile.findMany({
    where: { erasedAt: null, mergedIntoId: null },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      email: true,
      _count: { select: { projects: true } },
    },
  });
}
