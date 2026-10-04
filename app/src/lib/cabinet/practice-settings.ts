/**
 * Настройки практики (требование РК-05, решение Р-337). Первая — срок
 * реакции: через сколько рабочих дней неразобранное дело менеджера
 * поднимается руководителю контрольным (решение владельца В-18). Правит
 * руководитель в «Справочниках»; изменение пишется в журнал.
 */

import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';

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
