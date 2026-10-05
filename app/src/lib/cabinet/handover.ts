/**
 * Сдача этапа куратором менеджеру (требование Э-05, решение Р-325).
 *
 * Новое состояние этапа не заводится: состояние читают подписи клиента,
 * срок согласования, сводки, аналитика и напоминания, и новое значение
 * изменило бы экран клиента. Пометка «сдан» — поле `Stage.handedOverAt`,
 * записка — `Stage.handoverNote`; для клиента этап остаётся «В работе».
 *
 * Переходы захватывают этап по условию в одном `updateMany`, как перевод
 * состояния (Р-240): два одновременных действия не проходят оба.
 */

import { prisma } from '../db.ts';
import { ensure, ensureContributionOpen, type Actor } from './access.ts';
import { stageLink } from './approval.ts';
import { record } from './audit.ts';
import { notifyCurator, notifyExpert } from './outbox.ts';
import { OUTCOME_LIMIT } from './projects.ts';

/** Предел записки и причины возврата — тот же, что у «Итога этапа». */
export const HANDOVER_LIMIT = OUTCOME_LIMIT;

async function loadStage(stageId: string) {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      title: true,
      position: true,
      state: true,
      projectId: true,
      handedOverAt: true,
      project: {
        select: { id: true, code: true, clientId: true, managerId: true, expertId: true, status: true },
      },
    },
  });
  if (stage === null) throw new Error('Этап не найден');
  return stage;
}

function cleanText(raw: string, what: string): string {
  const text = raw.trim();
  if (text === '') throw new Error(`${what} обязательна`);
  if (text.length > HANDOVER_LIMIT) throw new Error(`${what} — не длиннее ${HANDOVER_LIMIT} знаков`);
  return text;
}

/**
 * Сдать этап менеджеру. Доступно назначенному куратору с договором
 * поручения, когда этап «В работе», не сдан и к нему приложена хотя бы
 * одна версия этого куратора, не отклонённая менеджером (Д-3). Записка
 * «Что сделано и на что обратить внимание клиента» обязательна.
 */
export async function handOverStage(actor: Actor, stageId: string, note: string) {
  const stage = await loadStage(stageId);
  ensure(actor, 'STAGE_HAND_OVER', stage.project);
  ensureContributionOpen(actor, stage.project.status, stage.state);
  if (stage.state !== 'IN_PROGRESS') throw new Error('Сдать менеджеру можно только этап «В работе»');
  if (stage.handedOverAt !== null) throw new Error('Этап уже сдан: решение за менеджером');
  const text = cleanText(note, 'Записка «Что сделано и на что обратить внимание клиента»');
  const versions = await prisma.materialVersion.count({
    where: {
      uploadedById: actor.id,
      purgedAt: null,
      material: { stageId, kind: 'STAGE_MATERIAL', deletedAt: null },
      OR: [{ moderation: null }, { moderation: { status: { not: 'REJECTED' } } }],
    },
  });
  if (versions === 0) {
    throw new Error('Сдать этап можно, когда к нему приложена ваша версия материала');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.stage.updateMany({
      where: { id: stageId, state: 'IN_PROGRESS', handedOverAt: null },
      data: { handedOverAt: now, handoverNote: text },
    });
    if (claimed.count === 0) throw new Error('Этап уже сдан или переведён: обновите страницу');
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_HANDED_OVER',
        payload: { stageId, position: stage.position },
      },
    });
    await notifyCurator(tx, {
      projectId: stage.projectId,
      actorId: actor.id,
      eventKind: 'STAGE_HANDED_OVER',
      subject: `Куратор сдал этап «${stage.title}»`,
      body:
        `Работа ${stage.project.code}.\n` +
        `Куратор сдал этап «${stage.title}». Посмотрите материалы и записку куратора: ` +
        'переведите этап на согласование или верните куратору с причиной.\n' +
        stageLink(stageId),
      key: `stage:${stageId}:handed-over:${now.toISOString()}`,
      path: `/cabinet/stages/${stageId}`,
    });
  });
  await record(actor, {
    action: 'STAGE_HANDED_OVER',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
  });
}

/** Отозвать сдачу — пока менеджер не принял решение. Записка остаётся. */
export async function recallHandover(actor: Actor, stageId: string) {
  const stage = await loadStage(stageId);
  ensure(actor, 'STAGE_HAND_OVER', stage.project);
  ensureContributionOpen(actor, stage.project.status, stage.state);
  const claimed = await prisma.stage.updateMany({
    where: { id: stageId, state: 'IN_PROGRESS', handedOverAt: { not: null } },
    data: { handedOverAt: null },
  });
  if (claimed.count === 0) {
    throw new Error('Отозвать нечего: менеджер уже принял решение по этапу');
  }
  await prisma.projectEvent.create({
    data: {
      projectId: stage.projectId,
      actorId: actor.id,
      kind: 'STAGE_HANDOVER_RECALLED',
      payload: { stageId, position: stage.position },
    },
  });
  await record(actor, {
    action: 'STAGE_HANDOVER_RECALLED',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
  });
}

/**
 * Вернуть сданный этап куратору — менеджер работы или руководитель, с
 * обязательной причиной. Куратор получает её письмом и видит в блоке «Что
 * сделать сейчас».
 */
export async function handBackStage(actor: Actor, stageId: string, reason: string) {
  const stage = await loadStage(stageId);
  ensure(actor, 'STAGE_HAND_BACK', stage.project);
  const text = cleanText(reason, 'Причина возврата');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.stage.updateMany({
      where: { id: stageId, state: 'IN_PROGRESS', handedOverAt: { not: null } },
      data: { handedOverAt: null, handbackAt: now, handbackReason: text },
    });
    if (claimed.count === 0) throw new Error('Этап не сдан или уже переведён: обновите страницу');
    await tx.projectEvent.create({
      data: {
        projectId: stage.projectId,
        actorId: actor.id,
        kind: 'STAGE_HANDED_BACK',
        payload: { stageId, position: stage.position, reason: text },
      },
    });
    // Возврат — ход куратора: строка «Ход за вами» его настроек
    // (требование Э-09, решение Р-328).
    await notifyExpert(tx, {
      projectId: stage.projectId,
      actorId: actor.id,
      eventKind: 'CURATOR_TURN',
      letter: (work) => ({
        subject: `Этап «${stage.title}» возвращён вам`,
        body: `Работа ${work.code}.\nМенеджер вернул этап «${stage.title}». Причина: ${text}\n` + stageLink(stageId),
      }),
      key: `stage:${stageId}:handed-back:${now.toISOString()}`,
      path: `/cabinet/stages/${stageId}`,
    });
  });
  await record(actor, {
    action: 'STAGE_HANDED_BACK',
    objectType: 'Stage',
    objectId: stageId,
    projectId: stage.projectId,
  });
}
