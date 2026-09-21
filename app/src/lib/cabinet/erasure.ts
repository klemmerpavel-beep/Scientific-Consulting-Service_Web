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
 *   привязка Telegram и учётная запись, если она была;
 *   заявки этого лица: имя, контакт, организация, тема, адрес и браузер —
 *     остаются только отметка согласия и её редакция, то есть
 *     доказательство законности прошлой обработки;
 *   попытки входа с его адресом — они хранятся ради защиты от перебора
 *     и учётным документом не являются, поэтому удаляются целиком;
 *   свободные тексты работы: названия материалов и этапов, причина
 *     остановки, замечания к версиям и пометки модератора;
 *   содержимое событий работы и тексты поставленных уведомлений;
 *   строки книги заказов, из которых заведены его работы.
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
  /// Затронутое за пределами карточки и переписки: заявки, попытки входа,
  /// свободные тексты, события, уведомления и строки книги заказов.
  readonly leads: number;
  readonly loginAttempts: number;
  readonly texts: number;
  readonly events: number;
  readonly notifications: number;
  readonly importRows: number;
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
    select: {
      id: true,
      userId: true,
      // Контакты нужны до затирания: по ним находятся заявки этого лица,
      // не привязанные ни к одной работе, и попытки входа (решение Р-185).
      email: true,
      phone: true,
      user: { select: { email: true } },
      projects: { select: { id: true } },
    },
  });
  if (client === null) throw new Error('Карточка клиента не найдена');

  const projectIds = client.projects.map((project) => project.id);

  /**
   * Адреса и телефоны, по которым это лицо оставляло след. Учётной записи
   * может не быть вовсе — историческим клиентам вход не открывается,
   * — поэтому перечень собирается из всех известных значений.
   */
  const contacts = [client.email, client.phone, client.user?.email ?? null]
    .filter((value): value is string => value !== null && value.trim().length > 0)
    .map((value) => value.trim());
  const emails = contacts
    .filter((value) => value.includes('@'))
    .map((value) => value.toLowerCase());

  // Заявки: развёрнутые в работу и поданные с теми же контактами. Заявка
  // не удаляется никогда — у неё остаётся отметка согласия (Р-122).
  const leadIds = (
    await prisma.lead.findMany({
      where: {
        OR: [
          projectIds.length === 0 ? { id: '—нет такой заявки—' } : { projectId: { in: projectIds } },
          contacts.length === 0 ? { id: '—нет такой заявки—' } : { contact: { in: contacts } },
        ],
      },
      select: { id: true },
    })
  ).map((lead) => lead.id);

  // Строки книги заказов, из которых заведены его работы.
  const importRowIds =
    projectIds.length === 0
      ? []
      : (
          await prisma.importRow.findMany({
            where: { projectId: { in: projectIds } },
            select: { id: true },
          })
        ).map((row) => row.id);

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

  // Вложения заявок: у них своё хранилище объектов, и без этой выборки
  // файл, приложенный к обращению, пережил бы затирание (решение Р-191).
  const leadFiles =
    leadIds.length === 0
      ? []
      : await prisma.leadAttachment.findMany({
          where: { leadId: { in: leadIds }, purgedAt: null },
          select: { id: true, storageKey: true },
        });

  let objectsPurged = 0;
  let objectsFailed = 0;
  if (request.scope === 'PERSONAL_DATA_AND_FILES') {
    for (const object of [...versions, ...leadFiles]) {
      try {
        await storage().remove(object.storageKey);
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

    // Свободные тексты работы. Название материала и этапа пишет человек,
    // и туда попадает и фамилия, и тема исследования; причина остановки
    // и замечания к версиям — тем более (решение Р-185).
    const materials = await tx.material.updateMany({
      where: { projectId: { in: projectIds } },
      data: { title: ERASED },
    });
    const stages = await tx.stage.updateMany({
      where: { projectId: { in: projectIds } },
      data: { title: ERASED, blockedReason: null },
    });
    const comments = await tx.versionComment.updateMany({
      where: { version: { material: { projectId: { in: projectIds } } } },
      data: { body: ERASED, moderationNote: null },
    });

    // Содержимое событий: в нём лежат прежние и новые значения полей,
    // то есть те же имена и темы, только в другом виде.
    const events = await tx.projectEvent.updateMany({
      where: { projectId: { in: projectIds } },
      data: { payload: { erased: true } },
    });

    // Поставленные уведомления: тема и тело письма называют человека по
    // имени. Строка остаётся — по ней видно, что отправка была.
    const notifications = await tx.notificationOutbox.updateMany({
      where: {
        OR: [
          projectIds.length === 0
            ? { id: '—нет такой строки—' }
            : { projectId: { in: projectIds } },
          client.userId === null ? { id: '—нет такой строки—' } : { userId: client.userId },
        ],
      },
      data: { subject: ERASED, body: ERASED },
    });

    // Заявки: персональные поля затираются, отметка согласия и её
    // редакция остаются доказательством законности прошлой обработки.
    const leads =
      leadIds.length === 0
        ? { count: 0 }
        : await tx.lead.updateMany({
            where: { id: { in: leadIds } },
            data: {
              name: null,
              contact: ERASED,
              supervisorName: null,
              phone: null,
              organization: null,
              topic: null,
              speciality: null,
              need: null,
              deadline: null,
              direction: null,
              message: null,
              notes: null,
              declineReason: null,
              ip: null,
              userAgent: null,
            },
          });

    // Вложения заявок: строка остаётся ради связности, имя файла и
    // свёртка затираются, объект уже убран из хранилища выше.
    if (leadFiles.length > 0) {
      await tx.leadAttachment.updateMany({
        where: { id: { in: leadFiles.map((file) => file.id) } },
        data: { originalName: ERASED, sha256: ERASED, purgedAt: executedAt },
      });
    }

    // Попытки входа хранятся ради ограничения частоты и учётным
    // документом не являются — удаляются целиком.
    const loginAttempts =
      emails.length === 0
        ? { count: 0 }
        : await tx.loginAttempt.deleteMany({ where: { emailNormalized: { in: emails } } });

    // Строки книги заказов: в raw лежат значения ячеек с ФИО, в signature —
    // естественный ключ, собранный из них же. Ключ заменяется, и повторная
    // загрузка той же книги заново эту работу не заведёт: она уже есть,
    // а её данные стёрты по требованию субъекта.
    const importRows =
      importRowIds.length === 0
        ? { count: 0 }
        : await tx.importRow.updateMany({
            where: { id: { in: importRowIds } },
            data: { raw: { erased: true }, parsed: { erased: true }, signature: null },
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
          leads: leads.count,
          loginAttempts: loginAttempts.count,
          texts: materials.count + stages.count + comments.count,
          events: events.count,
          notifications: notifications.count,
          importRows: importRows.count,
          contracts: contracts.length,
          contractTotal: contractTotal.toString(),
        },
      },
    });

    return {
      messages: messages.count,
      versions: purgedVersions.count,
      sessionsRevoked,
      tokensBurned,
      userErased,
      leads: leads.count,
      loginAttempts: loginAttempts.count,
      texts: materials.count + stages.count + comments.count,
      events: events.count,
      notifications: notifications.count,
      importRows: importRows.count,
    };
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
    leads: result.leads,
    loginAttempts: result.loginAttempts,
    texts: result.texts,
    events: result.events,
    notifications: result.notifications,
    importRows: result.importRows,
    preserved: { contracts: contracts.length, contractTotal: contractTotal.toString() },
  };
}

/** Сколько последних требований показывается на экране. */
export const ERASURE_SHOWN = 50;

/**
 * Последние требования субъектов и их общее число.
 *
 * Прежде выбирались пятьдесят и больше ничего: на пятьдесят первом
 * требовании старые исчезали молча, и экран об этом не говорил
 * (решение Р-183).
 */
export async function listErasureRequests(actor: Actor) {
  ensure(actor, 'ERASURE_EXECUTE');
  const total = await prisma.erasureRequest.count();
  const rows = await prisma.erasureRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    take: ERASURE_SHOWN,
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
  return { rows, total };
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
