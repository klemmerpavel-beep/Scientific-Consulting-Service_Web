/**
 * Состояние зеркала практики на облачном диске.
 *
 * Зеркало собирается скриптом по расписанию, и до сих пор о нём было
 * известно только из журнала процесса на сервере: руководитель не видел
 * ни того, идёт ли выгрузка, ни того, когда она была последней. Здесь
 * состояние читается из журнала действий — отдельной таблицы под это не
 * заводится, потому что прогон уже отмечается там (решение Р-196).
 */

import { ensure, type Actor } from './access.ts';
import { prisma } from '../db.ts';

export interface DiskRun {
  readonly occurredAt: Date;
  readonly uploaded: number;
  readonly removed: number;
  readonly failed: number;
  readonly files: number;
  readonly scope: string;
}

export interface DiskStatus {
  /** Задан ли доступ к диску на сервере. */
  readonly configured: boolean;
  /** Куда выгружается: папка и адрес хранилища. */
  readonly folder: string;
  readonly host: string;
  /** Что именно уходит: только таблицы или ещё и файлы материалов. */
  readonly scope: 'tables' | 'all';
  readonly last: DiskRun | null;
  readonly runs: readonly DiskRun[];
}

/** Сколько последних прогонов показывается на экране. */
const RUNS_SHOWN = 10;

function asRun(row: { occurredAt: Date; payload: unknown }): DiskRun {
  const data = (row.payload ?? {}) as Record<string, unknown>;
  const num = (key: string): number => {
    const value = data[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return {
    occurredAt: row.occurredAt,
    uploaded: num('uploaded'),
    removed: num('removed'),
    failed: num('failed'),
    files: num('files'),
    scope: typeof data.scope === 'string' ? data.scope : 'all',
  };
}

export async function diskStatus(actor: Actor): Promise<DiskStatus> {
  // Состояние служебного контура видит тот же, кто видит журналы.
  ensure(actor, 'AUDIT_VIEW');

  const rows = await prisma.auditEvent.findMany({
    where: { action: 'DISK_SYNC' },
    orderBy: { occurredAt: 'desc' },
    take: RUNS_SHOWN,
    select: { occurredAt: true, payload: true },
  });
  const runs = rows.map(asRun);

  return {
    configured:
      (process.env.YANDEX_DISK_USER?.trim() ?? '').length > 0 &&
      (process.env.YANDEX_DISK_PASSWORD?.trim() ?? '').length > 0,
    folder: process.env.YANDEX_DISK_FOLDER?.trim() || 'ProDisser',
    host: process.env.YANDEX_DISK_WEBDAV?.trim() || 'https://webdav.yandex.ru',
    scope: (process.env.YANDEX_DISK_SCOPE?.trim() || 'all').toLowerCase() === 'tables'
      ? 'tables'
      : 'all',
    last: runs[0] ?? null,
    runs,
  };
}
