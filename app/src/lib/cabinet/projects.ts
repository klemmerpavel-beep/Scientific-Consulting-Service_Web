import { prisma } from '../db.ts';
import { ensure, type Actor, type ProjectRef } from './access.ts';
import { record } from './audit.ts';
import { enqueue } from './outbox.ts';

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

  const fullName = lead.name?.trim() || 'Клиент без имени';
  const normalized = normalizeName(fullName);
  const email = lead.contactKind === 'email' ? lead.contact.trim().toLowerCase() : null;
  const phone = lead.contactKind === 'phone' ? lead.contact.trim() : null;

  const project = await prisma.$transaction(async (tx) => {
    // Учётная запись клиента заводится только при известном адресе почты:
    // вход в кабинет идёт по ссылке на почту, телефоном войти нельзя.
    let userId: string | null = null;
    if (email !== null) {
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

    return created;
  });

  await record(actor, {
    action: 'LEAD_APPROVED',
    objectType: 'Lead',
    objectId: lead.id,
    projectId: project.id,
    payload: { code: project.code },
  });

  return project;
}

/** Отклонить заявку. Причина видна заявителю; заявка остаётся в системе. */
export async function declineLead(actor: Actor, leadId: string, reason: string) {
  ensure(actor, 'REQUEST_MODERATE');
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new Error('Отклонение без причины не принимается: причину видит заявитель');
  }
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { status: 'DECLINED', declineReason: trimmed },
  });
  await record(actor, {
    action: 'LEAD_DECLINED',
    objectType: 'Lead',
    objectId: leadId,
  });
  return lead;
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
        dueOn: input.dueOn ?? null,
        expertId: input.expertId ?? null,
      },
    });
  });
}

export type StageState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AWAITING_CLIENT'
  | 'IN_APPROVAL'
  | 'DONE';

/**
 * Допустимые переходы состояния этапа. Перечень закрыт: состояние держит на
 * себе уведомления, фильтры, расчёт просрочек и аналитику, поэтому переход
 * «откуда угодно куда угодно» означал бы, что ни одна из этих величин не
 * имеет смысла.
 */
const TRANSITIONS: Record<StageState, readonly StageState[]> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_CLIENT', 'IN_APPROVAL', 'NOT_STARTED'],
  AWAITING_CLIENT: ['IN_PROGRESS', 'IN_APPROVAL'],
  IN_APPROVAL: ['DONE', 'IN_PROGRESS'],
  DONE: [],
};

export function canTransition(from: StageState, to: StageState): boolean {
  return TRANSITIONS[from].includes(to);
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
