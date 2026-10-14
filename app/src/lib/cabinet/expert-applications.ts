import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { prisma } from '../db.ts';
import { mskMoment } from '../disk/table.ts';
import { table, type Table } from '../disk/sheet.ts';
import {
  EXPERT_CONSENT_VERSION,
  EXPERT_STATUS_LABEL,
  ExpertInputError,
  type ExpertApplicationInput,
  type ExpertFile,
  type ExpertStatus,
} from '../expert-application.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { fileRefusal } from './file-guard.ts';
import { openObject, sha256, storage, type OpenedObject } from './storage.ts';

/**
 * Анкеты экспертов (замечание владельца 13.10.2026, решение Р-580):
 * запись анкеты с сайта, разбор, файлы, удаление, таблица. Разделы
 * профессиональной анкеты — решение Р-584.
 *
 * Разбирает анкеты руководитель (`EXPERT_APPLICATION_REVIEW`): он решает,
 * кого звать в кураторы, и заводит учётную запись сам. Анкета учётной
 * записи не создаёт.
 */

const PAGE_SIZE = 50;
const NOTE_MAX = 4000;
export const EXPERT_STATUSES: readonly ExpertStatus[] = ['NEW', 'REVIEW', 'INVITED', 'DECLINED'];

/** Ключ файла анкеты: случайный, без исходного имени — в нём бывает фамилия. */
export function expertFileKey(applicationId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]+$/u.test(ext) ? ext : '';
  return `experts/${applicationId}/${randomUUID()}${safeExt}`;
}

/**
 * Запись анкеты с сайта. Файлы ложатся после анкеты — ключ строится от её
 * идентификатора. Сбой на любом файле отменяет всю анкету: без резюме она
 * неполна, и человек должен узнать об этом и отправить ещё раз, а не
 * думать, что всё дошло.
 */
export async function createExpertApplication(
  input: ExpertApplicationInput,
  files: readonly ExpertFile[],
): Promise<{ id: string }> {
  for (const file of files) {
    const refusal = fileRefusal(file.originalName, file.body);
    if (refusal !== null) throw new ExpertInputError(refusal.replace('напишите менеджеру', 'пришлите его ссылкой в анкете'));
  }
  const application = await prisma.expertApplication.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      degree: input.degree,
      speciality: input.speciality ?? null,
      fields: input.fields,
      experience: input.experience,
      links: input.links ?? null,
      academicTitle: input.academicTitle ?? null,
      workplace: input.workplace ?? null,
      seniority: input.seniority ?? null,
      services: [...input.services],
      roles: [...input.roles],
      elibrarySpin: input.elibrarySpin ?? null,
      orcid: input.orcid ?? null,
      weeklyHours: input.weeklyHours ?? null,
      consentVersion: EXPERT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  const stored: string[] = [];
  try {
    for (const file of files) {
      const key = expertFileKey(application.id, file.originalName);
      await storage().put(key, file.body, file.contentType);
      stored.push(key);
      await prisma.expertApplicationFile.create({
        data: {
          applicationId: application.id,
          storageKey: key,
          originalName: file.originalName,
          sizeBytes: BigInt(file.body.byteLength),
          sha256: sha256(file.body),
          contentType: file.contentType,
        },
      });
    }
  } catch (error) {
    for (const key of stored) await storage().remove(key).catch(() => undefined);
    await prisma.expertApplication.delete({ where: { id: application.id } }).catch(() => undefined);
    throw error;
  }
  return application;
}

export interface ExpertListRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly fullName: string;
  readonly degree: string;
  readonly speciality: string | null;
  readonly status: ExpertStatus;
  readonly files: number;
}

const isStatus = (value: unknown): value is ExpertStatus => EXPERT_STATUSES.includes(value as ExpertStatus);

/** Перечень анкет: свежие сверху, отбор по состоянию, по 50 на страницу. */
export async function expertApplications(
  actor: Actor,
  options: { status?: string; page?: number } = {},
): Promise<{ rows: ExpertListRow[]; total: number; page: number; pages: number; counts: Record<ExpertStatus, number> }> {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  const where = isStatus(options.status) ? { status: options.status } : {};
  const [total, grouped] = await Promise.all([
    prisma.expertApplication.count({ where }),
    prisma.expertApplication.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(options.page ?? 1) || 1), pages);
  const rows = await prisma.expertApplication.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      fullName: true,
      degree: true,
      speciality: true,
      status: true,
      _count: { select: { files: true } },
    },
  });
  const counts = Object.fromEntries(EXPERT_STATUSES.map((status) => [status, 0])) as Record<ExpertStatus, number>;
  for (const row of grouped) counts[row.status] = row._count._all;
  return {
    rows: rows.map((row) => ({ ...row, files: row._count.files })),
    total,
    page,
    pages,
    counts,
  };
}

/** Анкета целиком — для экрана разбора. `null` — нет такой. */
export async function expertApplication(actor: Actor, id: string) {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  return prisma.expertApplication.findUnique({
    where: { id },
    include: { files: { orderBy: { uploadedAt: 'asc' }, select: { id: true, originalName: true, sizeBytes: true, contentType: true } } },
  });
}

/**
 * Разбор: состояние и пометка. В журнал — смена состояния и есть ли
 * пометка, но не её текст: журнал отвечает «кто и когда», а не «что».
 */
export async function reviewExpertApplication(
  actor: Actor,
  id: string,
  input: { status: string; note: string },
): Promise<void> {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  if (!isStatus(input.status)) throw new Error('Выберите состояние из перечня');
  const note = input.note.replace(/\u0000/gu, '').trim();
  if (note.length > NOTE_MAX) throw new Error(`Пометка длиннее ${NOTE_MAX} знаков — сократите`);
  const current = await prisma.expertApplication.findUnique({ where: { id }, select: { status: true, note: true } });
  if (current === null) throw new Error('Анкета не найдена');
  const nextNote = note.length === 0 ? null : note;
  if (current.status === input.status && current.note === nextNote) return;
  await prisma.expertApplication.update({
    where: { id },
    data: {
      status: input.status,
      note: nextNote,
      ...(current.status === input.status ? {} : { statusChangedAt: new Date() }),
    },
  });
  await record(actor, {
    action: 'EXPERT_APPLICATION_REVIEWED',
    objectType: 'ExpertApplication',
    objectId: id,
    payload: { status: { from: current.status, to: input.status }, note: nextNote !== null },
  });
}

/**
 * Удаление анкеты с файлами — по просьбе человека (ст. 21 152-ФЗ) или когда
 * она больше не нужна. В журнал — факт удаления и число файлов, без имени.
 */
export async function deleteExpertApplication(actor: Actor, id: string): Promise<void> {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  const row = await prisma.expertApplication.findUnique({
    where: { id },
    select: { id: true, files: { select: { storageKey: true } } },
  });
  if (row === null) throw new Error('Анкета не найдена');
  for (const file of row.files) await storage().remove(file.storageKey);
  await prisma.expertApplication.delete({ where: { id } });
  await record(actor, {
    action: 'EXPERT_APPLICATION_DELETED',
    objectType: 'ExpertApplication',
    objectId: id,
    payload: { files: row.files.length },
  });
}

/**
 * Файл анкеты на выдачу. Отказ в праве и отсутствие файла для маршрута
 * неразличимы; каждая выдача — в журнал.
 */
export async function openExpertFile(
  actor: Actor,
  fileId: string,
  ip: string | null,
): Promise<(OpenedObject & { contentType: string; fileName: string }) | null> {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  const file = await prisma.expertApplicationFile.findUnique({
    where: { id: fileId },
    select: { id: true, applicationId: true, storageKey: true, originalName: true, contentType: true },
  });
  if (file === null) return null;
  let opened: OpenedObject;
  try {
    opened = await openObject(storage(), file.storageKey);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'ENOENT') return null;
    throw error;
  }
  await record(actor, {
    action: 'EXPERT_FILE_DOWNLOADED',
    objectType: 'ExpertApplication',
    objectId: file.applicationId,
    payload: { file: file.id },
    ip,
  });
  return { ...opened, contentType: file.contentType, fileName: file.originalName };
}

/**
 * Таблица анкет — книга Excel для выгрузки с экрана и для зеркала на Диске
 * (Р-580). Файлы в таблицу не входят: только их число.
 */
export async function expertsTable(): Promise<Table> {
  const rows = await prisma.expertApplication.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { _count: { select: { files: true } } },
  });
  return table(
    'Анкеты кандидатов.xlsx',
    'kandidaty.csv',
    ['Дата (МСК)', 'Имя', 'Почта', 'Телефон', 'Учёная степень', 'Учёное звание', 'Специальность',
     'Место работы', 'Стаж', 'Виды работ', 'Сфера', 'Отметки опыта', 'Опыт', 'SPIN-код', 'ORCID', 'Ссылки',
     'Загрузка', 'Файлов', 'Состояние', 'Пометка', 'Согласие', 'Идентификатор'],
    rows.map((row) => [
      mskMoment(row.createdAt), row.fullName, row.email, row.phone ?? '', row.degree, row.academicTitle ?? '',
      row.speciality ?? '', row.workplace ?? '', row.seniority ?? '', row.services.join('; '), row.fields,
      row.roles.join('; '), row.experience, row.elibrarySpin ?? '', row.orcid ?? '', row.links ?? '',
      row.weeklyHours ?? '', row._count.files, EXPERT_STATUS_LABEL[row.status], row.note ?? '',
      row.consentVersion, row.id,
    ]),
  );
}

/** Выгрузка таблицы с экрана руководителя — с записью в журнал числом строк. */
export async function expertsWorkbook(actor: Actor, ip: string | null): Promise<Table> {
  ensure(actor, 'EXPERT_APPLICATION_REVIEW');
  const book = await expertsTable();
  await record(actor, { action: 'EXPERT_APPLICATIONS_EXPORTED', objectType: 'ExpertApplication', payload: { rows: book.rows }, ip });
  return book;
}
