/**
 * Сверка файлов с хранилищем: версии материалов (план доработки
 * 19.11.2026, К-5; ответ владельца 20.11.2026 «Отчёт и экран»; решение
 * Р-986), вложения заявок и файлы анкет экспертов (ответ владельца
 * 22.11.2026 «Расширить в выпуске 4»; решение Р-1007).
 *
 * Строка версии и файл пишутся разными записями (Р-937, Р-938: «сверка
 * версий с хранилищем не заведена»). С решением Р-1006 файл пишется до
 * транзакции строки, и версии без файла порядок не оставляет; файл без
 * версии остаётся при обрыве процесса между ними или при неудавшейся
 * уборке, изъятая версия с файлом — при отказе удаления после фиксации.
 * Версию без файла и чужой размер дают восстановление из копии и правка
 * хранилища руками. Здесь расхождения только находятся: ничего не
 * удаляется и не исправляется само — решает человек.
 *
 * Виды расхождений у версий материалов (`projects/`):
 * - `MISSING` — у версии нет файла в хранилище;
 * - `ORPHAN` — файл под ключом версии материала, а строки версии нет;
 * - `SIZE` — файл есть, но его размер не тот, что записан при приёме;
 * - `PURGED_KEPT` — версия изъята по требованию субъекта, а файл остался.
 *
 * У вложений заявок (`leads/`) — `ORPHAN` (файл без строки вложения:
 * отказ записи строки после файла в заявке из кабинета, строки заявки,
 * удалённой по сроку вместе с вложениями) и `PURGED_KEPT` (вложение
 * перенесено в материалы или изъято, а исходный объект на месте) — только
 * после срока еженедельной чистки, которая повторяет удаление
 * (`purgeDeadline`). У файлов анкет экспертов (`experts/`) — только
 * `ORPHAN`: файл удалённой анкеты, который не удалось удалить; его не
 * найдёт и чистка — она выбирает файлы по строкам.
 *
 * Сверка общая для отчёта цепочки выката (`/cabinet/api/storage-check`,
 * только числа) и экрана руководителя (`storageGaps` в `head-checks.ts`).
 * Ключ объекта персональных данных не несёт (Р-191), но ни в отчёт, ни на
 * экран не выводится: отчёт выката открыт всем.
 */

import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { now } from './clock.ts';
import { storage, type ListedObject, type Storage } from './storage.ts';
import {
  compareFiles,
  compareVersions,
  materialKeyParts,
  ownerOfKey,
  purgeDeadline,
  EXPERT_PREFIX,
  LEAD_PREFIX,
  MATERIAL_PREFIX,
  STORAGE_GAP_KINDS,
  STORAGE_SECTIONS,
  type FileRow,
  type RawFileGap,
  type StorageGapKind,
  type StorageSection,
} from './storage-gaps.ts';

export {
  EXPERT_PREFIX,
  LEAD_PREFIX,
  LEAD_PURGE_GRACE_DAYS,
  MATERIAL_PREFIX,
  STORAGE_GAP_KINDS,
  STORAGE_GAP_LABEL,
  STORAGE_SECTION_KINDS,
  STORAGE_SECTION_TITLE,
  STORAGE_SECTIONS,
  storageGapLabel,
  type StorageGapKind,
  type StorageSection,
} from './storage-gaps.ts';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Расхождение с подписями. У версии — материал, работа, номер версии; у
 * вложения — заявка (номер); у файла анкеты — анкета (дата). ФИО, контакты
 * и имена файлов в подписи не входят.
 */
export interface StorageGap {
  readonly section: StorageSection;
  readonly kind: StorageGapKind;
  /** Ключ объекта — для журнала сервера; на экран и в отчёт не выводится. */
  readonly key: string;
  readonly versionId: string | null;
  readonly version: number | null;
  readonly materialId: string | null;
  readonly material: string | null;
  readonly work: { readonly code: string; readonly title: string } | null;
  /** Заявка вложения, если её строка жива: номер — подпись, идентификатор — ссылка. */
  readonly lead: { readonly id: string; readonly number: number } | null;
  /** Анкета файла, если её строка жива: дата анкеты, без ФИО и контактов. */
  readonly application: { readonly id: string; readonly createdAt: Date } | null;
  /** Когда: приём версии, изъятие или запись найденного файла. */
  readonly at: Date | null;
}

export interface StorageCheck {
  /** Строк версий материалов. */
  readonly versions: number;
  /** Объектов в перечне под тремя префиксами. */
  readonly files: number;
  readonly gaps: readonly StorageGap[];
  /** Число расхождений по разделу и виду. */
  readonly counts: Readonly<Record<StorageSection, Readonly<Record<StorageGapKind, number>>>>;
}

/** Отказ сверки: хранилище не умеет перечня или не ответило. */
export class StorageCheckFailed extends Error {}

const EMPTY_GAP = { versionId: null, version: null, materialId: null, material: null, work: null, lead: null, application: null } as const;

/**
 * Сверить версии материалов, вложения заявок и файлы анкет с хранилищем.
 * Только чтение: строки базы и файлы остаются как есть. Отказ хранилища —
 * `StorageCheckFailed`. `at` — момент сверки для срока чистки вложений.
 */
export async function checkStorage(db: Db = prisma, store: Storage = storage(), at: Date = now()): Promise<StorageCheck> {
  const list = store.list?.bind(store);
  if (list === undefined) throw new StorageCheckFailed('Хранилище не отдаёт перечень объектов: сверка не выполняется');
  const [rows, leadRows, expertRows] = await Promise.all([
    db.materialVersion.findMany({
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
    }),
    db.leadAttachment.findMany({
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, storageKey: true, purgedAt: true, lead: { select: { id: true, number: true } } },
    }),
    db.expertApplicationFile.findMany({
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, storageKey: true, application: { select: { id: true, createdAt: true } } },
    }),
  ]);
  const listUnder = async (prefix: string): Promise<ListedObject[]> => {
    try {
      return await list(prefix);
    } catch (error) {
      throw new StorageCheckFailed(`Хранилище не отдало перечень объектов: ${String(error).slice(0, 200)}`);
    }
  };
  const listed = await listUnder(MATERIAL_PREFIX);
  const leadListed = await listUnder(LEAD_PREFIX);
  const expertListed = await listUnder(EXPERT_PREFIX);
  const statOf = async (key: string) => (store.stat === undefined ? null : await store.stat(key).catch(() => null));

  // Версия с ключом вне префикса (перенесённая из прежнего порядка ключей)
  // ищется поштучно: в перечень под префиксом она не попадает.
  const found = new Map<string, Omit<ListedObject, 'key'> | null>();
  for (const row of rows) {
    if (row.storageKey.startsWith(MATERIAL_PREFIX)) continue;
    found.set(row.storageKey, await statOf(row.storageKey));
  }
  const raw = compareVersions(rows, listed, found);

  // Вложения заявок: изъятое или перенесённое — расхождение только после
  // срока чистки; вложение с ключом вне префикса — тем же поштучным поиском.
  const deadline = purgeDeadline(at);
  const leadFound = new Map<string, Omit<ListedObject, 'key'> | null>();
  for (const row of leadRows) {
    if (row.storageKey.startsWith(LEAD_PREFIX) || row.purgedAt === null || row.purgedAt > deadline) continue;
    leadFound.set(row.storageKey, await statOf(row.storageKey));
  }
  const leadRaw = compareFiles(leadRows, leadListed, deadline, leadFound);
  // У строки файла анкеты отметки изъятия нет: анкета удаляется целиком.
  const expertRaw = compareFiles(
    expertRows.map((row): FileRow => ({ id: row.id, storageKey: row.storageKey, purgedAt: null })),
    expertListed,
    deadline,
  );

  // Сироте подпись берётся по ключу: материал, если его строка жива, иначе
  // работа; вложению — заявка, файлу анкеты — анкета, если строка жива.
  const orphans = raw.filter((gap) => gap.kind === 'ORPHAN').map((gap) => materialKeyParts(gap.key));
  const materialIds = [...new Set(orphans.flatMap((parts) => (parts === null ? [] : [parts.materialId])))];
  const projectIds = [...new Set(orphans.flatMap((parts) => (parts === null ? [] : [parts.projectId])))];
  const owners = (section: 'LEADS' | 'EXPERTS', gaps: readonly RawFileGap[]) => [
    ...new Set(gaps.flatMap((gap) => (gap.kind === 'ORPHAN' ? [ownerOfKey(section, gap.key)].filter((id): id is string => id !== null) : []))),
  ];
  const leadIds = owners('LEADS', leadRaw);
  const applicationIds = owners('EXPERTS', expertRaw);
  const [materials, projects, leads, applications] = await Promise.all([
    materialIds.length === 0
      ? []
      : db.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, title: true, project: { select: { code: true, title: true } } } }),
    projectIds.length === 0 ? [] : db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, title: true } }),
    leadIds.length === 0 ? [] : db.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, number: true } }),
    applicationIds.length === 0 ? [] : db.expertApplication.findMany({ where: { id: { in: applicationIds } }, select: { id: true, createdAt: true } }),
  ]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const leadRowById = new Map(leadRows.map((row) => [row.id, row]));

  const gaps: StorageGap[] = raw.map((gap) => {
    if (gap.version !== null) {
      const row = rowById.get(gap.version.id)!;
      return {
        ...EMPTY_GAP,
        section: 'MATERIALS',
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
      ...EMPTY_GAP,
      section: 'MATERIALS',
      kind: gap.kind,
      key: gap.key,
      version: parts?.version ?? null,
      materialId: material?.id ?? null,
      material: material?.title ?? null,
      work: material !== undefined ? { code: material.project.code, title: material.project.title } : project === undefined ? null : { code: project.code, title: project.title },
      at: gap.object?.modifiedAt ?? null,
    };
  });
  for (const gap of leadRaw) {
    const row = gap.row === null ? undefined : leadRowById.get(gap.row.id);
    const owner = row?.lead ?? leadById.get(ownerOfKey('LEADS', gap.key) ?? '');
    gaps.push({
      ...EMPTY_GAP,
      section: 'LEADS',
      kind: gap.kind,
      key: gap.key,
      lead: owner === undefined ? null : { id: owner.id, number: owner.number },
      at: gap.kind === 'PURGED_KEPT' ? (row?.purgedAt ?? null) : gap.object.modifiedAt,
    });
  }
  for (const gap of expertRaw) {
    const owner = applicationById.get(ownerOfKey('EXPERTS', gap.key) ?? '');
    gaps.push({
      ...EMPTY_GAP,
      section: 'EXPERTS',
      kind: gap.kind,
      key: gap.key,
      application: owner === undefined ? null : { id: owner.id, createdAt: owner.createdAt },
      at: gap.object.modifiedAt,
    });
  }
  gaps.sort(
    (a, b) =>
      STORAGE_SECTIONS.indexOf(a.section) - STORAGE_SECTIONS.indexOf(b.section) ||
      STORAGE_GAP_KINDS.indexOf(a.kind) - STORAGE_GAP_KINDS.indexOf(b.kind) ||
      (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) ||
      a.key.localeCompare(b.key),
  );
  const counts = Object.fromEntries(
    STORAGE_SECTIONS.map((section) => [
      section,
      Object.fromEntries(STORAGE_GAP_KINDS.map((kind) => [kind, gaps.filter((gap) => gap.section === section && gap.kind === kind).length])),
    ]),
  ) as Record<StorageSection, Record<StorageGapKind, number>>;
  return { versions: rows.length, files: listed.length + leadListed.length + expertListed.length, gaps, counts };
}
