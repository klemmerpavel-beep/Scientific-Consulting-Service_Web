/**
 * Одноразовый ключ формы — занять, освободить, выполнить один раз
 * (решение Р-934). Часть без базы — `form-key.ts`.
 */

import { prisma } from '../db.ts';
import { FORM_KEY_TTL_MS, FORM_REPLAY, formKeyOf } from './form-key.ts';

/** Занять ключ. Занятый — отказ словами для человека. */
export async function claimFormKey(userId: string, key: string, at: Date = new Date()): Promise<void> {
  try {
    await prisma.formKey.create({ data: { key, userId } });
  } catch (error) {
    // Обычный `Error`: его текст действие показывает человеку как есть.
    if ((error as { code?: unknown } | null)?.code === 'P2002') throw new Error(FORM_REPLAY);
    throw error;
  }
  // Уборка просроченных ключей — попутно; её сбой записи не мешает.
  await prisma.formKey
    .deleteMany({ where: { createdAt: { lt: new Date(at.getTime() - FORM_KEY_TTL_MS) } } })
    .catch(() => undefined);
}

/** Освободить ключ: запись не состоялась, форму можно отправить снова. */
export async function releaseFormKey(key: string): Promise<void> {
  await prisma.formKey.deleteMany({ where: { key } });
}

/**
 * Выполнить запись один раз на ключ формы. Отказ записи освобождает ключ:
 * исправленную форму отправляют снова, и «уже отправлена» она не получает.
 */
export async function once<T>(userId: string, rawKey: unknown, run: () => Promise<T>): Promise<T> {
  const key = formKeyOf(rawKey);
  if (key === null) return run();
  await claimFormKey(userId, key);
  try {
    return await run();
  } catch (error) {
    await releaseFormKey(key).catch(() => undefined);
    throw error;
  }
}
