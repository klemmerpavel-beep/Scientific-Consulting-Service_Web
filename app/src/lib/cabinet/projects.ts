import { prisma } from '../db.ts';
import { ensure, type Actor, type ProjectRef } from './access.ts';
import { record } from './audit.ts';
import { declineLetter } from './lead-letter.ts';
import { enqueue, enqueueToLead } from './outbox.ts';
import { materialKey, storage } from './storage.ts';
import { siteUrl } from '../site-url.ts';
import { now } from './clock.ts';
import { STAGE_TRANSITIONS } from './stage-state.ts';
import {
  PROJECT_STATUS_LABEL,
  canChangeProjectStatus,
  isClosedStatus,
  type ProjectStatusKey,
} from './project-status.ts';

/**
 * Производственный контур: модерация заявки, проект, этапы.
 *
 * Все операции проходят через модуль прав: обработчик маршрута не решает,
 * кому что можно, он лишь передаёт сюда действующее лицо.
 */

/** Приведение ФИО к виду, пригодному для поиска дублей. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\-_,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Код проекта вида PD-2026-014. */
export function formatProjectCode(year: number, number: number): string {
  return `PD-${year}-${String(number).padStart(3, '0')}`;
}

/**
 * Выдать следующий код года. Инкремент выполняется на стороне базы: два
 * менеджера, одобряющих заявки в одну секунду, получат разные номера, чего
 * не даёт вычисление `max(code) + 1` на стороне приложения.
 */
export async function nextProjectCode(
  tx: { projectCodeCounter: { upsert: (args: unknown) => Promise<{ lastNumber: number }> } },
  year: number,
): Promise<string> {
  const counter = await tx.projectCodeCounter.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return formatProjectCode(year, counter.lastNumber);
}

export interface ApproveLeadInput {
  readonly leadId: string;
  readonly serviceTypeId: string;
  readonly managerId: string;
  readonly title: string;
  readonly topic?: string | null;
  readonly dueOn?: Date | null;
  /** Применить шаблон этапов этого типа сопровождения. Необязательно. */
  readonly applyStageTemplate?: boolean;
}

/**
 * Одобрить заявку и развернуть её в проект. Заявка при этом не исчезает:
 * она получает ссылку на проект и остаётся в системе навсегда.
 */
export async function approveLead(actor: Actor, input: ApproveLeadInput) {
  ensure(actor, 'REQUEST_MODERATE');

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (lead === null) throw new Error('Заявка не найдена');
  if (lead.projectId !== null) throw new Error('Заявка уже развёрнута в проект');
  // Отклонённому ушло письмо «взяться не можем» (решение Р-217); работа по
  // той же заявке противоречила бы ему. Передумали — нужна новая заявка.
  if (lead.status === 'DECLINED') {
    throw new Error('Заявка отклонена, заявителю уже ответили: работа заводится по новой заявке');
  }

  const fullName = lead.name?.trim() || 'Клиент без имени';
  const normalized = normalizeName(fullName);
  const email = lead.contactKind === 'email' ? lead.contact.trim().toLowerCase() : null;
  const phone = lead.contactKind === 'phone' ? lead.contact.trim() : null;

  const project = await prisma.$transaction(async (tx) => {
    // Учётная запись клиента заводится только при известном адресе почты:
    // вход в кабинет идёт по ссылке на почту, телефоном войти нельзя.
    let userId: string | null = null;
    // Первое обращение отличается от повторного текстом письма: новому
    // человеку объясняется, что у него вообще есть кабинет, прежнему —
    // только что заведена ещё одна работа. Наличие записи проверяется до
    // upsert: после него отличить созданную от найденной уже нельзя.
    let firstTime = false;
    if (email !== null) {
      const known = await tx.user.findUnique({ where: { email }, select: { id: true } });
      firstTime = known === null;
      const user = await tx.user.upsert({
        where: { email },
        create: { email, fullName, role: 'CLIENT', phone },
        update: {},
      });
      userId = user.id;
    }

    const existing =
      userId === null
        ? null
        : await tx.clientProfile.findUnique({ where: { userId } });

    const client =
      existing ??
      (await tx.clientProfile.create({
        data: {
          userId,
          fullName,
          normalizedName: normalized,
          email,
          phone,
          university: null,
          speciality: lead.speciality ?? null,
        },
      }));

    const code = await nextProjectCode(tx as never, new Date().getUTCFullYear());

    const created = await tx.project.create({
      data: {
        code,
        clientId: client.id,
        serviceTypeId: input.serviceTypeId,
        title: input.title,
        topic: input.topic ?? lead.topic ?? null,
        managerId: input.managerId,
        dueOn: input.dueOn ?? null,
        source: 'WEB',
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { projectId: created.id, status: 'CONTRACTED' },
    });

    if (input.applyStageTemplate === true) {
      const template = await tx.stageTemplate.findMany({
        where: { serviceTypeId: input.serviceTypeId, isActive: true },
        orderBy: { position: 'asc' },
      });
      if (template.length > 0) {
        await tx.stage.createMany({
          data: template.map((item, index) => ({
            projectId: created.id,
            position: index + 1,
            title: item.title,
            dueOn:
              item.durationDays === null
                ? null
                : new Date(Date.now() + item.durationDays * 24 * 60 * 60 * 1000),
          })),
        });
      }
    }

    await tx.projectEvent.create({
      data: {
        projectId: created.id,
        actorId: actor.id,
        kind: 'PROJECT_CREATED',
        payload: { code, leadId: lead.id },
      },
    });

    // Клиент узнаёт об одобрении сам, а не после того, как о нём вспомнят.
    // Прежде учётная запись заводилась молча: человек оставлял заявку и
    // больше ничего не слышал, пока менеджер вручную не выдаст ссылку входа.
    //
    // Ссылка входа в письмо не кладётся намеренно. Она одноразовая и живёт
    // пятнадцать минут (`token.ts`), а письмо ждёт ближайшей рассылки и
    // может пролежать дольше: к моменту прочтения ссылка была бы мертва, и
    // приглашение выглядело бы поломкой. Человек открывает кабинет сам и
    // получает свежую ссылку на тот же адрес.
    if (userId !== null) {
      const base = siteUrl();
      const entrance = base === null ? 'страница «Личный кабинет» на сайте' : `${base}/cabinet`;
      await enqueue(tx, {
        userId,
        projectId: created.id,
        eventKind: 'PROJECT_OPENED',
        subject: firstTime
          ? `Заявка принята: работа ${code}`
          : `Заведена новая работа ${code}`,
        body:
          `${input.title}${created.topic === null ? '' : ` — ${created.topic}`}.\n` +
          (firstTime
            ? 'Ход работы, материалы и переписка с куратором собраны в личном кабинете.\n' +
              `Откройте ${entrance} и укажите этот адрес почты — придёт ссылка для входа.\n` +
              'Пароль не нужен: вход только по ссылке на почту.'
            : `Работа добавлена в ваш личный кабинет: ${entrance}.`),
        // Ключ по работе, а не по времени: одобрение происходит один раз, и
        // второго приглашения по той же работе быть не должно.
        dedupKey: `project:${created.id}:opened`,
      });
    }

    return created;
  });

  await record(actor, {
    action: 'LEAD_APPROVED',
    objectType: 'Lead',
    objectId: lead.id,
    projectId: project.id,
    payload: { code: project.code },
  });

  await moveLeadAttachments(actor, lead.id, project.id);

  return project;
}

/**
 * Вложения заявки переезжают в материалы созданной работы.
 *
 * Иначе файл, ради которого человек и написал, остался бы при заявке:
 * дойти до него можно было бы только через экран разбора, а работа,
 * которую он описывает, о нём не знала бы (решение Р-191).
 *
 * Перенос идёт после транзакции создания работы: он ходит в хранилище, а
 * держать транзакцию открытой на время записи байтов нельзя. Отказ
 * хранилища не отменяет одобрения — строка вложения остаётся при заявке и
 * переносится следующей попыткой.
 */
async function moveLeadAttachments(actor: Actor, leadId: string, projectId: string) {
  const files = await prisma.leadAttachment.findMany({
    where: { leadId, materialId: null, purgedAt: null },
    orderBy: { uploadedAt: 'asc' },
  });
  if (files.length === 0) return;

  const store = storage();
  for (const file of files) {
    const material = await prisma.material.create({
      data: {
        projectId,
        title: file.originalName.slice(0, 300),
        createdById: actor.id,
      },
    });
    const key = materialKey(projectId, material.id, 1, file.originalName);
    await store.put(key, await store.get(file.storageKey), file.contentType);
    await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey: key,
        originalName: file.originalName,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        contentType: file.contentType,
        uploadedById: file.uploadedById ?? actor.id,
      },
    });
    // Исходный объект убирается: две копии одного файла означали бы два
    // места, откуда его придётся вычищать по требованию субъекта.
    await store.remove(file.storageKey);
    await prisma.leadAttachment.update({
      where: { id: file.id },
      data: { materialId: material.id, purgedAt: new Date() },
    });
  }

  await record(actor, {
    action: 'LEAD_FILES_MOVED',
    objectType: 'Lead',
    objectId: leadId,
    projectId,
    payload: { count: files.length },
  });
}

/**
 * Отклонить заявку. Заявка остаётся в системе, а причина уходит заявителю
 * письмом — в той же транзакции, что и сама отметка отказа.
 *
 * Прежде причина записывалась в заявку и дальше не шла: экрана, где
 * заявитель её прочёл бы, нет, а кабинета у отклонённого не будет. Человек
 * оставлял обращение и не получал ответа вовсе (решение Р-217).
 *
 * Возвращает заявку и признак, ушло ли письмо в очередь: у того, кто
 * оставил телефон, адреса нет, и ответ ему — звонком.
 */
export async function declineLead(actor: Actor, leadId: string, reason: string) {
  ensure(actor, 'REQUEST_MODERATE');
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('Отклонение без причины не принимается: причину получает заявитель');
  }
  const found = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { projectId: true, status: true },
  });
  if (found === null) throw new Error('Заявка не найдена');
  // Отказ по заявке, уже ставшей работой, отправил бы человеку «нет» после
  // приглашения в кабинет.
  if (found.projectId !== null) throw new Error('Заявка уже развёрнута в проект');
  // Повторный отказ переписывал причину, а письмо — по ключу — оставалось
  // прежним: экран показывал новую причину рядом с «письмо ушло», хотя
  // человек получил старую (решение Р-227).
  if (found.status === 'DECLINED') throw new Error('Заявка уже отклонена, заявителю ответили');

  const { lead, queued } = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({
      where: { id: leadId },
      data: { status: 'DECLINED', declineReason: trimmed },
    });
    // Заявке, помеченной при приёме как машинная, письма нет: адрес в ней
    // мог вписать кто угодно, и отказ стал бы способом слать письма на
    // чужой ящик от имени практики.
    const queued =
      found.status !== 'SPAM' &&
      (await enqueueToLead(tx, {
        leadId,
        eventKind: 'LEAD_DECLINED',
        ...declineLetter(lead.name, lead.topic, trimmed),
        // Ключ по заявке: повторное отклонение с правленой причиной второго
        // письма не отправит — человек уже получил ответ.
        dedupKey: `lead:${leadId}:declined`,
      }));
    return { lead, queued };
  });

  await record(actor, {
    action: 'LEAD_DECLINED',
    objectType: 'Lead',
    objectId: leadId,
    payload: { letter: queued },
  });
  return { lead, queued };
}

/** Реквизиты проекта для модуля прав. */
export async function projectRef(projectId: string): Promise<ProjectRef | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, managerId: true, expertId: true },
  });
}

export async function assignExpert(actor: Actor, projectId: string, expertId: string | null) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_ASSIGN_EXPERT', ref);

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { expertId },
    });
    await tx.projectEvent.create({
      data: {
        projectId,
        actorId: actor.id,
        kind: 'EXPERT_ASSIGNED',
        payload: { expertId },
      },
    });
    return updated;
  });

  await record(actor, {
    action: 'EXPERT_ASSIGNED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from: ref.expertId, to: expertId },
  });
  return project;
}

/**
 * Сменить куратора работы.
 *
 * Куратором становится тот, кто одобрил заявку, и до сих пор изменить это
 * было нечем: работа оставалась за первым, кто до неё дошёл. Руководитель
 * передаёт её другому — клиент видит смену в ленте событий, потому что
 * меняется тот, кому он пишет.
 */
export async function assignManager(actor: Actor, projectId: string, managerId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_SET_MANAGER', ref);

  // Куратором может быть только действующий сотрудник практики: иначе
  // работа ушла бы к клиенту или к приостановленной учётной записи.
  const target = await prisma.user.findFirst({
    where: { id: managerId, status: 'ACTIVE', role: { in: ['MANAGER', 'HEAD'] } },
    select: { id: true },
  });
  if (target === null) throw new Error('Куратором может быть менеджер или руководитель');

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id: projectId }, data: { managerId } });
    await tx.projectEvent.create({
      data: { projectId, actorId: actor.id, kind: 'MANAGER_ASSIGNED', payload: { managerId } },
    });
    return updated;
  });

  await record(actor, {
    action: 'MANAGER_ASSIGNED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from: ref.managerId, to: managerId },
  });
  return project;
}

export interface AddStageInput {
  readonly projectId: string;
  readonly title: string;
  /** Суть выполнения: что делается на этапе и чем он закончится. */
  readonly summary?: string | null;
  readonly dueOn?: Date | null;
  readonly expertId?: string | null;
}

/** Завести этап. Название — свободный текст менеджера, состояние — из перечня. */
export async function addStage(actor: Actor, input: AddStageInput) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Этап без названия не заводится');

  return prisma.$transaction(async (tx) => {
    const last = await tx.stage.findFirst({
      where: { projectId: input.projectId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return tx.stage.create({
      data: {
        projectId: input.projectId,
        position: (last?.position ?? 0) + 1,
        title,
        summary: input.summary?.trim() || null,
        dueOn: input.dueOn ?? null,
        expertId: input.expertId ?? null,
      },
    });
  });
}

/**
 * Правка этапа менеджером: название, суть выполнения, срок.
 *
 * План работ заводит и ведёт менеджер — заказчик потребовал, чтобы он мог
 * не только добавить этап, но и описать, что на нём делается, и поправить
 * срок, не заходя на отдельный экран (решение Р-190). Состояние правится
 * своим действием: у него закрытый перечень переходов.
 */
export async function editStage(
  actor: Actor,
  input: {
    readonly stageId: string;
    readonly title: string;
    readonly summary?: string | null;
    readonly dueOn?: Date | null;
  },
) {
  const stage = await prisma.stage.findUnique({
    where: { id: input.stageId },
    select: { id: true, projectId: true, title: true },
  });
  if (stage === null) throw new Error('Этап не найден');
  const ref = await projectRef(stage.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'STAGE_EDIT', ref);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Этап без названия не заводится');

  const saved = await prisma.stage.update({
    where: { id: stage.id },
    data: { title, summary: input.summary?.trim() || null, dueOn: input.dueOn ?? null },
  });
  await record(actor, {
    action: 'STAGE_EDITED',
    objectType: 'Stage',
    objectId: stage.id,
    projectId: stage.projectId,
    payload: { from: stage.title, to: title },
  });
  return saved;
}

/**
 * Правка карточки работы менеджером: название, тема, короткое описание,
 * срок. Прежде карточка заполнялась один раз при одобрении заявки и
 * больше не менялась ничем (решение Р-190).
 */
export async function editProject(
  actor: Actor,
  input: {
    readonly projectId: string;
    readonly title: string;
    readonly topic?: string | null;
    readonly summary?: string | null;
    readonly dueOn?: Date | null;
  },
) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Работа без названия не заводится');

  const saved = await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title,
      topic: input.topic?.trim() || null,
      summary: input.summary?.trim() || null,
      dueOn: input.dueOn ?? null,
    },
  });
  await record(actor, {
    action: 'PROJECT_EDITED',
    objectType: 'Project',
    objectId: input.projectId,
    projectId: input.projectId,
    payload: { title },
  });
  return saved;
}

/**
 * Сменить состояние работы: приостановить, завершить, отменить, вернуть в
 * действие (решение Р-223).
 *
 * Прежде состояние и дату закрытия писал только перенос книги заказов:
 * работу, заведённую в кабинете, закрыть было нельзя, хотя сводка
 * советовала «закрыть работу». Она оставалась действующей навсегда — не
 * попадала в «Завершённые», в отчёт о закрытых за период и в сроки
 * выполнения аналитики, а после срока висела в «Требует внимания».
 */
export async function setProjectStatus(actor: Actor, projectId: string, to: ProjectStatusKey) {
  const ref = await projectRef(projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);
  if (!(to in PROJECT_STATUS_LABEL)) throw new Error('Неизвестное состояние работы');

  const current = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true },
  });
  const from = current.status as ProjectStatusKey;
  if (!canChangeProjectStatus(from, to)) {
    throw new Error(
      `Из состояния «${PROJECT_STATUS_LABEL[from]}» в «${PROJECT_STATUS_LABEL[to]}» работа не переводится`,
    );
  }

  // Дата закрытия — день, а не мгновение: так её пишет и перенос книги.
  const today = now();
  const closedOn = isClosedStatus(to)
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    : null;

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { status: to, closedOn },
    });
    await tx.projectEvent.create({
      data: { projectId, actorId: actor.id, kind: 'PROJECT_STATUS_CHANGED', payload: { from, to } },
    });
    return updated;
  });

  await record(actor, {
    action: 'PROJECT_STATUS_CHANGED',
    objectType: 'Project',
    objectId: projectId,
    projectId,
    payload: { from, to },
  });
  return saved;
}

export type StageState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AWAITING_CLIENT'
  | 'IN_APPROVAL'
  | 'DONE';

export function canTransition(from: StageState, to: StageState): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

export async function setStageState(
  actor: Actor,
  stageId: string,
  to: StageState,
  reason?: string | null,
) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      project: { select: { id: true, clientId: true, managerId: true, expertId: true } },
    },
  });
  if (stage === null) throw new Error('Этап не найден');

  // Согласование этапа — действие клиента, остальные переходы ведёт менеджер.
  const action = stage.state === 'IN_APPROVAL' && to === 'DONE' ? 'STAGE_APPROVE' : 'STAGE_SET_STATE';
  ensure(actor, action, stage.project);

  const from = stage.state as StageState;
  if (!canTransition(from, to)) {
    throw new Error(`Переход этапа из «${from}» в «${to}» не предусмотрен`);
  }
  if (to === 'AWAITING_CLIENT' && !(reason ?? '').trim()) {
    throw new Error(
      'Остановка этапа без причины не принимается: причину читает клиент, ' +
        'и от неё зависит, что и когда он пришлёт',
    );
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.stage.update({
      where: { id: stageId },
      data: {
        state: to,
        blockedReason: to === 'AWAITING_CLIENT' ? (reason ?? '').trim() : null,
        awaitingClientSince: to === 'AWAITING_CLIENT' ? now : null,
        startedAt: from === 'NOT_STARTED' && to === 'IN_PROGRESS' ? now : stage.startedAt,
        completedAt: to === 'DONE' ? now : null,
      },
    });
    await tx.stageStateChange.create({
      data: { stageId, fromState: from, toState: to, actorId: actor.id, reason: reason ?? null },
    });
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_STATE_CHANGED',
        payload: { stageId, from, to },
      },
    });

    // Уведомление ставится здесь же, в одной транзакции с переводом этапа:
    // недоступная почта не должна откатывать работу, а потерянное
    // уведомление оставило бы клиента в неведении, что от него ждут файл.
    if (to === 'AWAITING_CLIENT' || to === 'IN_APPROVAL') {
      const project = await tx.project.findUnique({
        where: { id: stage.projectId },
        select: { code: true, title: true, client: { select: { userId: true } } },
      });
      const userId = project?.client.userId ?? null;
      if (userId !== null) {
        const awaiting = to === 'AWAITING_CLIENT';
        await enqueue(tx, {
          userId,
          projectId: stage.projectId,
          eventKind: awaiting ? 'STAGE_AWAITING_CLIENT' : 'STAGE_IN_APPROVAL',
          subject: awaiting
            ? `Этап «${stage.title}» ждёт ваших материалов`
            : `Этап «${stage.title}» готов к согласованию`,
          body:
            `Проект ${project?.code} — ${project?.title}.\n` +
            (awaiting
              ? `${(reason ?? '').trim()}\n`
              : 'Посмотрите последнюю версию материалов и комментарии к ней.\n') +
            'Открыть этап можно в личном кабинете.',
          dedupKey: `stage:${stageId}:${to.toLowerCase()}:${now.toISOString().slice(0, 16)}`,
        });
      }
    }

    return updated;
  });
}
