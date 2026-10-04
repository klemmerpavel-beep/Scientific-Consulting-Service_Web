/**
 * Рекомендации руководителю: календарь продвижения и отметки «сделано» и
 * «отложено» (требование РК-16, решение Р-349).
 *
 * Расчёт — чистый модуль `analytics/calendar.ts`; здесь — данные
 * практики, настройки (дата начала учёта, пороги уверенности) и отметки.
 * Отметка общая для практики: ключ — экземпляр рекомендации, у следующего
 * сезона свой ключ.
 */

import type { RecommendationMarkStatus } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { calendarNow, promoCalendar, type CalendarRow } from './analytics/calendar.ts';
import { loadRows } from './analytics/data.ts';
import { now as clockNow } from './clock.ts';
import { analyticsSince, confidenceThresholds, type ConfidenceThresholds } from './practice-settings.ts';

export interface Mark {
  readonly status: RecommendationMarkStatus;
  readonly at: Date;
  readonly by: string | null;
}

export const MARK_LABEL: Record<RecommendationMarkStatus, string> = {
  DONE: 'сделано',
  POSTPONED: 'отложено',
};

/** Отметки рекомендаций практики по ключу. */
export async function recommendationMarks(actor: Actor): Promise<Map<string, Mark>> {
  ensure(actor, 'ANALYTICS_VIEW');
  const rows = await prisma.recommendationMark.findMany({
    select: { key: true, status: true, at: true, user: { select: { fullName: true } } },
  });
  return new Map(rows.map((row) => [row.key, { status: row.status, at: row.at, by: row.user?.fullName ?? null }]));
}

const KEY = /^[a-z]+(?::[\w.-]+){1,3}$/u;

/** Отметить рекомендацию «сделано» или «отложено»; `null` — снять отметку. */
export async function markRecommendation(
  actor: Actor,
  key: string,
  status: RecommendationMarkStatus | null,
): Promise<void> {
  ensure(actor, 'ANALYTICS_VIEW');
  if (!KEY.test(key)) throw new Error('Неизвестная рекомендация');
  if (status !== null && status !== 'DONE' && status !== 'POSTPONED') throw new Error('Неизвестная отметка');
  if (status === null) {
    await prisma.recommendationMark.deleteMany({ where: { key } });
  } else {
    await prisma.recommendationMark.upsert({
      where: { key },
      create: { key, status, userId: actor.id },
      update: { status, userId: actor.id, at: new Date() },
    });
  }
  await record(actor, {
    action: 'RECOMMENDATION_MARKED',
    objectType: 'RecommendationMark',
    objectId: key,
    payload: { status },
  });
}

/** Календарь продвижения практики с «Сейчас» и отметками. */
export async function calendarFor(
  actor: Actor,
  at: Date = clockNow(),
): Promise<{
  readonly rows: CalendarRow[];
  readonly now: CalendarRow[];
  readonly marks: Map<string, Mark>;
  readonly since: Date;
  readonly thresholds: ConfidenceThresholds;
  /** Работы без даты заказа или до начала учёта: в расчёт не вошли. */
  readonly skipped: number;
}> {
  ensure(actor, 'ANALYTICS_VIEW');
  const [data, since, thresholds, marks] = await Promise.all([
    loadRows(actor),
    analyticsSince(),
    confidenceThresholds(),
    recommendationMarks(actor),
  ]);
  const rows = promoCalendar(data, at, { since, thresholds });
  return {
    rows,
    now: calendarNow(rows, new Set(marks.keys())),
    marks,
    since,
    thresholds,
    skipped: data.filter((row) => row.startedOn === null || row.startedOn.getTime() < since.getTime()).length,
  };
}
