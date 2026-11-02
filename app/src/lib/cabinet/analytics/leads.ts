/**
 * Заявки в аналитике (требование РК-18, решение Р-351).
 *
 * Аналитика считала только работы и не видела, откуда приходят заказы.
 * Здесь — заявки по месяцам и по страницам сайта (`Lead.source`) и
 * конверсия «заявка → заказ» (заявка, развёрнутая в работу,
 * `Lead.projectId`). Спам и отзывы не входят: это не обращения за работой.
 * Вид заявки сводится к справочнику видов работ по полю направления формы;
 * заявки без направления — «без вида».
 */

import { prisma } from '../../db.ts';
import { ensure, type Actor } from '../access.ts';
import { loadCalendar } from '../approval.ts';
import { moscowToday } from '../clock.ts';
import { confidenceThresholds, leadFirstResponseHours } from '../practice-settings.ts';
import { responseSpeed, type ResponseSpeed } from './response.ts';

export interface LeadRow {
  readonly createdAt: Date;
  readonly source: string;
  readonly direction: string | null;
  readonly converted: boolean;
  /** Первый ответ — первая смена состояния из «Новой» (п. 2.8, Р-766). */
  readonly firstResponseAt?: Date | null;
  /** «Новая» без первого ответа — ждёт его сейчас (Р-766). */
  readonly waiting?: boolean;
}

/** Направление формы сайта → коды видов работ справочника. */
export const DIRECTION_TYPES: Readonly<Record<string, readonly string[]>> = {
  'Научная степень': ['dissertation', 'postgrad'],
  'Диплом и научная статья': ['diploma', 'article'],
  'НИОКР, патенты и гранты': ['research', 'consulting'],
};

/** Заявки практики без спама и отзывов. Только тем, кому открыта аналитика. */
export async function leadRows(actor: Actor): Promise<LeadRow[]> {
  ensure(actor, 'ANALYTICS_VIEW');
  const rows = await prisma.lead.findMany({
    where: { status: { not: 'SPAM' }, form: { not: 'review' } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, source: true, direction: true, projectId: true, status: true, firstResponseAt: true },
  });
  return rows.map((row) => ({
    createdAt: row.createdAt,
    source: row.source,
    direction: row.direction,
    converted: row.projectId !== null,
    firstResponseAt: row.firstResponseAt,
    waiting: row.status === 'NEW' && row.firstResponseAt === null && row.projectId === null,
  }));
}

/**
 * Скорость первого ответа за 90 дней по заявкам практики — для обзора
 * «Аналитики» и «Что делать» отчёта (п. 2.8 задания, Р-766). Цель,
 * календарь и порог «уверенно» (общий для выводов, «Справочники», Р-349) —
 * настройки практики.
 */
export async function leadResponse(actor: Actor, controlDate: Date, rows?: readonly LeadRow[]): Promise<ResponseSpeed> {
  const [leads, calendar, target, thresholds] = await Promise.all([
    rows === undefined ? leadRows(actor) : Promise.resolve(rows),
    loadCalendar(),
    leadFirstResponseHours(),
    confidenceThresholds(),
  ]);
  return responseSpeed(leads, controlDate, target, calendar, thresholds.sure);
}

export interface LeadMonth {
  readonly key: string;
  readonly year: number;
  readonly month: number;
  readonly leads: number;
  readonly converted: number;
}

export interface LeadSource {
  readonly source: string;
  readonly leads: number;
  readonly converted: number;
  /** Доля заявок, ставших заказом; `null` — заявок нет. */
  readonly conversion: number | null;
}

const keyOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** Заявки по месяцам — двенадцать месяцев по текущий, по московскому дню. */
export function leadsByMonth(rows: readonly LeadRow[], controlDate: Date): LeadMonth[] {
  const today = moscowToday(controlDate);
  const months = Array.from({ length: 12 }, (_, index) => {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + index, 1));
    return { key: keyOf(first), year: first.getUTCFullYear(), month: first.getUTCMonth() + 1, leads: 0, converted: 0 };
  });
  for (const row of rows) {
    const target = months.find((month) => month.key === keyOf(moscowToday(row.createdAt)));
    if (target === undefined) continue;
    target.leads += 1;
    if (row.converted) target.converted += 1;
  }
  return months;
}

/** Заявки по страницам сайта: число, ставшие заказом, конверсия; крупные сверху. */
export function leadsBySource(rows: readonly LeadRow[]): LeadSource[] {
  const map = new Map<string, { leads: number; converted: number }>();
  for (const row of rows) {
    const cell = map.get(row.source) ?? { leads: 0, converted: 0 };
    cell.leads += 1;
    if (row.converted) cell.converted += 1;
    map.set(row.source, cell);
  }
  return [...map.entries()]
    .map(([source, cell]) => ({ source, ...cell, conversion: cell.leads === 0 ? null : cell.converted / cell.leads }))
    .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
}

/** Конверсия «заявка → заказ» по всем заявкам. */
export function leadConversion(rows: readonly LeadRow[]): { leads: number; converted: number; conversion: number | null } {
  const converted = rows.filter((row) => row.converted).length;
  return { leads: rows.length, converted, conversion: rows.length === 0 ? null : converted / rows.length };
}

/**
 * Заявки вида по месяцам — справочно для «На чём основано» календаря:
 * по направлению формы, к которому относится вид; и сколько заявок без
 * направления.
 */
export function leadsForType(
  rows: readonly LeadRow[],
  typeCode: string,
): { direction: string | null; byMonth: number[]; undirected: number } {
  const direction = Object.entries(DIRECTION_TYPES).find(([, codes]) => codes.includes(typeCode))?.[0] ?? null;
  const byMonth = Array.from({ length: 12 }, () => 0);
  if (direction !== null) {
    for (const row of rows) {
      if (row.direction === direction) byMonth[moscowToday(row.createdAt).getUTCMonth()]! += 1;
    }
  }
  return { direction, byMonth, undirected: rows.filter((row) => row.direction === null || !(row.direction in DIRECTION_TYPES)).length };
}
