/**
 * Настройки практики (требование РК-05, решение Р-337; дата начала учёта и
 * пороги уверенности — РК-16, Р-349; цель первого ответа на заявку —
 * п. 2.8 задания, Р-766; текст согласия на витрину кураторов — П-12,
 * Р-768). Первая — срок
 * реакции: через сколько рабочих дней неразобранное дело менеджера
 * поднимается руководителю контрольным (решение владельца В-18). Правит
 * руководитель в «Справочниках»; изменение пишется в журнал.
 */

import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { ANALYTICS_SINCE_DEFAULT } from './analytics/metrics.ts';
import { moscowToday } from './clock.ts';
import { SHOWCASE_TEXT_MAX, consentTextHash, normalizeConsentText, shortHash } from './curator-consents.ts';

type Db = Prisma.TransactionClient | typeof prisma;

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

/** Срок реакции из набранного: целое число рабочих дней от 1 до 10, иначе отказ. */
function reactionValue(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > REACTION_MAX) {
    throw new Error(`Срок реакции — целое число рабочих дней от 1 до ${REACTION_MAX}`);
  }
  return value;
}

/** Записать срок реакции и журнал; прежнее значение — без записи. */
async function writeReaction(actor: Actor, value: number, before: number, db: Db = prisma): Promise<void> {
  if (before === value) return;
  await db.practiceSetting.upsert({
    where: { key: REACTION_KEY },
    create: { key: REACTION_KEY, value: String(value), updatedById: actor.id },
    update: { value: String(value), updatedById: actor.id, updatedAt: new Date() },
  });
  await record(
    actor,
    {
      action: 'PRACTICE_SETTING_SAVED',
      objectType: 'PracticeSetting',
      objectId: REACTION_KEY,
      payload: { from: before, to: value },
    },
    db,
  );
}

/** Сохранить срок реакции: целое число рабочих дней от 1 до 10. */
export async function saveReactionDays(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const value = reactionValue(raw);
  await writeReaction(actor, value, await reactionDays());
}

// ───────────── Первый ответ на заявку (п. 2.8 задания, Р-766) ───────────────

const LEAD_RESPONSE_KEY = 'leadFirstResponseHours';
/**
 * Внутренняя цель первого ответа на заявку — 2 рабочих часа (10:00–19:00
 * МСК по производственному календарю, П-18, Р-784). Публичное обещание
 * «ответит в течение рабочего дня» (сайт, письмо «Заявка получена», Р-312)
 * и срок реакции не меняются: цель — строже обещания и не длиннее рабочего
 * дня.
 */
export const LEAD_RESPONSE_DEFAULT = 2;
/** Рабочий день — девять часов: цель длиннее него разошлась бы с обещанием. */
export const LEAD_RESPONSE_MAX = 9;

/** Цель первого ответа на заявку в рабочих часах. */
export async function leadFirstResponseHours(): Promise<number> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: LEAD_RESPONSE_KEY }, select: { value: true } });
  const value = Number(row?.value);
  return Number.isInteger(value) && value >= 1 && value <= LEAD_RESPONSE_MAX ? value : LEAD_RESPONSE_DEFAULT;
}

/** Цель первого ответа из набранного: целое число рабочих часов от 1 до 9, иначе отказ. */
function leadResponseValue(raw: string): number {
  const value = Number(raw.trim());
  if (raw.trim() === '' || !Number.isInteger(value) || value < 1 || value > LEAD_RESPONSE_MAX) {
    throw new Error(`Первый ответ на заявку — целое число рабочих часов от 1 до ${LEAD_RESPONSE_MAX}`);
  }
  return value;
}

/** Сохранить цель первого ответа: целое число рабочих часов от 1 до 9. */
export async function saveLeadFirstResponseHours(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const value = leadResponseValue(raw);
  await saveSetting(actor, LEAD_RESPONSE_KEY, String(value), String(await leadFirstResponseHours()));
}

/**
 * Срок реакции и цель первого ответа — одна форма «Справочников» с одной
 * кнопкой (Р-715), и сохраняются они вместе (решение владельца к Р-766):
 * оба значения проверяются до записи, обе записи с журналом — одной
 * транзакцией. Ошибка в любом поле не записывает ничего: прежде срок
 * реакции успевал сохраниться, а неверная цель отклонялась, и форма
 * сообщала об отказе, уже изменив одну настройку.
 */
export async function saveResponseTerms(actor: Actor, rawDays: string, rawHours: string): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const days = reactionValue(rawDays);
  const hours = leadResponseValue(rawHours);
  const [daysBefore, hoursBefore] = await Promise.all([reactionDays(), leadFirstResponseHours()]);
  await prisma.$transaction(async (tx) => {
    await writeReaction(actor, days, daysBefore, tx);
    await saveSetting(actor, LEAD_RESPONSE_KEY, String(hours), String(hoursBefore), tx);
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

async function saveSetting(actor: Actor, key: string, value: string, before: string, db: Db = prisma): Promise<void> {
  if (before === value) return;
  await db.practiceSetting.upsert({
    where: { key },
    create: { key, value, updatedById: actor.id },
    update: { value, updatedById: actor.id, updatedAt: new Date() },
  });
  await record(
    actor,
    {
      action: 'PRACTICE_SETTING_SAVED',
      objectType: 'PracticeSetting',
      objectId: key,
      payload: { from: before, to: value },
    },
    db,
  );
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

// ───────────── Текст согласия на витрину кураторов (П-12, Р-768) ────────────

const SHOWCASE_TEXT_KEY = 'showcaseConsentText';

/**
 * Текст согласия куратора на распространение для витрины кураторов на
 * сайте (ст. 10.1 152-ФЗ). Вносит руководитель, текст согласует юрист;
 * пустой — отметки витрины у куратора нет и сервер её не принимает.
 */
export async function showcaseConsentText(): Promise<string> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: SHOWCASE_TEXT_KEY }, select: { value: true } });
  return normalizeConsentText(row?.value ?? '');
}

/**
 * Сохранить текст согласия на витрину. Пустой текст убирает отметку из
 * «Настроек» куратора. Прежние согласия не снимаются, но после смены
 * текста считаются данными на прежний текст (`showcaseConsentValid`). В
 * журнал — свёртки прежнего и нового текста и сам новый текст: по
 * свёртке в профиле куратора видно, на какой текст он согласился.
 */
export async function saveShowcaseConsentText(actor: Actor, raw: string): Promise<void> {
  ensure(actor, 'USER_MANAGE');
  const text = normalizeConsentText(raw);
  if (text.length > SHOWCASE_TEXT_MAX) {
    throw new Error(`Текст согласия на витрину — не длиннее ${SHOWCASE_TEXT_MAX} знаков`);
  }
  const before = await showcaseConsentText();
  if (before === text) return;
  await prisma.practiceSetting.upsert({
    where: { key: SHOWCASE_TEXT_KEY },
    create: { key: SHOWCASE_TEXT_KEY, value: text, updatedById: actor.id },
    update: { value: text, updatedById: actor.id, updatedAt: new Date() },
  });
  await record(actor, {
    action: 'SHOWCASE_CONSENT_TEXT_SAVED',
    objectType: 'PracticeSetting',
    objectId: SHOWCASE_TEXT_KEY,
    payload: {
      from: before === '' ? null : shortHash(consentTextHash(before)),
      to: text === '' ? null : shortHash(consentTextHash(text)),
      chars: text.length,
      text,
    },
  });
}
