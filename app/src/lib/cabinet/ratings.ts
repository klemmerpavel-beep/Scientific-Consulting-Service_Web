/**
 * Оценка сопровождения после завершения работы (улучшение У-4 из квиза
 * владельца 12.10.2026, решение Р-564).
 *
 * Клиент завершённой работы ставит оценку 1–5, по желанию пишет отзыв и
 * разрешает его опубликовать. Одна оценка на работу; изменить её нельзя:
 * оценка — мнение на момент завершения, а не поле для торга. Руководитель
 * видит средние по практике, менеджерам и кураторам; менеджеру и куратору
 * оценки не видны.
 */

import { prisma } from '../db.ts';
import { can, ensure, type Actor, type ProjectRef } from './access.ts';
import { record } from './audit.ts';
import { RATING_TEXT_MAX, parseScore, ratingStats } from './rating-stats.ts';

export class RatingError extends Error {}

/** Оценка на карточке клиента: стоит ли форма и есть ли уже оценка. */
export async function ratingFor(
  actor: Actor,
  project: ProjectRef & { status: string },
): Promise<{ mayRate: boolean; score: number | null }> {
  if (!can(actor, 'WORK_RATE', project)) return { mayRate: false, score: null };
  const row = await prisma.workRating.findUnique({ where: { projectId: project.id }, select: { score: true } });
  return { mayRate: row === null && project.status === 'COMPLETED', score: row?.score ?? null };
}

/** Поставить оценку. Отказ — `RatingError` с причиной для человека. */
export async function rateWork(
  actor: Actor,
  input: { projectId: string; score: string; text: string; publishAllowed: boolean },
  ip: string | null = null,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, clientId: true, managerId: true, expertId: true, status: true },
  });
  if (project === null) throw new RatingError('Работа не найдена: обновите страницу.');
  ensure(actor, 'WORK_RATE', project);
  if (project.status !== 'COMPLETED') throw new RatingError('Оценить можно завершённую работу.');
  const score = parseScore(input.score);
  if (score === null) throw new RatingError('Выберите оценку от 1 до 5.');
  const text = input.text.trim();
  if (text.length > RATING_TEXT_MAX) throw new RatingError(`Отзыв — не длиннее ${RATING_TEXT_MAX} знаков.`);
  try {
    const saved = await prisma.workRating.create({
      data: {
        projectId: project.id,
        score,
        text: text === '' ? null : text,
        // Разрешение без текста ничего не публикует и не хранится.
        publishAllowed: text !== '' && input.publishAllowed,
        managerId: project.managerId,
        expertId: project.expertId,
      },
      select: { id: true },
    });
    // В журнал — оценка, без текста отзыва: журнал хранится дольше и
    // затиранию по требованию субъекта не подлежит.
    await record(actor, {
      action: 'WORK_RATED',
      objectType: 'WorkRating',
      objectId: saved.id,
      projectId: project.id,
      ip,
      payload: { score, withText: text !== '', publishAllowed: text !== '' && input.publishAllowed, ...(actor.viaStaffLink === true ? { staffLink: true } : {}) },
    });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2002') throw new RatingError('Оценка этой работы уже поставлена.');
    throw error;
  }
}

/** Средние для руководителя: по практике, менеджерам и кураторам. */
export async function ratingSummary(actor: Actor) {
  if (actor.role !== 'HEAD' || !can(actor, 'AUDIT_VIEW')) return ratingStats([]);
  const rows = await prisma.workRating.findMany({ select: { score: true, managerId: true, expertId: true } });
  return ratingStats(rows);
}
