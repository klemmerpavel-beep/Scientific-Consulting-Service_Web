/**
 * Перенос книги заказов в систему: предпросмотр и фиксация.
 *
 * Фиксация без предпросмотра невозможна по устройству: `applyBatch`
 * принимает не файл, а идентификатор уже разобранной загрузки. Разбор
 * исторических данных необратим по последствиям — проекты получают коды,
 * и отменять их задним числом хуже, чем показать отчёт до записи.
 *
 * Кода заказа в книге нет, поэтому повторность определяется естественным
 * ключом строки (`ParsedRow.signature`): дата, ФИО, написание типа работы
 * и сумма. Ключ хранится в `ImportRow.signature`, и повторная загрузка того
 * же файла даёт строки со значением `SKIP`, а не новые проекты.
 */

import { createHash } from 'node:crypto';

import { prisma } from '../../db.ts';
import { ensure, type Actor } from '../access.ts';
import { record } from '../audit.ts';
import { nextProjectCode } from '../projects.ts';
import {
  ISSUE_LABEL,
  STATUS_LABEL,
  normalizeName,
  parseBook,
  type IssueCode,
  type LegacyStatus,
  type ParsedRow,
} from './etl.ts';
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

/** Сравнение с ранее перенесённой строкой: изменились ли деньги или состояние. */
function differs(row: ParsedRow, previous: { parsed: unknown }): boolean {
  const before = previous.parsed as { cost?: string; paid?: string; status?: string } | null;
  if (before === null || before === undefined) return true;
  return (
    before.cost !== row.cost.toString() ||
    before.paid !== row.paid.toString() ||
    before.status !== row.status
  );
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

  const book = parseBook(readWorkbook(input.bytes));
  if (book.rows.length === 0) {
    throw new ImportError('EMPTY_HEADER', 'В книге не нашлось ни одной содержательной строки.');
  }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // Ранее перенесённые строки: ключ → проект. Берутся только зафиксированные
  // загрузки, иначе брошенный предпросмотр закрывал бы строки от переноса.
  const applied = await prisma.importRow.findMany({
    where: {
      signature: { in: book.rows.map((row) => row.signature) },
      projectId: { not: null },
      batch: { state: 'APPLIED' },
    },
    select: { signature: true, parsed: true, project: { select: { id: true, code: true } } },
  });
  const seen = new Map(applied.map((row) => [row.signature ?? '', row]));

  const rows: PreviewRow[] = book.rows.map((row) => {
    const previous = seen.get(row.signature);
    const action: RowAction =
      previous === undefined ? 'CREATE' : differs(row, previous) ? 'UPDATE' : 'SKIP';
    return {
      rowNumber: row.rowNumber,
      signature: row.signature,
      action,
      severity: severityOf(row),
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
      issues: row.issues.map((issue) => ({
        code: issue.code,
        label: ISSUE_LABEL[issue.code],
        note: issue.note,
      })),
      existingCode: previous?.project?.code ?? null,
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
        create: book.rows.map((row, index) => ({
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
          severity: rows[index]!.severity,
          errors: row.issues.map((issue) => ({
            code: issue.code,
            label: ISSUE_LABEL[issue.code],
            note: issue.note,
          })),
          action: rows[index]!.action,
        })),
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
      customer: string;
      type: string;
      description: string;
      status: string;
      fill: string | null;
    };
    const parsed = row.parsed as {
      typeCode: string | null;
      orderDate: string | null;
      deadline: string | null;
      cost: string;
      paid: string;
      status: LegacyStatus;
    } | null;
    const status = parsed?.status ?? 'IN_WORK';
    return {
      rowNumber: row.rowNumber,
      signature: row.signature ?? '',
      action: row.action,
      severity: row.severity,
      customer: raw.customer,
      rawType: raw.type,
      typeCode: parsed?.typeCode ?? null,
      topic: raw.description,
      orderDate: parsed?.orderDate == null ? null : new Date(parsed.orderDate),
      deadline: parsed?.deadline == null ? null : new Date(parsed.deadline),
      cost: BigInt(parsed?.cost ?? '0'),
      paid: BigInt(parsed?.paid ?? '0'),
      status,
      statusLabel: STATUS_LABEL[status],
      rawStatus: raw.status,
      fill: raw.fill,
      issues: (row.errors ?? []) as unknown as PreviewRow['issues'],
      existingCode: row.project?.code ?? null,
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

interface StoredRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly signature: string | null;
  readonly raw: unknown;
  readonly parsed: unknown;
  readonly action: RowAction;
  readonly projectId: string | null;
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
      const clients = new Map<string, string>();

      for (const row of stored) {
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

        if (excluded.has(row.rowNumber) || row.action === 'SKIP') {
          skipped += 1;
          continue;
        }

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
            data: { action: 'SKIP', severity: 'ERROR' },
          });
          continue;
        }

        const rowCost = BigInt(parsed.cost);
        const rowPaid = BigInt(parsed.paid);
        const orderDate = parsed.orderDate === null ? null : new Date(parsed.orderDate);
        const deadline = parsed.deadline === null ? null : new Date(parsed.deadline);
        const status = PROJECT_STATUS[parsed.status];

        // Карточка клиента: учётная запись при переносе не заводится
        // (решение Р-131) — историческим клиентам вход не открывается,
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

        if (row.action === 'UPDATE' && row.projectId !== null) {
          // Изменившаяся строка: поправляются состояние, сроки и сумма
          // договора. Транши не переписываются — по ним могли пройти
          // ручные правки менеджера, и они старше книги.
          await tx.project.update({
            where: { id: row.projectId },
            data: {
              status,
              dueOn: deadline,
              closedOn: status === 'COMPLETED' ? (deadline ?? orderDate) : null,
            },
          });
          await tx.contract.updateMany({
            where: { projectId: row.projectId },
            data: { totalAmount: rowCost },
          });
          updated += 1;
          cost += rowCost;
          paid += rowPaid;
          continue;
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
          const contract = await tx.contract.create({
            data: {
              projectId: project.id,
              number: code,
              signedOn: orderDate,
              totalAmount: rowCost,
            },
            select: { id: true },
          });

          // Дата поступления в книге не ведётся, поэтому у транша её нет:
          // пустое поле честнее подставленной даты заказа.
          if (rowPaid > 0n) {
            await tx.tranche.create({
              data: {
                contractId: contract.id,
                title: 'Поступление по книге учёта',
                amount: rowPaid,
                status: 'PAID',
              },
            });
          }
          if (rowCost > rowPaid) {
            await tx.tranche.create({
              data: {
                contractId: contract.id,
                title: 'Остаток по договору',
                amount: rowCost - rowPaid,
                plannedDate: deadline,
                status: 'PLANNED',
              },
            });
          }
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
          state: 'APPLIED',
          appliedAt: new Date(),
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

  const [source, target] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { id: sourceId }, select: { id: true } }),
    prisma.clientProfile.findUnique({ where: { id: targetId }, select: { id: true } }),
  ]);
  if (source === null || target === null) throw new Error('Карточка не найдена');

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

/** Приведение написания ФИО к виду поиска — тем же правилом, что и разбор. */
export { normalizeName };
