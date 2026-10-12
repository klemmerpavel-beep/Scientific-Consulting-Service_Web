/**
 * Шаблоны документов практики, загруженные руководителем: договор,
 * техническое задание, памятки (задание владельца 12.10.2026, решение
 * Р-561).
 *
 * Свои шаблоны практики в открытый репозиторий не кладутся: руководитель
 * загружает их в кабинете, и они лежат в хранилище рядом с материалами.
 * Адресат — команда или все, включая клиентов. Загрузка с тем же
 * названием заменяет файл: прежний объект удаляется, строка остаётся.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { prisma } from '../db.ts';
import { can, ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { fileRefusal } from './file-guard.ts';
import { sha256, storage } from './storage.ts';

export type TemplateAudience = 'STAFF' | 'ALL';

export const AUDIENCE_LABEL: Readonly<Record<TemplateAudience, string>> = {
  STAFF: 'команде',
  ALL: 'всем, включая клиентов',
};

/** Предел файла шаблона: документ Word или таблица, не архив материалов. */
export const TEMPLATE_MAX_BYTES = 25 * 1024 * 1024;

export class TemplateError extends Error {}

/** Видит ли смотрящий шаблон этого адресата. */
export function templateVisible(actor: Actor, audience: TemplateAudience): boolean {
  if (actor.status !== 'ACTIVE') return false;
  return audience === 'ALL' || can(actor, 'CHECKLIST_VIEW');
}

/** Шаблоны практики, видимые смотрящему. */
export async function ownerTemplates(actor: Actor) {
  if (actor.status !== 'ACTIVE') return [];
  const where = can(actor, 'CHECKLIST_VIEW') ? { deletedAt: null } : { deletedAt: null, audience: 'ALL' as const };
  return prisma.documentTemplate.findMany({
    where,
    orderBy: [{ title: 'asc' }],
    select: { id: true, title: true, note: true, audience: true, originalName: true, sizeBytes: true, updatedAt: true },
  });
}

/** Загрузить или заменить шаблон (по названию). Только руководитель. */
export async function saveOwnerTemplate(
  actor: Actor,
  input: { title: string; note: string; audience: string; originalName: string; contentType: string; body: Buffer },
  ip: string | null = null,
): Promise<{ id: string; replaced: boolean }> {
  ensure(actor, 'DIRECTORY_EDIT');
  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (title.length < 2 || title.length > 120) throw new TemplateError('Название шаблона — от 2 до 120 знаков.');
  const note = input.note.replace(/\s+/gu, ' ').trim().slice(0, 300) || null;
  const audience: TemplateAudience = input.audience === 'ALL' ? 'ALL' : 'STAFF';
  if (input.body.byteLength === 0) throw new TemplateError('Файл пуст.');
  if (input.body.byteLength > TEMPLATE_MAX_BYTES) throw new TemplateError('Файл больше 25 МБ.');
  const refusal = fileRefusal(input.originalName, input.body);
  if (refusal !== null) throw new TemplateError(refusal);

  const ext = path.extname(input.originalName).toLowerCase().slice(0, 10);
  const key = `templates/${randomUUID()}${/^\.[a-z0-9]+$/u.test(ext) ? ext : ''}`;
  await storage().put(key, input.body, input.contentType || 'application/octet-stream');
  const existing = await prisma.documentTemplate.findFirst({ where: { title, deletedAt: null }, select: { id: true, storageKey: true } });
  const data = {
    title,
    note,
    audience,
    storageKey: key,
    originalName: input.originalName.slice(0, 200),
    contentType: input.contentType || 'application/octet-stream',
    sizeBytes: BigInt(input.body.byteLength),
    sha256: sha256(input.body),
    uploadedById: actor.id,
  };
  let saved: { id: string };
  try {
    saved = existing === null
      ? await prisma.documentTemplate.create({ data, select: { id: true } })
      : await prisma.documentTemplate.update({ where: { id: existing.id }, data, select: { id: true } });
  } catch (error) {
    await storage().remove(key).catch(() => undefined);
    throw error;
  }
  if (existing !== null) await storage().remove(existing.storageKey).catch(() => undefined);
  await record(actor, {
    action: existing === null ? 'TEMPLATE_UPLOADED' : 'TEMPLATE_REPLACED',
    objectType: 'DocumentTemplate',
    objectId: saved.id,
    payload: { title, audience },
    ip,
  });
  return { id: saved.id, replaced: existing !== null };
}

/** Убрать шаблон: строка помечается, объект удаляется. Только руководитель. */
export async function removeOwnerTemplate(actor: Actor, id: string, ip: string | null = null): Promise<void> {
  ensure(actor, 'DIRECTORY_EDIT');
  const row = await prisma.documentTemplate.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true, storageKey: true } });
  if (row === null) throw new TemplateError('Шаблон не найден: обновите страницу.');
  await prisma.documentTemplate.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  await storage().remove(row.storageKey).catch(() => undefined);
  await record(actor, { action: 'TEMPLATE_REMOVED', objectType: 'DocumentTemplate', objectId: row.id, payload: { title: row.title }, ip });
}

/** Файл шаблона для выдачи; не положен или убран — `null`. */
export async function ownerTemplateFile(
  actor: Actor,
  id: string,
): Promise<{ file: string; ascii: string; type: string; bytes: Buffer } | null> {
  const row = await prisma.documentTemplate.findFirst({
    where: { id, deletedAt: null },
    select: { title: true, audience: true, storageKey: true, originalName: true, contentType: true },
  });
  // Шаблон команды — по праву на чек-листы, шаблон для всех — любой
  // действующей записи.
  if (row === null || actor.status !== 'ACTIVE' || (row.audience === 'STAFF' && !can(actor, 'CHECKLIST_VIEW'))) return null;
  const bytes = await storage().get(row.storageKey);
  const ext = path.extname(row.originalName).toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]+$/u.test(ext) ? ext : '';
  // Имя файла — название шаблона: так его назвал руководитель. Знаки,
  // недопустимые в именах файлов, заменяются пробелом.
  const name = row.title.replace(/[\\/:*?"<>|]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return { file: `${name}${safeExt}`, ascii: `shablon-${id}${safeExt}`, type: row.contentType, bytes };
}
