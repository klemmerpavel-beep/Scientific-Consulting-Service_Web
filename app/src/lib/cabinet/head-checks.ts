/**
 * Дела руководителя «акт и счёт» (требование РК-12, решение Р-338).
 *
 * Оферта (п. 6.2, 7.1) описывает порядок: приёмка этапа → акт → оплата
 * следующего этапа. Кабинет о приёмке руководителю не говорил. Теперь:
 * - этап «Завершён» (согласован клиентом, менеджером за клиента или принят
 *   по сроку) — дело «Этап принят: приложить акт и выставить счёт за
 *   следующий этап» и сигнал `STAGE_ACCEPTED`;
 * - завершённый этап возвращён в работу — дело «Этап возвращён в работу:
 *   проверьте акт и транш»;
 * - заказ с договором завёл менеджер — дело «Проверьте договор».
 * Дело закрывается актом, приложенным по работе, или кнопкой руководителя
 * «Не требуется» / «Проверено».
 */

import type { HeadCheckKind, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, scopeProjects, type Actor } from './access.ts';
import { record } from './audit.ts';
import { enqueue } from './outbox.ts';
import { projectRef } from './projects.ts';

type Db = Prisma.TransactionClient | typeof prisma;

const HOW: Record<string, string> = {
  CLIENT_APPROVE: 'клиент согласовал этап',
  STAFF_FOR_CLIENT: 'менеджер согласовал этап за клиента',
  AUTO_ACCEPT: 'этап принят по истечении срока согласования',
};

/**
 * Этап принят — дело руководителю и сигнал. Одно открытое дело на этап:
 * повторная приёмка после возврата не плодит второе.
 */
export async function openAcceptCheck(db: Db, stageId: string, via: string): Promise<void> {
  const stage = await db.stage.findUniqueOrThrow({
    where: { id: stageId },
    select: { id: true, title: true, projectId: true, project: { select: { code: true } } },
  });
  const open = await db.headCheck.count({
    where: { kind: 'ACT_AFTER_ACCEPT', stageId, closedAt: null },
  });
  if (open > 0) return;
  const check = await db.headCheck.create({
    data: { kind: 'ACT_AFTER_ACCEPT', projectId: stage.projectId, stageId },
  });
  const heads = await db.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
  for (const head of heads) {
    await enqueue(db, {
      userId: head.id,
      projectId: stage.projectId,
      eventKind: 'STAGE_ACCEPTED',
      subject: `Этап принят: ${stage.project.code}`,
      body:
        `Работа ${stage.project.code}: ${HOW[via] ?? 'этап принят'} — «${stage.title}».\n` +
        'По оферте следом оформляется акт и выставляется счёт за следующий этап — «Оплаты и документы» работы.',
      dedupKey: `head-check:${check.id}:${head.id}`,
      path: `/cabinet/projects/${stage.project.code}/payments`,
    });
  }
}

/** Возврат завершённого этапа — дело «проверьте акт и транш». */
export async function openReopenCheck(db: Db, stageId: string, projectId: string): Promise<void> {
  await db.headCheck.create({ data: { kind: 'ACT_AFTER_REOPEN', projectId, stageId } });
}

/** Заказ с договором, заведённый менеджером, — дело «Проверьте договор». */
export async function openContractCheck(db: Db, projectId: string): Promise<void> {
  await db.headCheck.create({ data: { kind: 'CONTRACT_BY_MANAGER', projectId } });
}

/** Приложен акт по работе — дела об акте по ней закрываются. */
export async function closeActChecks(db: Db, projectId: string, closedById: string): Promise<number> {
  const closed = await db.headCheck.updateMany({
    where: { projectId, closedAt: null, kind: { in: ['ACT_AFTER_ACCEPT', 'ACT_AFTER_REOPEN'] } },
    data: { closedAt: new Date(), closedById, closeNote: 'приложен акт' },
  });
  return closed.count;
}

const NOTE: Record<HeadCheckKind, readonly string[]> = {
  ACT_AFTER_ACCEPT: ['не требуется'],
  ACT_AFTER_REOPEN: ['не требуется', 'проверено'],
  CONTRACT_BY_MANAGER: ['проверено'],
};

/** Закрыть дело кнопкой: «Не требуется» или «Проверено». Право — деньги работы. */
export async function closeCheck(actor: Actor, checkId: string, note: string): Promise<void> {
  const check = await prisma.headCheck.findUnique({ where: { id: checkId }, select: { kind: true, projectId: true, closedAt: true } });
  if (check === null) throw new Error('Дело не найдено');
  const ref = await projectRef(check.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYMENT_EDIT', ref);
  if (!NOTE[check.kind].includes(note)) throw new Error('Неизвестная отметка дела');
  const closed = await prisma.headCheck.updateMany({
    where: { id: checkId, closedAt: null },
    data: { closedAt: new Date(), closedById: actor.id, closeNote: note },
  });
  if (closed.count === 0) throw new Error('Дело уже закрыто: обновите страницу');
  await record(actor, {
    action: 'HEAD_CHECK_CLOSED',
    objectType: 'HeadCheck',
    objectId: checkId,
    projectId: check.projectId,
    payload: { kind: check.kind, note },
  });
}

export const CHECK_TITLE: Record<HeadCheckKind, string> = {
  ACT_AFTER_ACCEPT: 'Этап принят: приложить акт и выставить счёт за следующий этап',
  ACT_AFTER_REOPEN: 'Этап возвращён в работу: проверьте акт и транш',
  CONTRACT_BY_MANAGER: 'Проверьте договор',
};

/** Открытые дела руководителя — по всем работам; по одной работе — `projectId`. */
export async function openChecks(actor: Actor, projectId?: string) {
  const scope = scopeProjects(actor);
  if (scope === null || actor.role !== 'HEAD') return [];
  return prisma.headCheck.findMany({
    where: { closedAt: null, ...(projectId === undefined ? {} : { projectId }), project: scope },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      createdAt: true,
      stage: { select: { title: true } },
      project: { select: { code: true, title: true, contract: { select: { totalAmount: true } } } },
    },
  });
}

/**
 * Подсказка менеджеру на экране этапа: транш следующего этапа не оплачен.
 * Перевод этапа она не запрещает. Без транша, связанного со следующим
 * этапом, подсказки нет: кабинет не знает, за что он.
 */
export async function nextStageUnpaid(actor: Actor, stageId: string): Promise<boolean> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, select: { projectId: true, position: true } });
  if (stage === null) return false;
  const ref = await projectRef(stage.projectId);
  if (ref === null) return false;
  ensure(actor, 'STAGE_SET_STATE', ref);
  const next = await prisma.stage.findFirst({
    where: { projectId: stage.projectId, position: { gt: stage.position } },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  if (next === null) return false;
  const unpaid = await prisma.tranche.count({
    where: { stageId: next.id, status: { in: ['PLANNED', 'INVOICED'] } },
  });
  return unpaid > 0;
}
