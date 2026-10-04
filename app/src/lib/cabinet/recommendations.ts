/**
 * Рекомендации руководителю: календарь продвижения и отметки «сделано» и
 * «отложено» (требование РК-16, решение Р-349); раздел «Рекомендации» —
 * календарь, цена и пакеты, возврат клиентов, «Рекомендация месяца» и
 * счётчик неотмеченных (требование РК-17, решение Р-350).
 *
 * Расчёт — чистый модуль `analytics/calendar.ts`; здесь — данные
 * практики, настройки (дата начала учёта, пороги уверенности) и отметки.
 * Отметка общая для практики: ключ — экземпляр рекомендации, у следующего
 * сезона свой ключ.
 */

import { cache } from 'react';

import type { RecommendationMarkStatus } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { priceAdvice, returnAdvice, type PriceAdvice, type ReturnAdvice } from './analytics/advice.ts';
import { calendarKey, calendarNow, promoCalendar, type CalendarRow } from './analytics/calendar.ts';
import { loadRows } from './analytics/data.ts';
import { leadRows, leadsForType } from './analytics/leads.ts';
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
  /** Заявки вида по месяцам — справочно (РК-18, Р-351). */
  readonly leads: Map<string, ReturnType<typeof leadsForType>>;
}> {
  ensure(actor, 'ANALYTICS_VIEW');
  const [data, since, thresholds, marks, requests] = await Promise.all([
    loadRows(actor),
    analyticsSince(),
    confidenceThresholds(),
    recommendationMarks(actor),
    leadRows(actor),
  ]);
  const rows = promoCalendar(data, at, { since, thresholds });
  const leads = new Map(rows.map((row) => [row.typeCode, leadsForType(requests, row.typeCode)]));
  return {
    rows,
    now: calendarNow(rows, new Set(marks.keys())),
    marks,
    since,
    thresholds,
    skipped: data.filter((row) => row.startedOn === null || row.startedOn.getTime() < since.getTime()).length,
    leads,
  };
}

export interface ReturnItem extends ReturnAdvice {
  /** Согласие на рассылку — из последней заявки клиента (ОР-10). */
  readonly consent: boolean;
}

export interface Recommendations {
  readonly calendar: Awaited<ReturnType<typeof calendarFor>>;
  readonly price: readonly PriceAdvice[];
  readonly returns: readonly ReturnItem[];
  readonly marks: Map<string, Mark>;
  /** Неотмеченных рекомендаций — число у пункта меню. */
  readonly unmarked: number;
  /** «Рекомендация месяца» — главная из неотмеченных. */
  readonly month: { readonly title: string; readonly href: string } | null;
}

/** Согласие на рассылку по клиентам — из последней заявки, ставшей его работой (ОР-10). */
async function consentOf(clientIds: readonly string[]): Promise<Map<string, boolean>> {
  if (clientIds.length === 0) return new Map();
  const leads = await prisma.lead.findMany({
    where: { project: { clientId: { in: [...clientIds] } } },
    orderBy: { createdAt: 'desc' },
    select: { marketingOptIn: true, project: { select: { clientId: true } } },
  });
  const out = new Map<string, boolean>();
  for (const lead of leads) {
    const clientId = lead.project?.clientId;
    if (clientId !== undefined && !out.has(clientId)) out.set(clientId, lead.marketingOptIn);
  }
  return out;
}

/** Раздел «Рекомендации»: три блока, отметки, счётчик и рекомендация месяца. */
export async function recommendationsFor(actor: Actor, at: Date = clockNow()): Promise<Recommendations> {
  ensure(actor, 'ANALYTICS_VIEW');
  const [calendar, data] = await Promise.all([calendarFor(actor, at), loadRows(actor)]);
  const marks = calendar.marks;
  const price = priceAdvice(data, calendar.rows, at);
  const silent = returnAdvice(data, at);
  const consent = await consentOf(silent.map((row) => row.clientId));
  const returns = silent.map((row) => ({ ...row, consent: consent.get(row.clientId) ?? false }));
  const open = <T extends { key: string }>(rows: readonly T[]) => rows.filter((row) => !marks.has(row.key));
  const unmarked = calendar.now.length + open(price).length + open(returns).length;
  const lead = calendar.now[0];
  const firstPrice = open(price)[0];
  const firstReturn = open(returns)[0];
  const month =
    lead !== undefined
      ? {
          title:
            lead.state === 'main'
              ? `Запустить продвижение «${lead.typeName}»: главное окно идёт`
              : `Подготовить продвижение «${lead.typeName}»`,
          href: '/cabinet/manage/recommendations/calendar',
        }
      : firstPrice !== undefined
        ? { title: `Зафиксировать цену «${firstPrice.typeName}» по медиане`, href: '/cabinet/manage/recommendations#price' }
        : firstReturn !== undefined
          ? { title: `Вернуться к клиенту: ${firstReturn.clientName}`, href: '/cabinet/manage/recommendations#returns' }
          : null;
  return { calendar, price, returns, marks, unmarked, month };
}

/**
 * Число у пункта «Рекомендации» — только руководителю, один раз на запрос.
 * Сбой выборки оставляет пункт без числа.
 */
export const headRecommendationCount = cache(async (actor: Actor): Promise<number | null> => {
  if (actor.role !== 'HEAD') return null;
  try {
    return (await recommendationsFor(actor)).unmarked;
  } catch {
    return null;
  }
});

export { calendarKey };
