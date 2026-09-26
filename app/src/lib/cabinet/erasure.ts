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
 *   содержимое событий работы и тексты поставленных уведомлений, а также
 *     текст ошибки доставки — в нём бывает адрес получателя;
 *   строки книги заказов, из которых заведены его работы, и строки с его
 *     ФИО, не ставшие работой: брошенные предпросмотры, строки на разборе,
 *     отклонённые; ключ строки заменяется надгробием, чтобы мост книги не
 *     завёл его заново (решение Р-252);
 *   карточки, сведённые в эту (другие написания того же ФИО), — их
 *     контакты тоже ведут к его заявкам;
 *   описания работы и этапов, причины смены состояния этапа и названия,
 *     записанные в журнал при правке работы и этапа (решение Р-234);
 *   содержимое записей журнала о его учётной записи и карточках, причина
 *     сторно в журнале, его сетевые адреса и браузеры — в журнале действий,
 *     журнале доступа к файлам, сессиях и ссылках входа (решение Р-252).
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
import { contactKeys, leadMatchesContacts } from './contacts.ts';
import { ERASED_KEY_PREFIX, erasedKey, normalizeName, signatureBase } from './import/etl.ts';
import { prisma } from '../db.ts';
import { storage } from './storage.ts';

/**
 * У клиента есть действующие работы. Затирать данные, пока по работе идёт
 * переписка и загружаются версии, значит получить новые персональные
 * данные в уже «обезличенной» работе без всякого следа (решение Р-234).
 */
export class ActiveWorkError extends Error {
  readonly codes: readonly string[];

  constructor(codes: readonly string[]) {
    super(`Действующие работы: ${codes.join(', ')}. Завершите или отмените их.`);
    this.name = 'ActiveWorkError';
    this.codes = codes;
  }
}

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
      fullName: true,
      normalizedName: true,
      user: { select: { email: true, phone: true } },
      projects: { select: { id: true, code: true, status: true } },
    },
  });
  if (client === null) throw new Error('Карточка клиента не найдена');

  // Карточки, сведённые в эту при переносе книги: другое написание того же
  // ФИО со своими телефоном и почтой. Прежде они переживали затирание, а
  // выбрать их отдельно было нельзя — экран показывает только основные
  // (решение Р-234). Сведение бывает цепочкой, поэтому обход идёт вглубь.
  const cards = [
    {
      id: client.id,
      email: client.email,
      phone: client.phone,
      fullName: client.fullName,
      normalizedName: client.normalizedName,
    },
  ];
  for (let frontier = [client.id]; frontier.length > 0; ) {
    const merged = await prisma.clientProfile.findMany({
      where: { mergedIntoId: { in: frontier } },
      select: { id: true, email: true, phone: true, fullName: true, normalizedName: true },
    });
    const fresh = merged.filter((card) => !cards.some((known) => known.id === card.id));
    cards.push(...fresh);
    frontier = fresh.map((card) => card.id);
  }
  const cardIds = cards.map((card) => card.id);

  const mergedProjects = await prisma.project.findMany({
    where: { clientId: { in: cardIds.filter((id) => id !== client.id) } },
    select: { id: true, code: true, status: true },
  });
  const allProjects = [...client.projects, ...mergedProjects];

  const active = allProjects.filter(
    (project) => project.status === 'ACTIVE' || project.status === 'PAUSED',
  );
  if (active.length > 0) throw new ActiveWorkError(active.map((project) => project.code));

  const projectIds = allProjects.map((project) => project.id);

  /**
   * Адреса и телефоны, по которым это лицо оставляло след. Учётной записи
   * может не быть вовсе — историческим клиентам вход не открывается,
   * — поэтому перечень собирается из всех известных значений.
   */
  const keys = contactKeys([
    ...cards.flatMap((card) => [card.email, card.phone]),
    client.user?.email ?? null,
    client.user?.phone ?? null,
  ]);
  const emails = [...keys.emails];
  const phones = [...keys.phones];

  // Заявки: развёрнутые в работу и поданные с теми же контактами. Заявка
  // не удаляется никогда — у неё остаётся отметка согласия (Р-122).
  //
  // Контакт сверяется в приведённом виде: почта — без пробелов и регистра,
  // телефон — по последним десяти цифрам, и телефон из заявки кабинета
  // (`Lead.phone`) тоже. Прежде сверка шла точным совпадением строки, и
  // «+7 (900) 000-00-00» в заявке не находился по «+7 900 000-00-00» в
  // карточке (решение Р-252). База отбирает кандидатов тем же приведением,
  // а окончательное решение — за `leadMatchesContacts`, общей с проверками.
  const byContact =
    emails.length === 0 && phones.length === 0
      ? []
      : await prisma.$queryRaw<{ id: string; contact: string; phone: string | null }[]>`
          SELECT "id", "contact", "phone" FROM "Lead"
          WHERE lower(regexp_replace("contact", '[[:space:]]', '', 'g')) = ANY(${emails}::text[])
             OR right(regexp_replace("contact", '[^0-9]', '', 'g'), 10) = ANY(${phones}::text[])
             OR right(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), 10) = ANY(${phones}::text[])`;
  const leadIds = [
    ...new Set([
      ...(projectIds.length === 0
        ? []
        : await prisma.lead.findMany({
            where: { projectId: { in: projectIds } },
            select: { id: true },
          })
      ).map((lead) => lead.id),
      ...byContact.filter((lead) => leadMatchesContacts(lead, keys)).map((lead) => lead.id),
    ]),
  ];

  // Строки книги заказов: из которых заведены его работы — и строки с его
  // ФИО, работой не ставшие: брошенный предпросмотр, строка на разборе,
  // отклонённая при фиксации. Прежде выбирались только первые, и ФИО из
  // книги переживало обезличивание в остальных (решение Р-252).
  //
  // ФИО сверяется с полем ключа целиком, а не вхождением подстроки:
  // «иванов иван» не должно захватить строки «иванов иван иванович».
  // Строка, по которой заведена работа другой, живой карточки, не
  // берётся: однофамилец — другой человек.
  const names = new Set(
    cards
      .flatMap((card) => [card.normalizedName, normalizeName(card.fullName)])
      .filter((name) => name.length > 0 && !name.startsWith('erased-') && !name.includes('удалено')),
  );
  const spellings = [...new Set(cards.map((card) => card.fullName))];
  const bookRows = await prisma.importRow.findMany({
    where: {
      OR: [
        projectIds.length === 0 ? { id: '—нет такой строки—' } : { projectId: { in: projectIds } },
        ...[...names].map((name) => ({ signature: { contains: `|${name}|` } })),
        ...spellings.map((spelling) => ({ raw: { path: ['customer'], equals: spelling } })),
      ],
    },
    select: { id: true, signature: true, raw: true, projectId: true },
  });
  const nameOf = (signature: string | null): string | null =>
    signatureBase(signature)?.split('|')[1] ?? null;
  const importRows = bookRows.filter((row) => {
    if (row.projectId !== null) return projectIds.includes(row.projectId);
    const customer = (row.raw as { customer?: unknown } | null)?.customer;
    const spelled = typeof customer === 'string' ? normalizeName(customer) : null;
    const keyed = nameOf(row.signature);
    return (keyed !== null && names.has(keyed)) || (spelled !== null && names.has(spelled));
  });

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
  //
  // Выбираются все вложения его заявок, а не только лежащие в хранилище:
  // перенесённые в материалы при одобрении помечены изъятыми, и прежде
  // имя файла и его свёртка на них оставались (решение Р-234). Объект
  // удаляется только у тех, что ещё лежат при заявке.
  const leadFiles =
    leadIds.length === 0
      ? []
      : await prisma.leadAttachment.findMany({
          where: { leadId: { in: leadIds } },
          select: { id: true, storageKey: true, purgedAt: true },
        });
  const storedLeadFiles = leadFiles.filter((file) => file.purgedAt === null);

  let objectsPurged = 0;
  let objectsFailed = 0;
  if (request.scope === 'PERSONAL_DATA_AND_FILES') {
    for (const object of [...versions, ...storedLeadFiles]) {
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
    // Требование захватывается условием на исполнение: второе нажатие
    // ждёт первого и находит требование исполненным. Прежде проверка
    // стояла вне транзакции, и двойное нажатие исполняло всё дважды.
    const claimed = await tx.erasureRequest.updateMany({
      where: { id: request.id, executedAt: null },
      data: { executedAt },
    });
    if (claimed.count !== 1) throw new Error('Требование уже исполнено');

    for (const card of cards) {
      await tx.clientProfile.update({
        where: { id: card.id },
        data: {
          fullName: ERASED,
          normalizedName: `erased-${card.id}`,
          phone: null,
          email: null,
          university: null,
          speciality: null,
          notes: null,
          erasedAt: executedAt,
        },
      });
    }

    // Тема проекта пересказывает работу и косвенно опознаёт автора;
    // код и суммы остаются.
    await tx.project.updateMany({
      where: { id: { in: projectIds } },
      data: { topic: null, title: ERASED, summary: null },
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
      data: { title: ERASED, blockedReason: null, summary: null },
    });
    // Назначение транша и комментарий начисления — тоже свободный текст:
    // туда писали «оплата Ивановой за гл. 2», а комментарий начисления
    // после исполнения требования продолжал видеть эксперт (решение Р-244).
    // Суммы и даты остаются: это учёт, а не сведения о субъекте.
    await tx.tranche.updateMany({
      where: { contract: { projectId: { in: projectIds } } },
      data: { title: ERASED },
    });
    await tx.expertPayout.updateMany({
      where: { projectId: { in: projectIds } },
      data: { comment: null },
    });
    // Причина смены состояния этапа — тот же текст, что причина остановки,
    // только в истории этапа.
    const reasons = await tx.stageStateChange.updateMany({
      where: { stage: { projectId: { in: projectIds } }, reason: { not: null } },
      data: { reason: ERASED },
    });
    // Журнал действий хранит идентификаторы, но правка работы и этапа
    // писала в него названия — прежнее и новое. Содержимое этих записей
    // заменяется отметкой; сами записи остаются.
    const journal = await tx.auditEvent.updateMany({
      where: {
        projectId: { in: projectIds },
        action: { in: ['PROJECT_EDITED', 'STAGE_EDITED', 'STAGE_CREATED'] },
      },
      data: { payload: { erased: true } },
    });
    // Причина сторно — свободный текст руководителя («вернули Ивановой по
    // заявлению»). Прочее содержимое записи — переход состояния и сумма —
    // учёт, и оно остаётся; затирается только причина (решение Р-252).
    let reversals = 0;
    const trancheEvents = await tx.auditEvent.findMany({
      where: { projectId: { in: projectIds }, action: 'TRANCHE_STATUS_CHANGED' },
      select: { id: true, payload: true },
    });
    for (const event of trancheEvents) {
      const payload = event.payload as Record<string, unknown> | null;
      if (payload === null || typeof payload !== 'object' || !('reason' in payload)) continue;
      await tx.auditEvent.update({
        where: { id: event.id },
        data: { payload: { ...payload, reason: ERASED } as never },
      });
      reversals += 1;
    }
    // Записи о его учётной записи и карточках: заведение, смена роли и
    // состояния, выдача ссылки входа, способы связи, сведение карточек.
    // Заведение записи прежде хранило адрес почты (решение Р-252); записи
    // остаются, их содержимое заменяется отметкой.
    const personal = await tx.auditEvent.updateMany({
      where: {
        // Тип объекта не сужается: способы связи и правила уведомлений
        // пишутся с идентификатором учётной записи, а идентификаторы
        // уникальны во всей базе.
        objectId: { in: client.userId === null ? cardIds : [client.userId, ...cardIds] },
      },
      data: { payload: { erased: true } },
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
    // имени. Строка остаётся — по ней видно, что отправка была. Письма
    // по его заявкам (ответ на отказ, Р-217) адресованы заявке, а не
    // записи, и попадают сюда отдельным условием.
    const notifications = await tx.notificationOutbox.updateMany({
      where: {
        OR: [
          projectIds.length === 0
            ? { id: '—нет такой строки—' }
            : { projectId: { in: projectIds } },
          client.userId === null ? { id: '—нет такой строки—' } : { userId: client.userId },
          leadIds.length === 0 ? { id: '—нет такой строки—' } : { leadId: { in: leadIds } },
          // Уведомления менеджерам о новой заявке из кабинета адресованы
          // менеджеру, а не заявке, и называют автора и тему; заявку они
          // помнят только в ключе от повторов (решение Р-234).
          ...leadIds.map((leadId) => ({ dedupKey: { startsWith: `lead:${leadId}:` } })),
        ],
      },
      // Текст ошибки доставки бывает с адресом получателя: почтовый сервер
      // повторяет его в отказе (решение Р-252).
      data: { subject: ERASED, body: ERASED, lastError: null },
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
    //
    // Вложения при заявке идут по тому же правилу, что версии материалов:
    // при затирании без файлов объект и его имя остаются, и строка не
    // помечается изъятой — прежде помечалась, и объект оставался в
    // хранилище недостижимым навсегда (решение Р-234). Перенесённые в
    // материалы вложения затираются всегда: их объект уже живёт версией.
    const movedFiles = leadFiles.filter((file) => file.purgedAt !== null);
    const erasedFiles = request.scope === 'PERSONAL_DATA_AND_FILES' ? leadFiles : movedFiles;
    if (erasedFiles.length > 0) {
      await tx.leadAttachment.updateMany({
        where: { id: { in: erasedFiles.map((file) => file.id) } },
        data: { originalName: ERASED, sha256: ERASED },
      });
    }
    if (request.scope === 'PERSONAL_DATA_AND_FILES' && storedLeadFiles.length > 0) {
      await tx.leadAttachment.updateMany({
        where: { id: { in: storedLeadFiles.map((file) => file.id) } },
        data: { purgedAt: executedAt },
      });
    }

    // Попытки входа хранятся ради ограничения частоты и учётным
    // документом не являются — удаляются целиком.
    const loginAttempts =
      emails.length === 0
        ? { count: 0 }
        : await tx.loginAttempt.deleteMany({ where: { emailNormalized: { in: emails } } });

    // Строки книги заказов: в raw лежат значения ячеек с ФИО, в errors —
    // замечания разбора с цитатами ячеек, в signature — естественный ключ,
    // собранный из них же. Ключ заменяется надгробием — свёрткой его основы
    // (дата, ФИО, тип). Прежде он обнулялся, и мост книги, раз в час
    // разбирающий файл с Диска, не находил прежнего переноса и заводил
    // стёртого клиента заново — с ФИО из книги. Надгробие ФИО не хранит, но
    // та же строка книги с ним сходится, и разбор её пропускает
    // (`import/match.ts`, решение Р-252).
    const byTomb = new Map<string | null, string[]>();
    for (const row of importRows) {
      const tomb =
        row.signature === null || row.signature.startsWith(ERASED_KEY_PREFIX)
          ? null
          : erasedKey(row.signature);
      byTomb.set(tomb, [...(byTomb.get(tomb) ?? []), row.id]);
    }
    let importRowCount = 0;
    for (const [tomb, ids] of byTomb) {
      const updated = await tx.importRow.updateMany({
        where: { id: { in: ids } },
        data: {
          raw: { erased: true },
          parsed: { erased: true },
          errors: [],
          ...(tomb === null ? {} : { signature: tomb }),
        },
      });
      importRowCount += updated.count;
    }
    const importRowsErased = { count: importRowCount };

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
      // Сетевой адрес и браузер — персональные данные того, кто входил и
      // скачивал. Строки остаются: по ним видно, что вход и выдача файла
      // были, — но адрес и браузер стёртого клиента затираются во всех
      // четырёх местах, где они копились (решение Р-252).
      await tx.session.updateMany({
        where: { userId: client.userId },
        data: { ip: null, userAgent: null },
      });
      await tx.loginToken.updateMany({
        where: { userId: client.userId },
        data: { requestIp: null },
      });
      await tx.auditEvent.updateMany({
        where: { actorId: client.userId },
        data: { actorIp: null },
      });
      await tx.fileAccessLog.updateMany({
        where: { userId: client.userId },
        data: { ip: null, userAgent: null },
      });
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
      // Способы связи — это телефон и ссылки на мессенджеры, то есть
      // персональные данные; строки удаляются целиком, а не затираются
      // по значению (решение Р-198). Правила уведомлений уходят вместе с
      // ними: без каналов они бессмысленны.
      await tx.contactChannel.deleteMany({ where: { userId: client.userId } });
      await tx.notifyRule.deleteMany({ where: { userId: client.userId } });
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
          texts: materials.count + stages.count + comments.count + reasons.count,
          events: events.count + journal.count + personal.count + reversals,
          notifications: notifications.count,
          importRows: importRowsErased.count,
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
      texts: materials.count + stages.count + comments.count + reasons.count,
      events: events.count + journal.count + personal.count + reversals,
      notifications: notifications.count,
      importRows: importRowsErased.count,
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
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fullName: true,
      email: true,
      _count: { select: { projects: true } },
    },
  });
}
