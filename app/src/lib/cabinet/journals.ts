/**
 * Журналы: действия и доступ к файлам.
 *
 * Два журнала, а не один: у них разный объём и разный срок хранения.
 * Журнал действий отвечает на вопрос «кто и что изменил», журнал доступа —
 * «кто получил файл клиента»; второй растёт на порядок быстрее и нужен
 * при разборе утечки, а не при разборе правки.
 *
 * Персональные данные в журналы не пишутся сверх необходимого: действующее
 * лицо хранится идентификатором, содержимое — изменившимися полями.
 */

import { ensure, type Actor } from './access.ts';
import { prisma } from '../db.ts';
import { toCsv } from './csv.ts';
import { actionCodes } from './journal-labels.ts';


export interface JournalFilter {
  readonly from?: Date | null;
  readonly to?: Date | null;
  readonly actorId?: string | null;
  readonly action?: string | null;
  readonly projectCode?: string | null;
  readonly limit?: number;
}

/** Верхняя граница выборки: журнал читают, а не выгружают целиком в разметку. */
const MAX_ROWS = 500;

function period(filter: JournalFilter): Record<string, Date> | undefined {
  const range: Record<string, Date> = {};
  if (filter.from != null) range.gte = filter.from;
  // Верхняя граница включает весь указанный день: иначе «по 16 сентября»
  // молча теряло бы всё, что случилось после полуночи.
  if (filter.to != null) range.lt = new Date(filter.to.getTime() + 86_400_000);
  return Object.keys(range).length === 0 ? undefined : range;
}

export async function auditEvents(actor: Actor, filter: JournalFilter = {}) {
  ensure(actor, 'AUDIT_VIEW');

  const projectId =
    filter.projectCode == null || filter.projectCode.trim().length === 0
      ? undefined
      : ((
          await prisma.project.findUnique({
            where: { code: filter.projectCode.trim() },
            select: { id: true },
          })
        )?.id ?? '—нет такого проекта—');

  return prisma.auditEvent.findMany({
    where: {
      occurredAt: period(filter),
      actorId: filter.actorId == null || filter.actorId.length === 0 ? undefined : filter.actorId,
      action:
        filter.action == null || filter.action.length === 0 ? undefined : { contains: filter.action },
      projectId,
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(filter.limit ?? 200, MAX_ROWS),
    select: {
      id: true,
      occurredAt: true,
      action: true,
      objectType: true,
      objectId: true,
      projectId: true,
      actorRole: true,
      actorIp: true,
      payload: true,
      actor: { select: { id: true, fullName: true, email: true } },
    },
  });
}

export async function fileAccessEvents(actor: Actor, filter: JournalFilter = {}) {
  ensure(actor, 'AUDIT_VIEW');

  return prisma.fileAccessLog.findMany({
    where: {
      occurredAt: period(filter),
      userId: filter.actorId == null || filter.actorId.length === 0 ? undefined : filter.actorId,
      action:
        filter.action == null || filter.action.length === 0
          ? undefined
          : (filter.action as 'UPLOAD' | 'PRESIGN' | 'DOWNLOAD' | 'PURGE'),
      version:
        filter.projectCode == null || filter.projectCode.trim().length === 0
          ? undefined
          : { material: { project: { code: filter.projectCode.trim() } } },
    },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(filter.limit ?? 200, MAX_ROWS),
    select: {
      id: true,
      occurredAt: true,
      action: true,
      ip: true,
      user: { select: { id: true, fullName: true, role: true } },
      version: {
        select: {
          number: true,
          originalName: true,
          sizeBytes: true,
          material: { select: { title: true, project: { select: { code: true } } } },
        },
      },
    },
  });
}

/** Действующие лица журнала — для выпадающего списка фильтра. */
export async function journalActors(actor: Actor) {
  ensure(actor, 'AUDIT_VIEW');
  return prisma.user.findMany({
    where: { auditEvents: { some: {} } },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: 'asc' },
  });
}

/**
 * Виды действий для отбора — из словаря названий, а не обходом журнала.
 *
 * Право проверяется по-прежнему: перечень действий говорит, что вообще
 * умеет система, и посторонним он не нужен (решение Р-186).
 */
export function journalActions(actor: Actor): string[] {
  ensure(actor, 'AUDIT_VIEW');
  return actionCodes();
}

export { toCsv };

export function formatMoment(value: Date): string {
  return value.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
