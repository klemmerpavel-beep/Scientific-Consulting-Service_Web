import { NextResponse } from 'next/server';

import { AccessDenied } from '../../../../../lib/cabinet/access';
import { record } from '../../../../../lib/cabinet/audit';
import {
  auditEvents,
  EXPORT_MAX_ROWS,
  fileAccessEvents,
  formatMoment,
  toCsv,
} from '../../../../../lib/cabinet/journals';
import { currentActor, requestIp } from '../../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Выгрузка журнала. Сама выгрузка тоже записывается в журнал: получить
 * полный список действий по практике — это событие, о котором журнал
 * обязан помнить.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await currentActor();
  if (actor === null) return new NextResponse('Требуется вход', { status: 401 });

  const url = new URL(request.url);
  const files = url.searchParams.get('kind') === 'files';
  const value = (name: string): string | null => {
    const raw = url.searchParams.get(name);
    return raw === null || raw.length === 0 ? null : raw;
  };
  const day = (name: string): Date | null => {
    const raw = value(name);
    if (raw === null) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const filter = {
    from: day('from'),
    to: day('to'),
    actorId: value('actorId'),
    action: value('action'),
    projectTitle: value('projectTitle'),
    limit: EXPORT_MAX_ROWS + 1,
    forExport: true,
  };
  let truncated = false;

  let rows: string[][];
  try {
    if (files) {
      const found = await fileAccessEvents(actor, filter);
      truncated = found.length > EXPORT_MAX_ROWS;
      const events = found.slice(0, EXPORT_MAX_ROWS);
      rows = [
        ['Когда', 'Кто', 'Роль', 'Действие', 'Работа', 'Материал', 'Версия', 'Файл', 'Адрес'],
        ...events.map((event) => [
          formatMoment(event.occurredAt),
          event.user?.fullName ?? '',
          event.user?.role ?? '',
          event.action,
          event.version.material.project.title,
          event.version.material.title,
          String(event.version.number),
          event.version.originalName,
          event.ip ?? '',
        ]),
      ];
    } else {
      const found = await auditEvents(actor, filter);
      truncated = found.length > EXPORT_MAX_ROWS;
      const events = found.slice(0, EXPORT_MAX_ROWS);
      rows = [
        ['Когда', 'Кто', 'Роль', 'Адрес', 'Действие', 'Тип объекта', 'Объект', 'Проект', 'Подробности'],
        ...events.map((event) => [
          formatMoment(event.occurredAt),
          event.actor?.fullName ?? 'система',
          event.actorRole ?? '',
          event.actorIp ?? '',
          event.action,
          event.objectType,
          event.objectId ?? '',
          event.projectId ?? '',
          event.payload === null ? '' : JSON.stringify(event.payload),
        ]),
      ];
    }
  } catch (error) {
    if (error instanceof AccessDenied) return new NextResponse('Недоступно', { status: 403 });
    throw error;
  }

  const exported = rows.length - 1;
  if (truncated) {
    // Обрезка видна в самом файле: иначе выгрузка за период выглядела бы
    // полной, а старые записи просто отсутствовали бы.
    rows.push([
      `Выгрузка обрезана: показаны последние ${EXPORT_MAX_ROWS} записей. Сузьте период, чтобы получить остальные.`,
    ]);
  }

  await record(actor, {
    action: 'JOURNAL_EXPORTED',
    objectType: files ? 'FileAccessLog' : 'AuditEvent',
    payload: {
      rows: exported,
      truncated,
      filter: { ...filter, limit: undefined, forExport: undefined },
    },
    ip: await requestIp(),
  });

  const name = files ? 'dostup-k-faylam' : 'zhurnal-deystviy';
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
