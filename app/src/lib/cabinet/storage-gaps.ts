/**
 * Сверка версий материалов с хранилищем — чистая часть: виды
 * расхождений, их подписи, сравнение строк версий с объектами и разбор
 * ключа (решение Р-986). Без базы: её читают и проверки без базы, как
 * подписи журнала (Р-821). Выборка из базы и хранилища — `storage-check.ts`.
 */

import type { ListedObject } from './storage.ts';

/** Под этим префиксом лежат файлы версий материалов (`materialKey`). */
export const MATERIAL_PREFIX = 'projects/';

export type StorageGapKind = 'MISSING' | 'SIZE' | 'PURGED_KEPT' | 'ORPHAN';

/** Порядок видов в перечне: сперва то, что ломает скачивание. */
export const STORAGE_GAP_KINDS: readonly StorageGapKind[] = ['MISSING', 'SIZE', 'PURGED_KEPT', 'ORPHAN'];

export const STORAGE_GAP_LABEL: Readonly<Record<StorageGapKind, string>> = {
  MISSING: 'нет файла в хранилище',
  SIZE: 'размер файла не совпадает',
  PURGED_KEPT: 'версия изъята, файл остался',
  ORPHAN: 'файл без версии в базе',
};

/** Версия, как её видит сверка. */
export interface VersionRow {
  readonly id: string;
  readonly number: number;
  readonly storageKey: string;
  readonly sizeBytes: bigint;
  readonly uploadedAt: Date;
  readonly purgedAt: Date | null;
}

/** Расхождение без подписей: что с чем не сошлось. */
export interface RawGap {
  readonly kind: StorageGapKind;
  readonly key: string;
  readonly version: VersionRow | null;
  readonly object: Omit<ListedObject, 'key'> | null;
}

/**
 * Сравнение строк версий с объектами хранилища. Чистая функция: объекты —
 * перечень под `MATERIAL_PREFIX` и найденные поштучно (`found`) для
 * версий с ключом вне префикса — у такой версии объект ищется по ключу.
 */
export function compareVersions(
  versions: readonly VersionRow[],
  listed: readonly ListedObject[],
  found: ReadonlyMap<string, Omit<ListedObject, 'key'> | null> = new Map(),
): RawGap[] {
  const objects = new Map(listed.map((object) => [object.key, object]));
  const known = new Set<string>();
  const gaps: RawGap[] = [];
  for (const version of versions) {
    known.add(version.storageKey);
    const object = objects.get(version.storageKey) ?? found.get(version.storageKey) ?? null;
    if (version.purgedAt !== null) {
      if (object !== null) gaps.push({ kind: 'PURGED_KEPT', key: version.storageKey, version, object });
      continue;
    }
    if (object === null) gaps.push({ kind: 'MISSING', key: version.storageKey, version, object: null });
    else if (BigInt(object.sizeBytes) !== version.sizeBytes) gaps.push({ kind: 'SIZE', key: version.storageKey, version, object });
  }
  for (const object of listed) {
    if (!known.has(object.key)) gaps.push({ kind: 'ORPHAN', key: object.key, version: null, object });
  }
  return gaps;
}

/** Части ключа версии: `projects/{работа}/materials/{материал}/v{номер}/{случайная часть}`. */
export function materialKeyParts(key: string): { projectId: string; materialId: string; version: number } | null {
  const match = /^projects\/([^/]+)\/materials\/([^/]+)\/v(\d+)\/[^/]+$/u.exec(key);
  return match === null ? null : { projectId: match[1]!, materialId: match[2]!, version: Number(match[3]) };
}
