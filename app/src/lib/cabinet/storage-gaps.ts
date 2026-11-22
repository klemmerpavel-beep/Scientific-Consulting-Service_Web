/**
 * Сверка файлов с хранилищем — чистая часть: разделы, виды расхождений,
 * их подписи, сравнение строк с объектами, разбор ключей и срок чистки
 * (решения Р-986, Р-1007). Без базы: её читают и проверки без базы, как
 * подписи журнала (Р-821). Выборка из базы и хранилища — `storage-check.ts`.
 */

import type { ListedObject } from './storage.ts';

/** Под этим префиксом лежат файлы версий материалов (`materialKey`). */
export const MATERIAL_PREFIX = 'projects/';
/** Вложения заявок (`leadAttachmentKey`): `leads/{заявка}/{случайная часть}`. */
export const LEAD_PREFIX = 'leads/';
/** Файлы анкет экспертов (`expertFileKey`): `experts/{анкета}/{случайная часть}`. */
export const EXPERT_PREFIX = 'experts/';

/**
 * Раздел хранилища, который сверяется: версии материалов (Р-986), вложения
 * заявок и файлы анкет экспертов (Р-1007). Временные документы `briefs/`
 * вне сверки: их удаляет еженедельная чистка через сутки (Р-560).
 */
export type StorageSection = 'MATERIALS' | 'LEADS' | 'EXPERTS';

/** Порядок разделов на «Сводке»: сперва то, что ломает работу клиента. */
export const STORAGE_SECTIONS: readonly StorageSection[] = ['MATERIALS', 'LEADS', 'EXPERTS'];

export const STORAGE_SECTION_PREFIX: Readonly<Record<StorageSection, string>> = {
  MATERIALS: MATERIAL_PREFIX,
  LEADS: LEAD_PREFIX,
  EXPERTS: EXPERT_PREFIX,
};

export const STORAGE_SECTION_TITLE: Readonly<Record<StorageSection, string>> = {
  MATERIALS: 'Версии материалов',
  LEADS: 'Вложения заявок',
  // В кабинете слово «эксперт» не используется (Э-01): раздел «Управления»
  // с анкетами называется «Анкеты кандидатов».
  EXPERTS: 'Анкеты кандидатов',
};

export type StorageGapKind = 'MISSING' | 'SIZE' | 'PURGED_KEPT' | 'ORPHAN';

/** Порядок видов в перечне: сперва то, что ломает скачивание. */
export const STORAGE_GAP_KINDS: readonly StorageGapKind[] = ['MISSING', 'SIZE', 'PURGED_KEPT', 'ORPHAN'];

/**
 * Какие виды сверяет раздел. У вложений и анкет только два вида (ответ
 * владельца 22.11.2026): «файл без записи» и «запись изъята, файл
 * остался»; у строки файла анкеты отметки изъятия нет — анкета удаляется
 * целиком, — поэтому у анкет вид один.
 */
export const STORAGE_SECTION_KINDS: Readonly<Record<StorageSection, readonly StorageGapKind[]>> = {
  MATERIALS: STORAGE_GAP_KINDS,
  LEADS: ['PURGED_KEPT', 'ORPHAN'],
  EXPERTS: ['ORPHAN'],
};

/** Подписи видов у версий материалов (Р-986). */
export const STORAGE_GAP_LABEL: Readonly<Record<StorageGapKind, string>> = {
  MISSING: 'нет файла в хранилище',
  SIZE: 'размер файла не совпадает',
  PURGED_KEPT: 'версия изъята, файл остался',
  ORPHAN: 'файл без версии в базе',
};

/** Подпись вида в своём разделе. */
export function storageGapLabel(section: StorageSection, kind: StorageGapKind): string {
  if (section === 'MATERIALS') return STORAGE_GAP_LABEL[kind];
  if (kind === 'PURGED_KEPT') return 'вложение изъято или перенесено, файл остался';
  return section === 'LEADS' ? 'файл без записи вложения' : 'файл без записи анкеты';
}

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

/**
 * Заявка или анкета по ключу файла: `leads/{заявка}/{случайная часть}`,
 * `experts/{анкета}/{случайная часть}`. Нужна сироте — строки файла у неё
 * нет, а заявка или анкета может быть жива.
 */
export function ownerOfKey(section: 'LEADS' | 'EXPERTS', key: string): string | null {
  const prefix = STORAGE_SECTION_PREFIX[section];
  if (!key.startsWith(prefix)) return null;
  const match = /^([^/]+)\/[^/]+$/u.exec(key.slice(prefix.length));
  return match === null ? null : match[1]!;
}

// ── Срок чистки изъятых вложений (Р-1007) ────────────────────────────────
//
// Объект вложения, перенесённого в материалы при одобрении или изъятого по
// требованию субъекта, удаляется сразу после фиксации (Р-1006); отказ
// удаления повторяет `deploy/retention.sh` по ключам строк с `purgedAt`
// (`SQL_PURGED_KEYS`). Чистка стоит в расписании раз в неделю — по
// понедельникам в 03:30 по часам хоста (`deploy/cron-sync.sh`, Р-267).
// Через 7 суток после отметки хотя бы один её прогон уже прошёл; сутки
// сверху — запас на часовой пояс хоста, время прогона и запоздавший
// запуск. Пока срок не вышел, оставшийся объект — не расхождение: он ждёт
// чистки законно.

/** Период чистки по расписанию, сутки: еженедельно. */
export const PURGE_PERIOD_DAYS = 7;
/** Запас на пояс хоста, длительность и запоздавший запуск, сутки. */
export const PURGE_SLACK_DAYS = 1;
/** Срок, после которого объект изъятого вложения — расхождение, сутки. */
export const LEAD_PURGE_GRACE_DAYS = PURGE_PERIOD_DAYS + PURGE_SLACK_DAYS;

/** Изъятые не позже этого момента чистка уже должна была убрать. */
export function purgeDeadline(at: Date): Date {
  return new Date(at.getTime() - LEAD_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/** Строка файла вложения или анкеты, как её видит сверка. */
export interface FileRow {
  readonly id: string;
  readonly storageKey: string;
  /** Изъят или перенесён; у файлов анкет — всегда `null`. */
  readonly purgedAt: Date | null;
}

/** Расхождение файла вложения или анкеты без подписей. */
export interface RawFileGap {
  readonly kind: 'PURGED_KEPT' | 'ORPHAN';
  readonly key: string;
  readonly row: FileRow | null;
  readonly object: Omit<ListedObject, 'key'>;
}

/**
 * Сравнение строк файлов вложений или анкет с объектами хранилища (Р-1007).
 * Чистая функция, два вида: объект без строки (`ORPHAN`) и строка изъята,
 * а объект на месте (`PURGED_KEPT`) — только если изъята не позже
 * `keptBefore`, то есть срок чистки вышел. Строка без объекта и чужой
 * размер здесь не сверяются. Объекты — перечень под префиксом раздела и
 * найденные поштучно (`found`) для изъятых строк с ключом вне префикса.
 */
export function compareFiles(
  rows: readonly FileRow[],
  listed: readonly ListedObject[],
  keptBefore: Date,
  found: ReadonlyMap<string, Omit<ListedObject, 'key'> | null> = new Map(),
): RawFileGap[] {
  const objects = new Map(listed.map((object) => [object.key, object]));
  const known = new Set<string>();
  const gaps: RawFileGap[] = [];
  for (const row of rows) {
    known.add(row.storageKey);
    if (row.purgedAt === null || row.purgedAt.getTime() > keptBefore.getTime()) continue;
    const object = objects.get(row.storageKey) ?? found.get(row.storageKey) ?? null;
    if (object !== null) gaps.push({ kind: 'PURGED_KEPT', key: row.storageKey, row, object });
  }
  for (const object of listed) {
    if (!known.has(object.key)) gaps.push({ kind: 'ORPHAN', key: object.key, row: null, object });
  }
  return gaps;
}
