/**
 * Перенос книги заказов в систему: предпросмотр и фиксация.
 *
 * Фиксация без предпросмотра невозможна по устройству: `applyBatch`
 * принимает не файл, а идентификатор уже разобранной загрузки. Разбор
 * исторических данных необратим по последствиям — проекты получают коды,
 * и отменять их задним числом хуже, чем показать отчёт до записи.
 *
 * Кода заказа в книге нет, поэтому повторность определяется естественным
 * ключом строки (`ParsedRow.signature`): дата, ФИО и написание типа работы.
 * Ключ хранится в `ImportRow.signature`, и повторная загрузка того же файла
 * даёт строки со значением `SKIP`, а не новые проекты. Сумма в ключ больше
 * не входит, а строки со старыми ключами (с суммой) сверяются по основе —
 * см. `import/match.ts` (решение Р-252).
 */

import { createHash } from 'node:crypto';

import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../db.ts';
import { ensure, type Actor } from '../access.ts';
import { record } from '../audit.ts';
import { nextProjectCode } from '../projects.ts';
import {
  DEFAULT_FILLS,
  ERASED_KEY_PREFIX,
  ISSUE_LABEL,
  KEY_VERSION,
  STATUS_LABEL,
  erasedKey,
  normalizeName,
  parseBook,
  signatureBase,
  type IssueCode,
  type LegacyStatus,
  type ParsedRow,
} from './etl.ts';
import { changed, matchBook, type KnownWork, type RowMatch } from './match.ts';
import { readWorkbook } from './xlsx.ts';
import { ImportError } from './zip.ts';

/** Состояние работы из книги → состояние проекта. */
const PROJECT_STATUS: Record<LegacyStatus, 'ACTIVE' | 'PAUSED' | 'COMPLETED'> = {
  CLOSED: 'COMPLETED',
  IN_WORK: 'ACTIVE',
  ON_START: 'ACTIVE',
  STOPPED: 'PAUSED',
};

export type RowAction = 'CREATE' | 'UPDATE' | 'SKIP';
export type RowSeverity = 'OK' | 'WARNING' | 'ERROR';

export interface PreviewRow {
  readonly rowNumber: number;
  readonly signature: string;
  readonly action: RowAction;
  readonly severity: RowSeverity;
  readonly customer: string;
  readonly rawType: string;
  readonly typeCode: string | null;
  readonly topic: string;
  readonly orderDate: Date | null;
  readonly deadline: Date | null;
  readonly cost: bigint;
  readonly paid: bigint;
  readonly status: LegacyStatus;
  readonly statusLabel: string;
  readonly rawStatus: string;
  readonly fill: string | null;
  readonly issues: readonly { code: IssueCode; label: string; note: string }[];
  /** Код проекта, если строка уже перенесена прежней загрузкой. */
  readonly existingCode: string | null;
  /** Данные заказчика стёрты по требованию субъекта: строка не переносится. */
  readonly erased: boolean;
  /** Пояснение к решению по строке, если оно не очевидно из самого решения. */
  readonly note: string | null;
}

export interface DuplicateGroup {
  readonly normalizedName: string;
  readonly spellings: readonly string[];
  readonly rowNumbers: readonly number[];
  /** Карточка, уже заведённая прежней загрузкой, если она есть. */
  readonly existingClientId: string | null;
}

export interface Preview {
  readonly batchId: string;
  readonly fileName: string;
  readonly sheet: string;
  readonly state: 'PARSED' | 'PREVIEWED' | 'APPLIED' | 'CANCELLED';
  readonly createdAt: Date;
  readonly rows: readonly PreviewRow[];
  readonly totals: { readonly cost: bigint; readonly paid: bigint };
  readonly issueCounts: Readonly<Record<IssueCode, number>>;
  readonly conflicts: readonly { rowNumber: number; text: string; fill: string | null }[];
  readonly duplicates: readonly DuplicateGroup[];
  /** Написания типа работы, не сведённые к позиции справочника. */
  readonly unresolvedTypes: readonly { spelling: string; rowNumbers: readonly number[] }[];
  readonly counts: Readonly<Record<RowAction, number>>;
}

function severityOf(row: ParsedRow): RowSeverity {
  if (row.issues.some((issue) => issue.severity === 'ERROR')) return 'ERROR';
  return row.issues.length > 0 ? 'WARNING' : 'OK';
}

/** Значения разобранной строки в том виде, в каком их хранит загрузка. */
function valuesOf(row: ParsedRow) {
  return {
    cost: row.cost.toString(),
    paid: row.paid.toString(),
    status: row.status,
    deadline: row.deadline?.toISOString() ?? null,
  };
}

/** Название транша, которым перенос заводит неоплаченный остаток договора. */
const REST_TITLE = 'Остаток по договору';

/** Маркер вместо стёртого заказчика — тот же, что у обезличивания. */
const ERASED_CUSTOMER = '[удалено по требованию субъекта]';

/** Почему строка стёртого заказчика не переносится (решение Р-252). */
export const ERASED_NOTE =
  'данные заказчика удалены по требованию субъекта — строка не переносится';

/** Почему строка оставлена на разбор, а не заведена. */
function unclearNote(candidates: number): string {
  return (
    `похожих перенесённых работ (та же дата, ФИО и тип): ${candidates}; ` +
    'какая из них эта строка, неясно — сверьте суммы в книге'
  );
}

/**
 * Прежние переносы, с которыми сверяются строки: зафиксированные строки
 * с работой и с той же основой ключа — любой из двух формул (Р-252).
 *
 * Отбор идёт по началу подписи: у прежней формулы основа стоит в начале, у
 * новой — после метки. Совпадение начала ещё не совпадение основы, поэтому
 * найденное перепроверяется точным сравнением основ.
 */
async function knownWorks(
  db: Pick<typeof prisma, 'importRow'>,
  signatures: readonly (string | null)[],
  exceptBatch: string | null,
): Promise<(KnownWork & { code: string | null })[]> {
  const bases = new Set(
    signatures.map(signatureBase).filter((base): base is string => base !== null),
  );
  if (bases.size === 0) return [];
  const found = await db.importRow.findMany({
    where: {
      projectId: { not: null },
      batch: { state: 'APPLIED' },
      ...(exceptBatch === null ? {} : { batchId: { not: exceptBatch } }),
      OR: [...bases].flatMap((base) => [
        { signature: { startsWith: `${base}|` } },
        { signature: { startsWith: `${KEY_VERSION}|${base}` } },
      ]),
    },
    select: {
      signature: true,
      parsed: true,
      projectId: true,
      rowNumber: true,
      project: { select: { code: true } },
      batch: { select: { appliedAt: true } },
    },
  });
  return found
    .filter((row) => {
      const base = signatureBase(row.signature);
      return base !== null && bases.has(base);
    })
    // Порядок фиксации, внутри загрузки — порядок строк. Номером по порядку,
    // а не произведением: миллисекунды на номер строки не помещаются в
    // точное целое, и строки одной загрузки сравнялись бы.
    .sort(
      (a, b) =>
        (a.batch.appliedAt?.getTime() ?? 0) - (b.batch.appliedAt?.getTime() ?? 0) ||
        a.rowNumber - b.rowNumber,
    )
    .map((row, order) => ({
      signature: row.signature,
      projectId: row.projectId!,
      parsed: row.parsed,
      order,
      code: row.project?.code ?? null,
    }));
}

/** Надгробия, оставленные обезличиванием для строк этой книги. */
async function erasedKeys(
  db: Pick<typeof prisma, 'importRow'>,
  signatures: readonly (string | null)[],
): Promise<Set<string>> {
  const keys = [
    ...new Set(signatures.map(erasedKey).filter((key): key is string => key !== null)),
  ];
  if (keys.length === 0) return new Set();
  const found = await db.importRow.findMany({
    where: { signature: { in: keys } },
    select: { signature: true },
    distinct: ['signature'],
  });
  return new Set(found.map((row) => row.signature!));
}

/**
 * Свести строки в отчёт. Вынесено отдельно, потому что отчёт собирается
 * дважды: сразу после разбора и при повторном открытии уже сохранённой
 * загрузки. Две отдельные сборки разошлись бы в первый же месяц.
 */
async function assemble(
  rows: readonly PreviewRow[],
): Promise<
  Pick<
    Preview,
    'totals' | 'issueCounts' | 'conflicts' | 'duplicates' | 'unresolvedTypes' | 'counts'
  >
> {
  const issueCounts = Object.fromEntries(
    (Object.keys(ISSUE_LABEL) as IssueCode[]).map((code) => [
      code,
      rows.reduce(
        (sum, row) => sum + row.issues.filter((issue) => issue.code === code).length,
        0,
      ),
    ]),
  ) as Record<IssueCode, number>;

  const conflicts = rows
    .filter((row) => row.issues.some((issue) => issue.code === 'STATUS_FILL_CONFLICT'))
    .map((row) => ({ rowNumber: row.rowNumber, text: row.rawStatus, fill: row.fill }));

  const byName = new Map<string, { spellings: Set<string>; rowNumbers: number[] }>();
  for (const row of rows) {
    // Стёртые строки ФИО не несут: в однофамильцы их не сводить.
    if (row.erased) continue;
    const key = normalizeName(row.customer);
    const group = byName.get(key) ?? { spellings: new Set<string>(), rowNumbers: [] };
    group.spellings.add(row.customer);
    group.rowNumbers.push(row.rowNumber);
    byName.set(key, group);
  }
  const existing = await prisma.clientProfile.findMany({
    where: { normalizedName: { in: [...byName.keys()] }, erasedAt: null, mergedIntoId: null },
    select: { id: true, normalizedName: true },
  });
  const existingByName = new Map(existing.map((client) => [client.normalizedName, client.id]));

  const duplicates: DuplicateGroup[] = [...byName.entries()]
    .filter(([, group]) => group.rowNumbers.length > 1)
    .map(([normalizedName, group]) => ({
      normalizedName,
      spellings: [...group.spellings],
      rowNumbers: group.rowNumbers,
      existingClientId: existingByName.get(normalizedName) ?? null,
    }));

  const unresolved = new Map<string, number[]>();
  for (const row of rows) {
    if (row.typeCode !== null || row.rawType.length === 0) continue;
    const list = unresolved.get(row.rawType) ?? [];
    list.push(row.rowNumber);
    unresolved.set(row.rawType, list);
  }

  const counts: Record<RowAction, number> = { CREATE: 0, UPDATE: 0, SKIP: 0 };
  for (const row of rows) counts[row.action] += 1;

  return {
    totals: {
      cost: rows.reduce((sum, row) => sum + row.cost, 0n),
      paid: rows.reduce((sum, row) => sum + row.paid, 0n),
    },
    issueCounts,
    conflicts,
    duplicates,
    unresolvedTypes: [...unresolved.entries()].map(([spelling, rowNumbers]) => ({
      spelling,
      rowNumbers,
    })),
    counts,
  };
}

export interface PreviewInput {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * Разобрать книгу и записать загрузку. Ни одного проекта на этом шаге не
 * создаётся: результат — отчёт, по которому руководитель принимает решение.
 */
export async function previewBook(actor: Actor, input: PreviewInput): Promise<Preview> {
  ensure(actor, 'IMPORT_RUN');

  // Таблица заливок берётся из справочника: прежде экран справочников
  // показывал её, а разбор держал два цвета в коде и таблицу не читал
  // (решение Р-216). Записи справочника перекрывают таблицу по умолчанию.
  const fills: Record<string, LegacyStatus> = { ...DEFAULT_FILLS };
  for (const color of await prisma.importColorMap.findMany()) {
    if (color.mapsTo in STATUS_LABEL) fills[color.argb.toUpperCase()] = color.mapsTo as LegacyStatus;
  }
  const book = parseBook(readWorkbook(input.bytes), fills);
  if (book.rows.length === 0) {
    throw new ImportError('EMPTY_HEADER', 'В книге не нашлось ни одной содержательной строки.');
  }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // Ранее перенесённые строки. Берутся только зафиксированные загрузки,
  // иначе брошенный предпросмотр закрывал бы строки от переноса. Сверка —
  // по основе ключа, а не по ключу целиком: так находят свои работы и
  // строки с исправленной суммой, и строки со старыми ключами (Р-252).
  const signatures = book.rows.map((row) => row.signature);
  const known = await knownWorks(prisma, signatures, null);
  const codes = new Map(known.map((work) => [work.projectId, work.code]));
  const tombs = await erasedKeys(prisma, signatures);
  const matches = matchBook(book.rows, known, tombs);

  const rows: PreviewRow[] = book.rows.map((row, index) => {
    const match = matches[index]!;
    if (match.kind === 'ERASED') {
      // Строка стёртого заказчика: ни ФИО, ни тема из книги в отчёт не
      // идут — отчёт сохраняется и открывается повторно (решение Р-252).
      return {
        rowNumber: row.rowNumber,
        signature: erasedKey(row.signature)!,
        action: 'SKIP',
        severity: 'OK',
        customer: ERASED_CUSTOMER,
        rawType: '',
        typeCode: null,
        topic: '',
        orderDate: null,
        deadline: null,
        cost: row.cost,
        paid: row.paid,
        status: row.status,
        statusLabel: STATUS_LABEL[row.status],
        rawStatus: '',
        fill: null,
        issues: [],
        existingCode: null,
        erased: true,
        note: ERASED_NOTE,
      };
    }
    const issues = row.issues.map((issue) => ({
      code: issue.code,
      label: ISSUE_LABEL[issue.code],
      note: issue.note,
    }));
    if (match.kind === 'UNCLEAR') {
      issues.push({
        code: 'PREVIOUS_WORK_UNCLEAR',
        label: ISSUE_LABEL.PREVIOUS_WORK_UNCLEAR,
        note: unclearNote(match.candidates),
      });
    }
    const action: RowAction =
      match.kind === 'KNOWN'
        ? changed(valuesOf(row), match.parsed)
          ? 'UPDATE'
          : 'SKIP'
        : 'CREATE';
    return {
      rowNumber: row.rowNumber,
      signature: row.signature,
      action,
      // Неясное соответствие — ошибка: мост оставляет такие строки
      // человеку, а фиксация их не заводит.
      severity: match.kind === 'UNCLEAR' ? 'ERROR' : severityOf(row),
      customer: row.customer,
      rawType: row.rawType,
      typeCode: row.typeCode,
      topic: row.topic,
      orderDate: row.orderDate,
      deadline: row.deadline,
      cost: row.cost,
      paid: row.paid,
      status: row.status,
      statusLabel: STATUS_LABEL[row.status],
      rawStatus: row.rawStatus,
      fill: row.fill,
      issues,
      existingCode: match.kind === 'KNOWN' ? (codes.get(match.projectId) ?? null) : null,
      erased: false,
      note: match.kind === 'UNCLEAR' ? unclearNote(match.candidates) : null,
    };
  });

  const batch = await prisma.importBatch.create({
    data: {
      fileName: input.fileName,
      sha256,
      uploadedById: actor.id,
      state: 'PREVIEWED',
      stats: {
        sheet: book.sheet,
        rows: book.rows.length,
        cost: book.totals.cost.toString(),
        paid: book.totals.paid.toString(),
        issueCounts: book.issueCounts,
        conflicts: book.conflicts.length,
      },
      rows: {
        create: book.rows.map((row, index) => {
          const match = matches[index]!;
          const preview = rows[index]!;
          // Строка стёртого заказчика хранится надгробием: ФИО и тема из
          // книги в базу снова не попадают, суммы — не персональные данные.
          if (match.kind === 'ERASED') {
            return {
              rowNumber: row.rowNumber,
              signature: preview.signature,
              raw: { erased: true },
              parsed: { erased: true, cost: row.cost.toString(), paid: row.paid.toString() },
              severity: preview.severity,
              errors: [],
              action: preview.action,
            };
          }
          return {
            rowNumber: row.rowNumber,
            signature: row.signature,
            // Исходные значения ячеек вместе с кодом заливки: разбор остаётся
            // воспроизводимым и оспоримым без обращения к самому файлу.
            raw: {
              customer: row.customer,
              type: row.rawType,
              description: row.topic,
              deadline: row.rawDeadline,
              cost: row.cost.toString(),
              paid: row.paid.toString(),
              status: row.rawStatus,
              fill: row.fill,
            },
            parsed: {
              typeCode: row.typeCode,
              orderDate: row.orderDate?.toISOString() ?? null,
              deadline: row.deadline?.toISOString() ?? null,
              cost: row.cost.toString(),
              paid: row.paid.toString(),
              status: row.status,
              normalizedName: row.normalizedName,
            },
            severity: preview.severity,
            // Строка, уже перенесённая раньше, помнит свою работу: без этого
            // «обновление» при фиксации проходило как новая строка и заводило
            // вторую работу с договором и оплатой (решение Р-233).
            projectId: match.kind === 'KNOWN' ? match.projectId : null,
            errors: preview.issues,
            action: preview.action,
          };
        }),
      },
    },
    select: { id: true },
  });

  const report = await assemble(rows);

  await record(actor, {
    action: 'IMPORT_PREVIEWED',
    objectType: 'ImportBatch',
    objectId: batch.id,
    payload: { fileName: input.fileName, rows: rows.length, counts: report.counts },
  });

  return {
    batchId: batch.id,
    fileName: input.fileName,
    sheet: book.sheet,
    state: 'PREVIEWED',
    createdAt: new Date(),
    rows,
    ...report,
  };
}

/** Прочитать сохранённую загрузку. Отчёт открывается повторно как есть. */
export async function loadBatch(actor: Actor, batchId: string): Promise<Preview | null> {
  ensure(actor, 'IMPORT_RUN');

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, fileName: true, state: true, createdAt: true, stats: true },
  });
  if (batch === null) return null;

  const stored = await prisma.importRow.findMany({
    where: { batchId },
    orderBy: { rowNumber: 'asc' },
    select: {
      rowNumber: true,
      signature: true,
      raw: true,
      parsed: true,
      errors: true,
      severity: true,
      action: true,
      project: { select: { code: true } },
    },
  });

  const rows: PreviewRow[] = stored.map((row) => {
    const raw = row.raw as {
      erased?: boolean;
      customer?: string;
      type?: string;
      description?: string;
      status?: string;
      fill?: string | null;
    } | null;
    const parsed = row.parsed as {
      typeCode?: string | null;
      orderDate?: string | null;
      deadline?: string | null;
      cost?: string;
      paid?: string;
      status?: LegacyStatus;
    } | null;
    // Стёртая строка хранит `{ erased: true }` вместо ячеек: прежде отчёт с
    // такой строкой не открывался вовсе — разбор ФИО падал на пустом месте.
    const erased = raw?.erased === true;
    const status = parsed?.status ?? 'IN_WORK';
    const issues = Array.isArray(row.errors) ? (row.errors as unknown as PreviewRow['issues']) : [];
    const unclear = issues.find((issue) => issue.code === 'PREVIOUS_WORK_UNCLEAR');
    return {
      rowNumber: row.rowNumber,
      signature: row.signature ?? '',
      action: row.action,
      severity: row.severity,
      customer: erased ? ERASED_CUSTOMER : (raw?.customer ?? ''),
      rawType: raw?.type ?? '',
      typeCode: parsed?.typeCode ?? null,
      topic: raw?.description ?? '',
      orderDate: parsed?.orderDate == null ? null : new Date(parsed.orderDate),
      deadline: parsed?.deadline == null ? null : new Date(parsed.deadline),
      cost: BigInt(parsed?.cost ?? '0'),
      paid: BigInt(parsed?.paid ?? '0'),
      status,
      statusLabel: STATUS_LABEL[status],
      rawStatus: raw?.status ?? '',
      fill: raw?.fill ?? null,
      issues,
      existingCode: row.project?.code ?? null,
      erased,
      note: erased ? ERASED_NOTE : (unclear?.note ?? null),
    };
  });

  const sheet = (batch.stats as { sheet?: string } | null)?.sheet ?? '';
  return {
    batchId: batch.id,
    fileName: batch.fileName,
    sheet,
    state: batch.state,
    createdAt: batch.createdAt,
    rows,
    ...(await assemble(rows)),
  };
}

/** Последние загрузки — история переносов на экране импорта. */
export async function listBatches(actor: Actor, limit = 20) {
  ensure(actor, 'IMPORT_RUN');
  return prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      fileName: true,
      state: true,
      createdAt: true,
      appliedAt: true,
      stats: true,
      uploadedBy: { select: { fullName: true } },
      _count: { select: { rows: true } },
    },
  });
}

export interface ApplyInput {
  /** Менеджер, за которым закрепляются перенесённые проекты. */
  readonly managerId: string;
  /** Написание типа работы → позиция справочника, для несведённых строк. */
  readonly typeOverrides?: Readonly<Record<string, string>>;
  /** Номера строк, которые руководитель исключил из переноса. */
  readonly excludeRows?: readonly number[];
}

export interface ApplyReport {
  readonly batchId: string;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly clientsCreated: number;
  readonly clientsReused: number;
  /** Строки, которые перенести не удалось, с причиной. */
  readonly rejected: readonly { rowNumber: number; reason: string }[];
  readonly totals: { readonly cost: bigint; readonly paid: bigint };
}

/**
 * Договор перенесённой работы: сумма из книги, поступление и остаток.
 * Общий для заведения работы и для правки, заставшей работу без договора.
 */
async function openContract(
  tx: Prisma.TransactionClient,
  input: {
    readonly projectId: string;
    readonly code: string;
    readonly orderDate: Date | null;
    readonly deadline: Date | null;
    readonly rowCost: bigint;
    readonly rowPaid: bigint;
  },
): Promise<void> {
  const contract = await tx.contract.create({
    data: {
      projectId: input.projectId,
      number: input.code,
      signedOn: input.orderDate,
      totalAmount: input.rowCost,
    },
    select: { id: true },
  });

  // Дата поступления в книге не ведётся, поэтому у транша её нет:
  // пустое поле честнее подставленной даты заказа.
  if (input.rowPaid > 0n) {
    await tx.tranche.create({
      data: {
        contractId: contract.id,
        title: 'Поступление по книге учёта',
        amount: input.rowPaid,
        status: 'PAID',
      },
    });
  }
  if (input.rowCost > input.rowPaid) {
    await tx.tranche.create({
      data: {
        contractId: contract.id,
        title: REST_TITLE,
        amount: input.rowCost - input.rowPaid,
        plannedDate: input.deadline,
        status: 'PLANNED',
      },
    });
  }
}

interface StoredRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly signature: string | null;
  readonly raw: unknown;
  readonly parsed: unknown;
  readonly action: RowAction;
  readonly projectId: string | null;
  readonly errors: unknown;
}

/**
 * Зафиксировать загрузку. Одна транзакция на всю книгу: половина
 * перенесённой истории хуже, чем непереносённая — по ней уже нельзя
 * понять, что именно осталось снаружи.
 */
export async function applyBatch(
  actor: Actor,
  batchId: string,
  input: ApplyInput,
): Promise<ApplyReport> {
  ensure(actor, 'IMPORT_RUN');

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, state: true, fileName: true },
  });
  if (batch === null) throw new Error('Загрузка не найдена');
  if (batch.state === 'APPLIED') throw new Error('Загрузка уже зафиксирована');
  if (batch.state !== 'PREVIEWED') throw new Error('Фиксация возможна только после предпросмотра');

  const stored = (await prisma.importRow.findMany({
    where: { batchId },
    orderBy: { rowNumber: 'asc' },
    select: {
      id: true,
      rowNumber: true,
      signature: true,
      raw: true,
      parsed: true,
      action: true,
      projectId: true,
      errors: true,
    },
  })) as StoredRow[];

  const types = await prisma.serviceType.findMany({ select: { id: true, code: true } });
  const typeByCode = new Map(types.map((type) => [type.code, type.id]));

  const excluded = new Set(input.excludeRows ?? []);
  const rejected: { rowNumber: number; reason: string }[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let clientsCreated = 0;
  let clientsReused = 0;
  let cost = 0n;
  let paid = 0n;

  await prisma.$transaction(
    async (tx) => {
      // Фиксации идут по одной: две загрузки одной книги, применённые
      // разом, не видели бы строк друг друга и завели бы каждую работу
      // дважды (решение Р-233).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('import-apply'))`;

      // Загрузка захватывается условием на её состояние: второе нажатие
      // «Зафиксировать» ждёт первого и находит её уже зафиксированной.
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, state: 'PREVIEWED' },
        data: { state: 'APPLIED', appliedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error('Загрузка уже зафиксирована');

      // Действие строки сверяется заново с тем, что перенесено к этой
      // минуте, а не берётся из предпросмотра: между ними могла быть
      // зафиксирована другая загрузка той же книги, а заказчик — стёрт по
      // требованию субъекта. Сверка та же, что в предпросмотре (Р-252).
      const signatures = stored.map((row) => row.signature);
      const known = await knownWorks(tx, signatures, batchId);
      const tombs = await erasedKeys(tx, signatures);
      const matches = matchBook(
        stored.map((row) => ({
          signature: row.signature,
          cost: BigInt((row.parsed as { cost?: string } | null)?.cost ?? '0'),
        })),
        known,
        tombs,
      );

      const clients = new Map<string, string>();

      for (const [index, row] of stored.entries()) {
        const match: RowMatch = matches[index]!;
        // Строка, стёртая прежним обезличиванием, ключа не имеет вовсе, а
        // ячеек в ней нет: заводить по ней нечего (решение Р-252).
        const wiped = (row.raw as { erased?: unknown } | null)?.erased === true;
        if (match.kind === 'ERASED' || wiped) {
          // Заказчик стёрт — строка не заводит работу никогда, а её ячейки
          // заменяются надгробием и здесь, если стирание пришлось между
          // предпросмотром и фиксацией.
          const tomb = row.signature?.startsWith(ERASED_KEY_PREFIX) ? row.signature : erasedKey(row.signature);
          const amounts = row.parsed as { cost?: string; paid?: string } | null;
          await tx.importRow.update({
            where: { id: row.id },
            data: {
              action: 'SKIP',
              signature: tomb,
              raw: { erased: true },
              parsed: { erased: true, cost: amounts?.cost ?? '0', paid: amounts?.paid ?? '0' },
              errors: [],
              projectId: null,
            },
          });
          skipped += 1;
          continue;
        }

        const raw = row.raw as {
          customer: string;
          type: string;
          description: string;
          status: string;
        };
        const parsed = row.parsed as {
          typeCode: string | null;
          orderDate: string | null;
          deadline: string | null;
          cost: string;
          paid: string;
          status: LegacyStatus;
          normalizedName: string;
        };

        const action: RowAction =
          match.kind === 'KNOWN'
            ? changed({ ...parsed, deadline: parsed.deadline ?? null }, match.parsed)
              ? 'UPDATE'
              : 'SKIP'
            : 'CREATE';
        const projectId = match.kind === 'KNOWN' ? match.projectId : null;

        if (excluded.has(row.rowNumber) || action === 'SKIP') {
          if (action === 'SKIP' && projectId !== null) {
            await tx.importRow.update({ where: { id: row.id }, data: { action, projectId } });
          } else if (row.projectId !== null) {
            // Исключённая правка не внесена — и строка не должна помнить
            // работу: иначе следующая сверка взяла бы её значения за уже
            // перенесённые и правку пропустила бы (решение Р-252).
            await tx.importRow.update({ where: { id: row.id }, data: { projectId: null } });
          }
          skipped += 1;
          continue;
        }

        const codes = Array.isArray(row.errors)
          ? (row.errors as { code?: string }[]).map((error) => error.code)
          : [];
        // Строка похожа на несколько перенесённых работ сразу либо две
        // строки — на одну: заводить её значило бы рискнуть второй работой
        // с договором и оплатой (решение Р-252). Разбирает человек.
        if (match.kind === 'UNCLEAR') {
          rejected.push({ rowNumber: row.rowNumber, reason: unclearNote(match.candidates) });
          await tx.importRow.update({
            where: { id: row.id },
            data: { action: 'SKIP', severity: 'ERROR', projectId: null },
          });
          continue;
        }
        // Нечитаемая сумма — не ноль: без договора оплата по строке
        // потерялась бы. Строка не переносится, пока её не поправят в книге.
        if (codes.includes('AMOUNT_UNREADABLE')) {
          rejected.push({ rowNumber: row.rowNumber, reason: 'сумма в книге не читается' });
          await tx.importRow.update({
            where: { id: row.id },
            data: { action: 'SKIP', severity: 'ERROR', projectId: null },
          });
          continue;
        }

        const rowCost = BigInt(parsed.cost);
        const rowPaid = BigInt(parsed.paid);
        const orderDate = parsed.orderDate === null ? null : new Date(parsed.orderDate);
        const deadline = parsed.deadline === null ? null : new Date(parsed.deadline);
        const status = PROJECT_STATUS[parsed.status];

        if (action === 'UPDATE' && projectId !== null) {
          // Изменившаяся строка: поправляются состояние, сроки и сумма
          // договора. Транши, внесённые руками, не трогаются; из книги
          // доносится только разница оплаты — отдельным поступлением, — и
          // остаток, заведённый прошлым переносом, пересчитывается под новую
          // сумму. Прежде разница оплаты шла в итог загрузки, но в базу не
          // попадала (решение Р-233).
          await tx.project.update({
            where: { id: projectId },
            data: {
              status,
              dueOn: deadline,
              closedOn: status === 'COMPLETED' ? (deadline ?? orderDate) : null,
            },
          });
          const contract = await tx.contract.findFirst({
            where: { projectId },
            select: { id: true, tranches: { select: { id: true, title: true, amount: true, status: true } } },
          });
          // Работа заведена с нулевой суммой, и договора у неё нет, а в книге
          // сумму проставили: договор заводится так же, как при заведении
          // работы. Прежде такая правка до базы не доходила (решение Р-252).
          if (contract === null && rowCost > 0n) {
            const { code } = await tx.project.findUniqueOrThrow({
              where: { id: projectId },
              select: { code: true },
            });
            await openContract(tx, { projectId, code, orderDate, deadline, rowCost, rowPaid });
            paid += rowPaid;
          }
          if (contract !== null) {
            await tx.contract.update({ where: { id: contract.id }, data: { totalAmount: rowCost } });
            const paidSoFar = contract.tranches
              .filter((tranche) => tranche.status === 'PAID')
              .reduce((sum, tranche) => sum + tranche.amount, 0n);
            let received = 0n;
            if (rowPaid > paidSoFar) {
              received = rowPaid - paidSoFar;
              await tx.tranche.create({
                data: {
                  contractId: contract.id,
                  title: 'Поступление по книге учёта',
                  amount: received,
                  status: 'PAID',
                },
              });
            }
            const rest = contract.tranches.find(
              (tranche) => tranche.title === REST_TITLE && tranche.status === 'PLANNED',
            );
            const others = contract.tranches
              .filter((tranche) => tranche.id !== rest?.id)
              .reduce((sum, tranche) => sum + tranche.amount, 0n);
            const left = rowCost - others - received;
            if (rest !== undefined) {
              if (left > 0n) {
                await tx.tranche.update({ where: { id: rest.id }, data: { amount: left } });
              } else {
                await tx.tranche.delete({ where: { id: rest.id } });
              }
            } else if (left > 0n) {
              // Остаток был погашен и снят, а сумму в книге подняли: без
              // нового остатка разница не стояла бы ни в одном плане
              // (решение Р-252).
              await tx.tranche.create({
                data: {
                  contractId: contract.id,
                  title: REST_TITLE,
                  amount: left,
                  plannedDate: deadline,
                  status: 'PLANNED',
                },
              });
            }
            paid += received;
          }
          await tx.importRow.update({ where: { id: row.id }, data: { action, projectId } });
          updated += 1;
          cost += rowCost;
          continue;
        }

        // Позиция справочника нужна только новой работе: у перенесённой она
        // уже есть. Прежде проверка стояла до обновления, и правка суммы в
        // строке с несведённым написанием отклонялась при каждом прогоне
        // моста — он замен написаний не передаёт (решение Р-252).
        const override = input.typeOverrides?.[raw.type];
        const serviceTypeId =
          override ?? (parsed.typeCode === null ? undefined : typeByCode.get(parsed.typeCode));
        if (serviceTypeId === undefined) {
          rejected.push({
            rowNumber: row.rowNumber,
            reason: `написание «${raw.type}» не сведено к позиции справочника`,
          });
          await tx.importRow.update({
            where: { id: row.id },
            data: { action: 'SKIP', severity: 'ERROR', projectId: null },
          });
          continue;
        }

        // Карточка клиента — тоже только новой работе. Прежде она искалась до
        // обновления, и правка строки, чья карточка сведена в другую,
        // заводила пустую карточку с тем же ФИО (решение Р-252).
        // Учётная запись при переносе не заводится
        // (решение Р-133) — историческим клиентам вход не открывается,
        // и рассылки им не уходят.
        let clientId = clients.get(parsed.normalizedName);
        if (clientId === undefined) {
          const existing = await tx.clientProfile.findFirst({
            where: {
              normalizedName: parsed.normalizedName,
              erasedAt: null,
              mergedIntoId: null,
            },
            select: { id: true },
          });
          if (existing === null) {
            const client = await tx.clientProfile.create({
              data: { fullName: raw.customer, normalizedName: parsed.normalizedName },
              select: { id: true },
            });
            clientId = client.id;
            clientsCreated += 1;
          } else {
            clientId = existing.id;
            clientsReused += 1;
          }
          clients.set(parsed.normalizedName, clientId);
        }

        // Код выдаётся по году заказа, а не по текущему: перенесённая
        // история должна читаться в своей хронологии.
        const year = orderDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
        const code = await nextProjectCode(tx as never, year);

        const project = await tx.project.create({
          data: {
            code,
            clientId,
            serviceTypeId,
            title: raw.type.length > 0 ? raw.type : 'Работа по книге учёта',
            topic: raw.description.length > 0 ? raw.description : null,
            managerId: input.managerId,
            status,
            source: 'IMPORT',
            startedOn: orderDate,
            dueOn: deadline,
            closedOn: status === 'COMPLETED' ? (deadline ?? orderDate) : null,
          },
          select: { id: true },
        });

        if (rowCost > 0n) {
          await openContract(tx, { projectId: project.id, code, orderDate, deadline, rowCost, rowPaid });
        }

        await tx.importRow.update({
          where: { id: row.id },
          data: { projectId: project.id, action: 'CREATE' },
        });
        created += 1;
        cost += rowCost;
        paid += rowPaid;
      }

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          stats: {
            created,
            updated,
            skipped,
            rejected: rejected.length,
            cost: cost.toString(),
            paid: paid.toString(),
          },
        },
      });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  await record(actor, {
    action: 'IMPORT_APPLIED',
    objectType: 'ImportBatch',
    objectId: batchId,
    payload: { fileName: batch.fileName, created, updated, skipped, rejected: rejected.length },
  });

  return {
    batchId,
    created,
    updated,
    skipped,
    clientsCreated,
    clientsReused,
    rejected,
    totals: { cost, paid },
  };
}

/**
 * Свести две карточки клиента. Разное написание одного ФИО — случай
 * исходной книги («Набиль АльзалзалиНадир Таррад» и «Набиль Альзалзали
 * Надир Таррад» — один человек), и машинно оно не различимо от однофамильцев.
 * Поэтому сведение — ручное действие руководителя, а не правило разбора.
 */
export async function mergeClients(
  actor: Actor,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number }> {
  ensure(actor, 'IMPORT_RUN');
  if (sourceId === targetId) throw new Error('Карточка сводится сама с собой');

  const card = { id: true, erasedAt: true, mergedIntoId: true, userId: true } as const;
  const [source, target] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { id: sourceId }, select: card }),
    prisma.clientProfile.findUnique({ where: { id: targetId }, select: card }),
  ]);
  if (source === null || target === null) throw new Error('Карточка не найдена');
  // Сводятся только живые карточки. Прежде проверок не было: сведение
  // A→B, а затем B→A выводило обе карточки из всех перечней, и требование
  // об удалении исполнить было не по чему; обезличенная карточка получала
  // работы с живыми данными (решение Р-245).
  if (source.erasedAt !== null || target.erasedAt !== null) {
    throw new Error('Обезличенная карточка не сводится');
  }
  if (source.mergedIntoId !== null || target.mergedIntoId !== null) {
    throw new Error('Карточка уже сведена в другую');
  }
  // У карточки с учётной записью клиент входит в кабинет: после сведения
  // он потерял бы все свои работы — видит он работы своей карточки.
  if (source.userId !== null) {
    throw new Error('У сводимой карточки есть вход в кабинет: сводите в неё, а не её');
  }

  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { clientId: sourceId },
      data: { clientId: targetId },
    });
    // Карточка не удаляется: на неё могут ссылаться журналы и требования
    // об удалении данных субъекта.
    await tx.clientProfile.update({
      where: { id: sourceId },
      data: { mergedIntoId: targetId },
    });
    return count;
  });

  await record(actor, {
    action: 'CLIENT_MERGED',
    objectType: 'ClientProfile',
    objectId: sourceId,
    payload: { into: targetId, projects: moved },
  });
  return { moved };
}

/**
 * Карточки, похожие на одного человека: одинаковое ФИО без пробелов и
 * с «ё» как «е» — «АльзалзалиНадир» и «Альзалзали Надир».
 *
 * Прежде блок сведения показывался по совпадению ФИО в книге — а такие
 * строки при переносе и так ложатся на одну карточку, — и просил ввести
 * идентификаторы карточек, которые нигде не выводятся (решение Р-245).
 */
export async function mergeCandidates(actor: Actor) {
  ensure(actor, 'IMPORT_RUN');
  const cards = await prisma.clientProfile.findMany({
    where: { erasedAt: null, mergedIntoId: null },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fullName: true,
      normalizedName: true,
      userId: true,
      _count: { select: { projects: true } },
    },
  });
  const groups = new Map<string, typeof cards>();
  for (const card of cards) {
    const key = card.normalizedName.replace(/ё/gu, 'е').replace(/\s+/gu, '');
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  return [...groups.values()]
    .filter((list) => list.length > 1)
    .map((list) =>
      list.map((card) => ({
        id: card.id,
        fullName: card.fullName,
        projects: card._count.projects,
        hasAccount: card.userId !== null,
      })),
    );
}

/** Приведение написания ФИО к виду поиска — тем же правилом, что и разбор. */
export { normalizeName };
