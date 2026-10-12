/**
 * Отметки чек-листа вида работы по работе (задание владельца 12.10.2026,
 * решение Р-551).
 *
 * Процессные чек-листы — памятка на одно дело, их отметки не хранятся
 * (Р-494): состояние дела уже держит кабинет. Чек-лист вида работы другой:
 * «требования совета получены», «автореферат сверен» кабинету неизвестны, и
 * без отметок менеджер и куратор держали бы их в голове. Отметка — факт
 * «шаг сделан», кем и когда; текст шага — в коде.
 *
 * Отмечают руководитель, менеджер работы и назначенный куратор
 * (`CHECKLIST_MARK`). Закрытая работа — только чтение, как всё
 * производство (Р-293).
 */

import { prisma } from '../db.ts';
import { can, ensure, scopeProjects, workClosed, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moneySettled, type WorkState } from './checklist-auto.ts';
import { checklistProgress, markChanges, serviceChecklist } from './service-checklists.ts';

export interface StepMark {
  readonly doneAt: Date;
  /** Кто отметил; `null` — учётная запись снята. */
  readonly by: string | null;
}

const PROJECT_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  clientId: true,
  managerId: true,
  expertId: true,
  serviceType: { select: { code: true, name: true } },
} as const;

/** Чек-лист работы для экрана; `null` — работы нет или она не видна. */
export async function workChecklist(actor: Actor, code: string) {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const project = await prisma.project.findFirst({ where: { code, ...scope }, select: PROJECT_SELECT });
  // Клиенту экран не отличается от несуществующего: чек-лист — внутренняя
  // кухня практики, и «нет доступа» сказало бы о нём больше нужного.
  if (project === null || !can(actor, 'CHECKLIST_MARK', project)) return null;
  const list = serviceChecklist(project.serviceType.code);
  if (list === null) return { project, list: null, marks: new Map<string, StepMark>(), progress: null, closed: workClosed(project.status) };
  const rows = await prisma.checklistMark.findMany({
    where: { projectId: project.id, checklistKey: list.key },
    select: { stepKey: true, doneAt: true, doneBy: { select: { fullName: true } } },
  });
  const marks = new Map<string, StepMark>(rows.map((row) => [row.stepKey, { doneAt: row.doneAt, by: row.doneBy?.fullName ?? null }]));
  return { project, list, marks, progress: checklistProgress(list, marks.keys()), closed: workClosed(project.status) };
}

/**
 * Счёт «N из M» для карточки и перечня работ: по каждой видимой работе
 * одной выборкой. Работы, где смотрящий не вправе отмечать, в ответ не
 * попадают.
 */
export async function checklistCounts(
  actor: Actor,
  projects: readonly { id: string; clientId: string; managerId: string; expertId: string | null; serviceCode: string }[],
): Promise<Map<string, { done: number; total: number }>> {
  const scope = scopeProjects(actor);
  const out = new Map<string, { done: number; total: number }>();
  if (scope === null) return out;
  const own = projects.filter(
    (project) => can(actor, 'CHECKLIST_MARK', project) && serviceChecklist(project.serviceCode) !== null,
  );
  if (own.length === 0) return out;
  const rows = await prisma.checklistMark.findMany({
    where: { projectId: { in: own.map((project) => project.id) }, project: scope },
    select: { projectId: true, checklistKey: true, stepKey: true },
  });
  for (const project of own) {
    const list = serviceChecklist(project.serviceCode)!;
    const keys = rows.filter((row) => row.projectId === project.id && row.checklistKey === list.key).map((row) => row.stepKey);
    out.set(project.id, checklistProgress(list, keys));
  }
  return out;
}

/** Сохранить отметки по отправке формы экрана чек-листа работы. */
export async function saveChecklistMarks(
  actor: Actor,
  input: { projectId: string; checklistKey: string; shown: readonly string[]; checked: readonly string[] },
): Promise<{ added: number; removed: number }> {
  const scope = scopeProjects(actor);
  if (scope === null) throw new Error('Работа не найдена');
  const project = await prisma.project.findFirst({ where: { id: input.projectId, ...scope }, select: PROJECT_SELECT });
  if (project === null) throw new Error('Работа не найдена');
  ensure(actor, 'CHECKLIST_MARK', project);
  if (workClosed(project.status)) throw new Error('Работа закрыта: отметки чек-листа не меняются');
  const list = serviceChecklist(project.serviceType.code);
  if (list === null || list.key !== input.checklistKey) throw new Error('Чек-лист не относится к виду этой работы');
  const { add, remove } = markChanges(list, input.shown, input.checked);
  if (add.length === 0 && remove.length === 0) return { added: 0, removed: 0 };
  await prisma.$transaction(async (tx) => {
    if (add.length > 0) {
      await tx.checklistMark.createMany({
        data: add.map((stepKey) => ({ projectId: project.id, checklistKey: list.key, stepKey, doneById: actor.id })),
        skipDuplicates: true,
      });
    }
    if (remove.length > 0) {
      await tx.checklistMark.deleteMany({ where: { projectId: project.id, checklistKey: list.key, stepKey: { in: remove } } });
    }
    await record(
      actor,
      {
        action: 'CHECKLIST_MARKED',
        objectType: 'Project',
        objectId: project.id,
        projectId: project.id,
        payload: { checklist: list.key, added: add, removed: remove },
      },
      tx,
    );
  });
  return { added: add.length, removed: remove.length };
}

/**
 * Состояние работы для автоотметок процессных чек-листов (Р-552); `null` —
 * работа не видна или смотрящий не ведёт её. Деньги — по правам: договор и
 * транши видит тот, кому открыт договор, начисления куратору — только
 * руководитель.
 */
export async function workState(actor: Actor, code: string): Promise<{ code: string; title: string; state: WorkState } | null> {
  const scope = scopeProjects(actor);
  if (scope === null) return null;
  const project = await prisma.project.findFirst({
    where: { code, ...scope },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      clientId: true,
      managerId: true,
      expertId: true,
      expert: { select: { status: true, expertProfile: { select: { ndaSignedAt: true } } } },
      client: { select: { user: { select: { lastLoginAt: true } } } },
      stages: { select: { state: true } },
      contract: { select: { totalAmount: true, tranches: { select: { status: true, amount: true } } } },
    },
  });
  if (project === null || !can(actor, 'CHECKLIST_MARK', project)) return null;
  const contractVisible = can(actor, 'CONTRACT_VIEW', project);
  const payoutsVisible = can(actor, 'PAYOUT_MANAGE', project);
  const payouts = payoutsVisible
    ? await prisma.expertPayout.findMany({ where: { projectId: project.id }, select: { status: true } })
    : [];
  const contract = project.contract;
  return {
    code: project.code,
    title: project.title,
    state: {
      curatorReady:
        project.expert !== null && project.expert.status === 'ACTIVE' && project.expert.expertProfile?.ndaSignedAt != null,
      ownNda: actor.role === 'EXPERT' ? actor.expertNdaSignedAt !== null : null,
      stages: project.stages.length,
      stagesDone: project.stages.filter((stage) => stage.state === 'DONE').length,
      contractSchedule: contractVisible ? contract !== null && contract.tranches.length > 0 : null,
      moneySettled: contractVisible ? contract !== null && moneySettled(contract.totalAmount, contract.tranches) : null,
      // Без начислений шаг «выплачено» не выполнен: начислять нечего — не
      // значит выплачено.
      payoutsPaid: payoutsVisible ? payouts.length > 0 && payouts.every((payout) => payout.status === 'PAID') : null,
      clientEntered: project.client.user?.lastLoginAt != null,
      status: project.status,
    },
  };
}
