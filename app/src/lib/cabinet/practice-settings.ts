/**
 * Настройки практики (требование РК-05, решение Р-337; дата начала учёта и
 * пороги уверенности — РК-16, Р-349). Первая — срок
 * реакции: через сколько рабочих дней неразобранное дело менеджера
 * поднимается руководителю контрольным (решение владельца В-18). Правит
 * руководитель в «Справочниках»; изменение пишется в журнал.
 */

import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { ANALYTICS_SINCE_DEFAULT } from './analytics/metrics.ts';
import { moscowToday } from './clock.ts';

const REACTION_KEY = 'reactionDays';
/** По умолчанию — один рабочий день (В-18). */
export const REACTION_DEFAULT = 1;
export const REACTION_MAX = 10;

/** Срок реакции в рабочих днях. */
export async function reactionDays(): Promise<number> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: REACTION_KEY }, select: { value: true } });
  const value = Number(row?.value);
  return Number.isInteger(value) && value >= 1 && value <= REACTION_MAX ? value : REACTION_DEFAULT;
}

/** Сохранить срок реакции: целое число рабочих дней от 1 до 10. */
export async function saveReactionDays(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > REACTION_MAX) {
    throw new Error(`Срок реакции — целое число рабочих дней от 1 до ${REACTION_MAX}`);
  }
  const before = await reactionDays();
  if (before === value) return;
  await prisma.practiceSetting.upsert({
    where: { key: REACTION_KEY },
    create: { key: REACTION_KEY, value: String(value), updatedById: actor.id },
    update: { value: String(value), updatedById: actor.id, updatedAt: new Date() },
  });
  await record(actor, {
    action: 'PRACTICE_SETTING_SAVED',
    objectType: 'PracticeSetting',
    objectId: REACTION_KEY,
    payload: { from: before, to: value },
  });
}

// ───────────── Дата начала учёта и пороги уверенности (РК-16, Р-349) ────────

const SINCE_KEY = 'analyticsSince';
const THRESHOLDS_KEY = 'confidenceThresholds';

/** Пороги уверенности по числу наблюдений: «уверенно», «вероятно», «предположительно» (ДР-5). */
export interface ConfidenceThresholds {
  readonly sure: number;
  readonly likely: number;
  readonly maybe: number;
}

export const THRESHOLDS_DEFAULT: ConfidenceThresholds = { sure: 20, likely: 10, maybe: 5 };

function parseDay(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw.trim());
  if (match === null) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === raw.trim() ? date : null;
}

/** Дата начала учёта сезонной нормы и календаря продвижения. */
export async function analyticsSince(): Promise<Date> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: SINCE_KEY }, select: { value: true } });
  return (row === null ? null : parseDay(row.value)) ?? ANALYTICS_SINCE_DEFAULT;
}

function parseThresholds(raw: string): ConfidenceThresholds | null {
  const parts = raw.split(/[\s,;]+/u).filter((part) => part !== '').map(Number);
  if (parts.length !== 3 || !parts.every((value) => Number.isInteger(value) && value >= 1 && value <= 1000)) return null;
  const [sure, likely, maybe] = parts as [number, number, number];
  return sure > likely && likely > maybe ? { sure, likely, maybe } : null;
}

/** Пороги уверенности календаря продвижения. */
export async function confidenceThresholds(): Promise<ConfidenceThresholds> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: THRESHOLDS_KEY }, select: { value: true } });
  return (row === null ? null : parseThresholds(row.value)) ?? THRESHOLDS_DEFAULT;
}

async function saveSetting(actor: Actor, key: string, value: string, before: string): Promise<void> {
  if (before === value) return;
  await prisma.practiceSetting.upsert({
    where: { key },
    create: { key, value, updatedById: actor.id },
    update: { value, updatedById: actor.id, updatedAt: new Date() },
  });
  await record(actor, {
    action: 'PRACTICE_SETTING_SAVED',
    objectType: 'PracticeSetting',
    objectId: key,
    payload: { from: before, to: value },
  });
}

/** Сохранить дату начала учёта: день не раньше 2000 года и не позже сегодняшнего. */
export async function saveAnalyticsSince(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const date = parseDay(raw);
  if (date === null || date.getUTCFullYear() < 2000 || date.getTime() > moscowToday().getTime()) {
    throw new Error('Дата начала учёта — день не раньше 2000 года и не позже сегодняшнего');
  }
  const before = (await analyticsSince()).toISOString().slice(0, 10);
  await saveSetting(actor, SINCE_KEY, date.toISOString().slice(0, 10), before);
}

/** Сохранить пороги уверенности: три убывающих целых числа, например «20, 10, 5». */
export async function saveConfidenceThresholds(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const value = parseThresholds(raw);
  if (value === null) {
    throw new Error('Пороги уверенности — три убывающих целых числа наблюдений, например «20, 10, 5»');
  }
  const current = await confidenceThresholds();
  await saveSetting(
    actor,
    THRESHOLDS_KEY,
    `${value.sure},${value.likely},${value.maybe}`,
    `${current.sure},${current.likely},${current.maybe}`,
  );
}
