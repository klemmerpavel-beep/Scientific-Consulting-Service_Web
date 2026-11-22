/**
 * Сверка версий материалов с хранилищем (план доработки 19.11.2026, К-5;
 * ответ владельца 20.11.2026 «Отчёт и экран»; решение Р-986).
 *
 * Строка версии и файл пишутся разными записями: строка — в транзакции
 * базы, байты — после неё (Р-237). Сбой процесса между ними оставляет
 * версию без файла, а отказ уборки после неудачного переноса — файл без
 * версии (Р-937, Р-938: «сверка версий с хранилищем не заведена»).
 * Здесь расхождения только находятся: ничего не удаляется и не
 * исправляется само — решает человек.
 *
 * Виды расхождений:
 * - `MISSING` — у версии нет файла в хранилище;
 * - `ORPHAN` — файл под ключом версии материала, а строки версии нет;
 * - `SIZE` — файл есть, но его размер не тот, что записан при приёме;
 * - `PURGED_KEPT` — версия изъята по требованию субъекта, а файл остался.
 *
 * Сверка общая для отчёта цепочки выката (`/cabinet/api/storage-check`,
 * только числа) и экрана руководителя (`storageGaps` в `head-checks.ts`).
 * Ключ объекта персональных данных не несёт (Р-191), но ни в отчёт, ни на
 * экран не выводится: отчёт выката открыт всем.
 */

import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { storage, type ListedObject, type Storage } from './storage.ts';
import {
  compareVersions,
  materialKeyParts,
  MATERIAL_PREFIX,
  STORAGE_GAP_KINDS,
  type StorageGapKind,
} from './storage-gaps.ts';

export { MATERIAL_PREFIX, STORAGE_GAP_KINDS, STORAGE_GAP_LABEL, type StorageGapKind } from './storage-gaps.ts';

type Db = Prisma.TransactionClient | typeof prisma;

/** Расхождение с подписями: материал, работа, номер версии и дата. */
export interface StorageGap {
  readonly kind: StorageGapKind;
  /** Ключ объекта — для журнала сервера; на экран и в отчёт не выводится. */
  readonly key: string;
  readonly versionId: string | null;
  readonly version: number | null;
  readonly materialId: string | null;
  readonly material: string | null;
  readonly work: { readonly code: string; readonly title: string } | null;
  /** Когда: приём версии, изъятие или запись найденного файла. */
  readonly at: Date | null;
}

export interface StorageCheck {
  readonly versions: number;
  readonly files: number;
  readonly gaps: readonly StorageGap[];
  readonly counts: Readonly<Record<StorageGapKind, number>>;
}

/** Отказ сверки: хранилище не умеет перечня или не ответило. */
export class StorageCheckFailed extends Error {}

/**
 * Сверить все версии материалов с хранилищем. Только чтение: строки базы
 * и файлы остаются как есть. Отказ хранилища — `StorageCheckFailed`.
 */
export async function checkStorage(db: Db = prisma, store: Storage = storage()): Promise<StorageCheck> {
  if (store.list === undefined) throw new StorageCheckFailed('Хранилище не отдаёт перечень объектов: сверка не выполняется');
  const rows = await db.materialVersion.findMany({
    orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      number: true,
      storageKey: true,
      sizeBytes: true,
      uploadedAt: true,
      purgedAt: true,
      material: { select: { id: true, title: true, project: { select: { code: true, title: true } } } },
    },
  });
  let listed: ListedObject[];
  try {
    listed = await store.list(MATERIAL_PREFIX);
  } catch (error) {
    throw new StorageCheckFailed(`Хранилище не отдало перечень объектов: ${String(error).slice(0, 200)}`);
  }
  // Версия с ключом вне префикса (перенесённая из прежнего порядка ключей)
  // ищется поштучно: в перечень под префиксом она не попадает.
  const found = new Map<string, Omit<ListedObject, 'key'> | null>();
  for (const row of rows) {
    if (row.storageKey.startsWith(MATERIAL_PREFIX)) continue;
    found.set(row.storageKey, store.stat === undefined ? null : await store.stat(row.storageKey).catch(() => null));
  }
  const raw = compareVersions(rows, listed, found);

  // Сироте подпись берётся по ключу: материал, если его строка жива, иначе работа.
  const orphans = raw.filter((gap) => gap.kind === 'ORPHAN').map((gap) => materialKeyParts(gap.key));
  const materialIds = [...new Set(orphans.flatMap((parts) => (parts === null ? [] : [parts.materialId])))];
  const projectIds = [...new Set(orphans.flatMap((parts) => (parts === null ? [] : [parts.projectId])))];
  const [materials, projects] = await Promise.all([
    materialIds.length === 0
      ? []
      : db.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, title: true, project: { select: { code: true, title: true } } } }),
    projectIds.length === 0 ? [] : db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, title: true } }),
  ]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const gaps: StorageGap[] = raw.map((gap) => {
    if (gap.version !== null) {
      const row = rowById.get(gap.version.id)!;
      return {
        kind: gap.kind,
        key: gap.key,
        versionId: row.id,
        version: row.number,
        materialId: row.material.id,
        material: row.material.title,
        work: { code: row.material.project.code, title: row.material.project.title },
        at: gap.kind === 'PURGED_KEPT' ? row.purgedAt : row.uploadedAt,
      };
    }
    const parts = materialKeyParts(gap.key);
    const material = parts === null ? undefined : materialById.get(parts.materialId);
    const project = parts === null ? undefined : projectById.get(parts.projectId);
    return {
      kind: gap.kind,
      key: gap.key,
      versionId: null,
      version: parts?.version ?? null,
      materialId: material?.id ?? null,
      material: material?.title ?? null,
      work: material !== undefined ? { code: material.project.code, title: material.project.title } : project === undefined ? null : { code: project.code, title: project.title },
      at: gap.object?.modifiedAt ?? null,
    };
  });
  gaps.sort(
    (a, b) =>
      STORAGE_GAP_KINDS.indexOf(a.kind) - STORAGE_GAP_KINDS.indexOf(b.kind) ||
      (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) ||
      a.key.localeCompare(b.key),
  );
  const counts = Object.fromEntries(STORAGE_GAP_KINDS.map((kind) => [kind, gaps.filter((gap) => gap.kind === kind).length])) as Record<
    StorageGapKind,
    number
  >;
  return { versions: rows.length, files: listed.length, gaps, counts };
}
