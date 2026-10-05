import { randomUUID } from 'node:crypto';

import { prisma } from '../db.ts';
import { feedbackTable } from '../disk/registry.ts';
import type { Table } from '../disk/sheet.ts';
import {
  CLOSED_STATUSES,
  FeedbackInputError,
  NOTE_MAX,
  SCREENSHOT_BAD_TYPE,
  SCREENSHOT_IN_CABINET,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TOO_BIG,
  isSeverity,
  isStatus,
  prepareFeedback,
  sniffImage,
  type FeedbackSeverity,
  type FeedbackStatus,
} from '../feedback.ts';
import { EXPORT_LIMIT, type ExportService } from '../feedback-export.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { openObject, storage, type OpenedObject } from './storage.ts';

export { FeedbackInputError };

/**
 * Замечания с виджета: приём, разбор и выгрузка (решение Р-403).
 *
 * Приём открыт всем — кнопка стоит на каждой странице сайта и на каждом
 * экране кабинета, — и потому не знает, кто пишет: действующее лицо сюда
 * не передаётся вовсе. Разбор и выгрузка — только у руководителя, право
 * `FEEDBACK_REVIEW`.
 */

export const FEEDBACK_PAGE_SIZE = 50;

export interface FeedbackSubmission {
  readonly text: unknown;
  readonly path: unknown;
  readonly width: unknown;
  /** Байты снимка; `null` или пустой — снимка нет. */
  readonly screenshot: Uint8Array | null;
}

/**
 * Записать замечание. Снимок кладётся в хранилище раньше строки: строка,
 * которая ссылается на несуществующий объект, хуже объекта без строки. Если
 * строка не записалась — объект убирается.
 */
export async function createFeedback(input: FeedbackSubmission): Promise<{ id: string }> {
  const prepared = prepareFeedback(input);
  if (!prepared.ok) throw new FeedbackInputError(prepared.error);
  const value = prepared.value;

  const shot = input.screenshot !== null && input.screenshot.byteLength > 0 ? input.screenshot : null;
  let stored: { key: string; type: string; size: number } | null = null;
  if (shot !== null) {
    // На экранах кабинета — имена, суммы, темы работ: снимок оттуда был бы
    // персональными данными, которые виджет обещал не собирать. Поле на
    // экранах кабинета не показывается, но присланное в обход отвергается
    // здесь (решение Р-403).
    if (value.area === 'CABINET') throw new FeedbackInputError(SCREENSHOT_IN_CABINET);
    if (shot.byteLength > SCREENSHOT_MAX_BYTES) throw new FeedbackInputError(SCREENSHOT_TOO_BIG, 413);
    const kind = sniffImage(shot);
    if (kind === null) throw new FeedbackInputError(SCREENSHOT_BAD_TYPE);
    // Имя файла не сохраняется: его задаёт человек, и в нём бывает фамилия.
    const key = `feedback/${randomUUID()}.${kind.ext}`;
    await storage().put(key, Buffer.from(shot), kind.type);
    stored = { key, type: kind.type, size: shot.byteLength };
  }

  try {
    const saved = await prisma.feedback.create({
      data: {
        area: value.area,
        pathTemplate: value.pathTemplate,
        text: value.text,
        device: value.device,
        viewportWidth: value.viewportWidth,
        screenshotKey: stored?.key ?? null,
        screenshotType: stored?.type ?? null,
        screenshotSize: stored?.size ?? null,
        severityAuto: value.severityAuto,
        severity: value.severityAuto,
      },
      select: { id: true },
    });
    return saved;
  } catch (error) {
    if (stored !== null) await storage().remove(stored.key).catch(() => undefined);
    throw error;
  }
}

// ───────────────────────────── Разбор ────────────────────────────────────

export interface FeedbackFilter {
  readonly status?: string;
  readonly severity?: string;
  readonly page?: number;
}

/** Перечень замечаний для разбора: свежие сверху, по пятьдесят на страницу. */
export async function feedbackList(actor: Actor, filter: FeedbackFilter = {}) {
  ensure(actor, 'FEEDBACK_REVIEW');
  // Неизвестное значение отбора — «любое», а не ошибка базы (как Р-245).
  const where = {
    ...(isStatus(filter.status) ? { status: filter.status } : {}),
    ...(isSeverity(filter.severity) ? { severity: filter.severity } : {}),
  };
  const total = await prisma.feedback.count({ where });
  const pages = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pages);
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * FEEDBACK_PAGE_SIZE,
    take: FEEDBACK_PAGE_SIZE,
  });
  return { rows, total, page, pages };
}

/** Величины для плиток экрана разбора. */
export async function feedbackDigest(actor: Actor) {
  ensure(actor, 'FEEDBACK_REVIEW');
  const open = { status: { in: ['NEW', 'IN_WORK'] as FeedbackStatus[] } };
  const [fresh, inWork, criticalOpen, total] = await Promise.all([
    prisma.feedback.count({ where: { status: 'NEW' } }),
    prisma.feedback.count({ where: { status: 'IN_WORK' } }),
    prisma.feedback.count({ where: { ...open, severity: 'CRITICAL' } }),
    prisma.feedback.count(),
  ]);
  return { fresh, inWork, criticalOpen, total };
}

export interface FeedbackReview {
  readonly severity: string;
  readonly status: string;
  readonly note: string;
}

/**
 * Разбор замечания: критичность, состояние и что сделано. Момент закрытия
 * ставится при переходе в «исправлено» или «отклонено» и снимается при
 * возврате в работу — иначе в таблице на Диске стояла бы дата закрытия у
 * открытого замечания.
 *
 * В журнал идут состояние и критичность, но не текст замечания и не текст
 * разбора: журнал отвечает на вопрос «кто и когда разобрал», а не «что
 * написали».
 */
export async function reviewFeedback(actor: Actor, id: string, input: FeedbackReview): Promise<void> {
  ensure(actor, 'FEEDBACK_REVIEW');
  await applyReview(actor, id, input);
}

/**
 * Разбор без проверки права: его делают `reviewFeedback` (право
 * руководителя) и `feedbackExportService` (ключ выгрузки, Р-405). Во втором
 * случае действующего лица нет, и в журнал пишется пометка «по ключу».
 */
async function applyReview(actor: Actor | null, id: string, input: FeedbackReview): Promise<void> {
  if (!isSeverity(input.severity)) throw new Error('Выберите критичность из перечня');
  if (!isStatus(input.status)) throw new Error('Выберите состояние из перечня');
  const note = input.note.replace(/\u0000/gu, '').trim();
  if (note.length > NOTE_MAX) throw new Error(`«Что сделано» длиннее ${NOTE_MAX} знаков — сократите`);

  const current = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, status: true, severity: true, note: true, resolvedAt: true },
  });
  if (current === null) throw new Error('Замечание не найдено');

  const severity: FeedbackSeverity = input.severity;
  const status: FeedbackStatus = input.status;
  const closed = CLOSED_STATUSES.has(status);
  const resolvedAt = closed
    ? CLOSED_STATUSES.has(current.status) && current.resolvedAt !== null
      ? current.resolvedAt
      : new Date()
    : null;
  const nextNote = note.length === 0 ? null : note;

  if (
    current.status === status &&
    current.severity === severity &&
    current.note === nextNote &&
    (current.resolvedAt?.getTime() ?? null) === (resolvedAt?.getTime() ?? null)
  ) {
    return;
  }

  await prisma.feedback.update({
    where: { id },
    data: { severity, status, note: nextNote, resolvedAt },
  });
  await record(actor, {
    action: 'FEEDBACK_REVIEWED',
    objectType: 'Feedback',
    objectId: id,
    payload: {
      status: { from: current.status, to: status },
      severity: { from: current.severity, to: severity },
      note: nextNote !== null,
      ...(actor === null ? { via: 'key' } : {}),
    },
  });
}

// ───────────────────────────── Снимок и выгрузка ─────────────────────────

/**
 * Снимок экрана на выдачу. Тип — тот, что определён по сигнатуре при
 * приёме, а не присланный; отказ в праве и отсутствие снимка для маршрута
 * неразличимы.
 */
export async function openFeedbackScreenshot(
  actor: Actor,
  id: string,
): Promise<(OpenedObject & { contentType: string; fileName: string }) | null> {
  ensure(actor, 'FEEDBACK_REVIEW');
  return openScreenshot(id);
}

async function openScreenshot(
  id: string,
): Promise<(OpenedObject & { contentType: string; fileName: string }) | null> {
  const row = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, screenshotKey: true, screenshotType: true },
  });
  if (row === null || row.screenshotKey === null || row.screenshotType === null) return null;
  let opened: OpenedObject;
  try {
    opened = await openObject(storage(), row.screenshotKey);
  } catch (error) {
    // Объекта нет — снимка нет: так и отвечаем, а не сбоем.
    if ((error as { code?: unknown } | null)?.code === 'ENOENT') return null;
    throw error;
  }
  const ext = row.screenshotKey.slice(row.screenshotKey.lastIndexOf('.') + 1);
  return { ...opened, contentType: row.screenshotType, fileName: `zamechanie-${row.id}.${ext}` };
}

/**
 * Книга замечаний для руководителя — та же таблица, что уходит в зеркало
 * на Диске. Выгрузка пишется в журнал числом строк.
 */
export async function feedbackWorkbook(actor: Actor, ip: string | null): Promise<Table> {
  ensure(actor, 'FEEDBACK_REVIEW');
  const book = await feedbackTable();
  await record(actor, {
    action: 'FEEDBACK_EXPORTED',
    objectType: 'Feedback',
    payload: { rows: book.rows },
    ip,
  });
  return book;
}

// ───────────────────────────── Выгрузка по ключу ──────────────────────────

/**
 * Служба выгрузки по ключу (решение Р-405): перечень, снимок и разбор для
 * `/api/feedback/export`. Право здесь не проверяется — его заменяет ключ,
 * который проверяет маршрут (`lib/feedback-export.ts`). Каждая выгрузка
 * перечня пишется в журнал числом строк с пометкой «по ключу», разбор — как
 * обычный, с той же пометкой.
 */
export const feedbackExportService: ExportService = {
  async list(statuses) {
    const rows = await prisma.feedback.findMany({
      where: statuses === null ? {} : { status: { in: statuses } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_LIMIT,
    });
    await record(null, {
      action: 'FEEDBACK_EXPORTED',
      objectType: 'Feedback',
      payload: { rows: rows.length, via: 'key' },
    });
    return rows;
  },

  async screenshot(id) {
    return openScreenshot(id);
  },

  async review(id, patch) {
    const current = await prisma.feedback.findUnique({
      where: { id },
      select: { status: true, severity: true, note: true },
    });
    if (current === null) return null;
    await applyReview(null, id, {
      status: patch.status ?? current.status,
      severity: patch.severity ?? current.severity,
      note: patch.note ?? current.note ?? '',
    });
    return prisma.feedback.findUnique({ where: { id } });
  },
};
