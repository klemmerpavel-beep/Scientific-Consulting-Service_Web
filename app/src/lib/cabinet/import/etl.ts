import type { Row, Sheet } from './xlsx.ts';
import { ImportError } from './zip.ts';

/**
 * Приведение книги заказов к виду, пригодному для записи.
 *
 * Модуль не знает ни о базе, ни о правах: на входе разобранный лист, на
 * выходе строки со значениями и перечнем замечаний. Поэтому он проверяется
 * тестами построчно, на настоящих формулировках из книги.
 *
 * Шесть классов замечаний выведены из реального файла, а не придуманы:
 * в нём 30 написаний типа работы на 11 позиций, 22 написания статуса,
 * две несуществующие даты, четыре срока без года, одна переплата и
 * одиннадцать групп однофамильцев, часть которых — один и тот же человек.
 */

export type IssueCode =
  | 'UNKNOWN_SUPPORT_TYPE'
  | 'UNPARSED_DEADLINE'
  | 'NONEXISTENT_DATE'
  | 'DEADLINE_WITHOUT_YEAR'
  | 'PAYMENT_EXCEEDS_CONTRACT'
  | 'CLOSED_WITH_OUTSTANDING_BALANCE'
  | 'DUPLICATE_CLIENT_BY_NAME'
  | 'STATUS_FILL_CONFLICT';

export type Severity = 'ERROR' | 'WARNING';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: Severity;
  /** Колонка книги, к которой относится замечание. */
  readonly column: string | null;
  readonly note: string;
}

export const ISSUE_LABEL: Record<IssueCode, string> = {
  UNKNOWN_SUPPORT_TYPE: 'Нераспознанный тип сопровождения',
  UNPARSED_DEADLINE: 'Нераспознанный формат срока',
  NONEXISTENT_DATE: 'Несуществующая дата',
  DEADLINE_WITHOUT_YEAR: 'Срок без года',
  PAYMENT_EXCEEDS_CONTRACT: 'Оплата больше суммы договора',
  CLOSED_WITH_OUTSTANDING_BALANCE: 'Закрытая работа с непогашенным остатком',
  DUPLICATE_CLIENT_BY_NAME: 'Дубль клиента по ФИО',
  STATUS_FILL_CONFLICT: 'Текст статуса расходится с заливкой',
};

/** Состояние работы, выведенное из книги. */
export type LegacyStatus = 'CLOSED' | 'IN_WORK' | 'ON_START' | 'STOPPED';

export const STATUS_LABEL: Record<LegacyStatus, string> = {
  CLOSED: 'закрыт',
  IN_WORK: 'в работе',
  ON_START: 'на старте',
  STOPPED: 'остановлен',
};

// ─────────────────────────── Заголовок ──────────────────────────────────────

const HEADER_PATTERNS: Record<string, RegExp> = {
  date: /^дата$|дата заказа|дата обращ/iu,
  customer: /заказчик|фио|клиент/iu,
  type: /тип работ|вид работ|^тип/iu,
  description: /описан|тема|примечан/iu,
  deadline: /дедлайн|срок сдачи|^срок$/iu,
  cost: /стоимост|прибыл/iu,
  status: /стат[уо]тус|статус/iu,
  paid: /оплачен|оплата/iu,
};

export type ColumnMap = Partial<Record<keyof typeof HEADER_PATTERNS, string>>;

/**
 * Найти строку заголовка и сопоставить колонки. Ищем среди первых восьми
 * строк: в книге бывает шапка с названием и пустая строка перед таблицей.
 */
export function findHeader(sheet: Sheet): { row: number; columns: ColumnMap } {
  let best: { row: number; columns: ColumnMap; hits: number } | null = null;

  for (const row of sheet.rows.slice(0, 8)) {
    const columns: ColumnMap = {};
    let hits = 0;
    for (const [column, cell] of Object.entries(row.cells)) {
      const text = cell.value.trim();
      if (text.length === 0) continue;
      for (const [key, pattern] of Object.entries(HEADER_PATTERNS)) {
        if (columns[key as keyof ColumnMap] === undefined && pattern.test(text)) {
          columns[key as keyof ColumnMap] = column;
          hits += 1;
          break;
        }
      }
    }
    if (best === null || hits > best.hits) best = { row: row.number, columns, hits };
  }

  if (best === null || best.hits < 3 || best.columns.customer === undefined || best.columns.cost === undefined) {
    throw new ImportError(
      'EMPTY_HEADER',
      'В книге не найдены обязательные колонки: заказчик и стоимость. ' +
        'Проверьте, что открыт лист с таблицей заказов.',
    );
  }
  return { row: best.row, columns: best.columns };
}

// ─────────────────────────── Типы работ ─────────────────────────────────────

/**
 * Сведение написания типа работы к позиции справочника. Порядок правил
 * важен: частное идёт раньше общего, иначе «пакет аспирантуры» попадёт
 * в «диссертацию» по слову «диссертационный».
 *
 * Усечённые основы — не небрежность, а способ поймать опечатки исходника:
 * «диссертция», «аспирнтура», «презентаци» встречаются в книге как есть.
 */
const TYPE_RULES: readonly [RegExp, string][] = [
  [/аспир|аспирн/iu, 'postgrad'],
  [/диссерт|диссертц|докторск/iu, 'dissertation'],
  [/консалт|консульт|сопровожд|до защит/iu, 'consulting'],
  [/ниокр|нир|окр|отчет|отчёт|презентац/iu, 'research'],
  [/стать|рерайт|обзорн|патент/iu, 'article'], // текст-гуард: не текст интерфейса — свод написаний книги
  [/диплом|специалитет|бакалавр|магистр/iu, 'diploma'],
];

export function classifyType(raw: string): string | null {
  const text = raw.toLowerCase().replace(/ё/g, 'е').trim();
  if (text.length === 0) return null;
  for (const [pattern, code] of TYPE_RULES) if (pattern.test(text)) return code;
  return null;
}

// ─────────────────────────── Даты ───────────────────────────────────────────

/** Начало отсчёта Excel. 1900-й в нём високосный по ошибке — отсюда 30 декабря. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const MONTHS: readonly [RegExp, number][] = [
  [/^январ/iu, 0],
  [/^феврал/iu, 1],
  [/^март/iu, 2],
  [/^апрел/iu, 3],
  [/^ма[йя]/iu, 4],
  [/^июн/iu, 5],
  [/^июл/iu, 6],
  [/^август/iu, 7],
  [/^сентябр/iu, 8],
  [/^октябр/iu, 9],
  [/^ноябр/iu, 10],
  [/^декабр/iu, 11],
];

export interface ParsedDate {
  readonly date: Date | null;
  readonly issues: readonly Issue[];
}

function monthOf(word: string): number | null {
  for (const [pattern, index] of MONTHS) if (pattern.test(word)) return index;
  return null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Разбор срока. Форматов в книге шесть: серийное число Excel, точечная
 * запись, русский текст с годом и без, с приписками «г.» и «года».
 *
 * Несуществующий день не отбрасывается, а приводится к последнему дню
 * месяца с пометкой: «31 апреля» означает «конец апреля», и терять такую
 * строку целиком было бы хуже, чем записать её с замечанием.
 */
export function parseDeadline(raw: string, orderDate: Date | null): ParsedDate {
  const text = raw.trim();
  if (text.length === 0) return { date: null, issues: [] };

  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    return { date: new Date(EXCEL_EPOCH + Math.round(Number(text)) * 86_400_000), issues: [] };
  }

  const numeric = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (numeric !== null) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    if (month < 0 || month > 11) {
      return {
        date: null,
        issues: [{ code: 'UNPARSED_DEADLINE', severity: 'ERROR', column: null, note: text }],
      };
    }
    const last = daysInMonth(year, month);
    if (day > last) {
      return {
        date: new Date(Date.UTC(year, month, last)),
        issues: [
          {
            code: 'NONEXISTENT_DATE',
            severity: 'WARNING',
            column: null,
            note: `«${text}» — в месяце ${last} дн., срок отнесён на последний день`,
          },
        ],
      };
    }
    return { date: new Date(Date.UTC(year, month, day)), issues: [] };
  }

  const verbal = text.match(/^(\d{1,2})\s+([А-Яа-яЁё]+)\s*(\d{4})?\s*(?:г\.?|года)?$/u);
  if (verbal !== null) {
    const day = Number(verbal[1]);
    const month = monthOf(verbal[2]);
    if (month === null) {
      return {
        date: null,
        issues: [{ code: 'UNPARSED_DEADLINE', severity: 'ERROR', column: null, note: text }],
      };
    }

    const issues: Issue[] = [];
    let year = verbal[3] === undefined ? null : Number(verbal[3]);
    if (year === null) {
      // Года нет — берём год заказа; если срок при этом оказался раньше
      // самого заказа, значит имелся в виду следующий год.
      const base = orderDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
      year = base;
      const candidate = Date.UTC(year, month, Math.min(day, daysInMonth(year, month)));
      if (orderDate !== null && candidate < orderDate.getTime()) year += 1;
      issues.push({
        code: 'DEADLINE_WITHOUT_YEAR',
        severity: 'WARNING',
        column: null,
        note: `«${text}» — год восстановлен как ${year}`,
      });
    }

    const last = daysInMonth(year, month);
    if (day > last) {
      issues.push({
        code: 'NONEXISTENT_DATE',
        severity: 'WARNING',
        column: null,
        note: `«${text}» — в месяце ${last} дн., срок отнесён на последний день`,
      });
      return { date: new Date(Date.UTC(year, month, last)), issues };
    }
    return { date: new Date(Date.UTC(year, month, day)), issues };
  }

  return {
    date: null,
    issues: [{ code: 'UNPARSED_DEADLINE', severity: 'ERROR', column: null, note: text }],
  };
}

// ─────────────────────────── Состояние работы ───────────────────────────────

const STATUS_RULES: readonly [RegExp, LegacyStatus][] = [
  [/остановл|заморож|пауз|приостановл/iu, 'STOPPED'],
  [/законч|закрыт|сделан|готов|выполн|сдан|принято/iu, 'CLOSED'],
  [/на старте|^старт|заказ на/iu, 'ON_START'],
  [/в работ|в процесс|черновик/iu, 'IN_WORK'],
];

/** Заливка исходной книги: зелёная — «работа доведена», красная — «остановлена». */
const GREEN_FILL = 'FF00B050';
const RED_FILL = 'FFFF0000';

/**
 * Состояние работы по тексту и заливке.
 *
 * Ведущим признаком принят **текст**, заливка — уточняющим. В исходной книге
 * зелёным помечены и закрытые работы, и девять строк со статусом «в работе»:
 * доверие цвету дало бы 46 закрытых работ вместо фактических 37. Красная
 * заливка однозначнее — ею размечены остановленные работы, и она перекрывает
 * текст.
 *
 * Расхождение цвета с текстом не исправляется молча ни в ту, ни в другую
 * сторону: состояние берётся по описанному правилу, а сама строка попадает
 * в отдельный перечень предпросмотра. Разметка цветом велась вручную, и
 * выбор между «работа доведена» и «работа идёт» — за руководителем, а не
 * за разбором.
 */
export function classifyStatus(
  text: string,
  fill: string | null,
): { status: LegacyStatus; conflict: boolean } {
  let byText: LegacyStatus | null = null;
  for (const [pattern, status] of STATUS_RULES) {
    if (pattern.test(text)) {
      byText = status;
      break;
    }
  }

  if (fill === RED_FILL) {
    return { status: 'STOPPED', conflict: byText !== null && byText !== 'STOPPED' };
  }
  if (fill === GREEN_FILL) {
    const status = byText ?? 'CLOSED';
    return { status, conflict: byText !== null && byText !== 'CLOSED' };
  }
  if (byText !== null) return { status: byText, conflict: false };
  return { status: 'IN_WORK', conflict: false };
}

// ─────────────────────────── Строка ─────────────────────────────────────────

export interface ParsedRow {
  readonly rowNumber: number;
  readonly orderDate: Date | null;
  readonly customer: string;
  readonly normalizedName: string;
  readonly rawType: string;
  readonly typeCode: string | null;
  readonly topic: string;
  readonly rawDeadline: string;
  readonly deadline: Date | null;
  readonly cost: bigint;
  readonly paid: bigint;
  readonly rawStatus: string;
  readonly status: LegacyStatus;
  readonly fill: string | null;
  /** Естественный ключ строки: кода заказа в книге нет. */
  readonly signature: string;
  readonly issues: readonly Issue[];
}

/** Приведение ФИО к виду, пригодному для поиска однофамильцев. */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\-_,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(raw: string): bigint {
  const normalized = raw.replace(/ /g, '').replace(/[^\d.,-]/g, '').replace(',', '.');
  if (normalized.length === 0) return 0n;
  const value = Number(normalized);
  return Number.isFinite(value) ? BigInt(Math.round(value * 100)) : 0n;
}

function cellOf(row: Row, column: string | undefined): { value: string; fill: string | null } {
  if (column === undefined) return { value: '', fill: null };
  const cell = row.cells[column];
  return { value: cell?.value ?? '', fill: cell?.fill ?? null };
}

export function parseRow(row: Row, columns: ColumnMap): ParsedRow | null {
  const customer = cellOf(row, columns.customer).value.trim();
  if (customer.length === 0) return null;

  const issues: Issue[] = [];

  const rawDate = cellOf(row, columns.date).value.trim();
  const orderDate = /^\d{4,6}(\.\d+)?$/.test(rawDate)
    ? new Date(EXCEL_EPOCH + Math.round(Number(rawDate)) * 86_400_000)
    : null;

  const rawType = cellOf(row, columns.type).value.trim();
  const typeCode = classifyType(rawType);
  if (typeCode === null && rawType.length > 0) {
    issues.push({
      code: 'UNKNOWN_SUPPORT_TYPE',
      severity: 'WARNING',
      column: columns.type ?? null,
      note: `«${rawType}» не сведено к позиции справочника`,
    });
  }

  const rawDeadline = cellOf(row, columns.deadline).value.trim();
  const deadline = parseDeadline(rawDeadline, orderDate);
  for (const issue of deadline.issues) {
    issues.push({ ...issue, column: columns.deadline ?? null });
  }

  const cost = money(cellOf(row, columns.cost).value);
  const paid = money(cellOf(row, columns.paid).value);
  if (paid > cost) {
    issues.push({
      code: 'PAYMENT_EXCEEDS_CONTRACT',
      severity: 'ERROR',
      column: columns.paid ?? null,
      note: `оплачено больше стоимости на ${Number(paid - cost) / 100} ₽`,
    });
  }

  const statusCell = cellOf(row, columns.status);
  const fill = statusCell.fill ?? cellOf(row, columns.customer).fill;
  const rawStatus = statusCell.value.trim();
  const { status, conflict } = classifyStatus(rawStatus, fill);

  if (status === 'CLOSED' && paid < cost) {
    issues.push({
      code: 'CLOSED_WITH_OUTSTANDING_BALANCE',
      severity: 'WARNING',
      column: columns.paid ?? null,
      note: `работа закрыта, остаток ${Number(cost - paid) / 100} ₽`,
    });
  }

  // Ключ строится по исходному написанию типа, а не по сведённому коду:
  // «Отчёт НИР» и «Презентация по отчёту НИР» сводятся к одной позиции
  // справочника, но это два разных заказа, и в книге они стоят рядом — с
  // одним клиентом, одной датой и одной суммой.
  const signature = [
    rawDate,
    normalizeName(customer),
    normalizeName(rawType),
    cost.toString(),
  ].join('|');

  return {
    rowNumber: row.number,
    orderDate,
    customer,
    normalizedName: normalizeName(customer),
    rawType,
    typeCode,
    topic: cellOf(row, columns.description).value.trim(),
    rawDeadline,
    deadline: deadline.date,
    cost,
    paid,
    rawStatus,
    status,
    fill,
    signature,
    issues: conflict
      ? [
          ...issues,
          {
            // Отдельный код, а не «нераспознанный тип»: иначе счётчик типов
            // оказывается завышен на число расхождений, а приёмка идёт
            // по точным количествам в каждом классе.
            code: 'STATUS_FILL_CONFLICT' as IssueCode,
            severity: 'WARNING' as Severity,
            column: columns.status ?? null,
            note: `текст «${rawStatus}» расходится с заливкой ${fill}`,
          },
        ]
      : issues,
  };
}

export interface ParsedBook {
  readonly sheet: string;
  readonly rows: readonly ParsedRow[];
  readonly totals: { readonly cost: bigint; readonly paid: bigint };
  readonly issueCounts: Readonly<Record<IssueCode, number>>;
  /** Строки с расхождением текста и заливки — отдельным перечнем. */
  readonly conflicts: readonly { rowNumber: number; text: string; fill: string | null }[];
}

export function parseBook(sheets: readonly Sheet[]): ParsedBook {
  const sheet = sheets.find((s) => s.rows.length > 0);
  if (sheet === undefined) {
    throw new ImportError('EMPTY_HEADER', 'В книге нет ни одного заполненного листа.');
  }

  const { row: headerRow, columns } = findHeader(sheet);
  const rows: ParsedRow[] = [];
  const conflicts: { rowNumber: number; text: string; fill: string | null }[] = [];

  for (const row of sheet.rows) {
    if (row.number <= headerRow) continue;
    const parsed = parseRow(row, columns);
    if (parsed === null) continue;
    rows.push(parsed);
    const { conflict } = classifyStatus(parsed.rawStatus, parsed.fill);
    if (conflict) conflicts.push({ rowNumber: row.number, text: parsed.rawStatus, fill: parsed.fill });
  }

  // Полностью совпадающие строки в книге всё же возможны — тогда ключ
  // дополняется порядковым номером повтора. Он устойчив между загрузками,
  // пока не меняется порядок строк, а порядок в книге не меняется.
  const occurrences = new Map<string, number>();
  const keyed = rows.map((row) => {
    const seen = (occurrences.get(row.signature) ?? 0) + 1;
    occurrences.set(row.signature, seen);
    return seen === 1 ? row : { ...row, signature: `${row.signature}|#${seen}` };
  });

  // Однофамильцы выявляются по всей книге сразу: в отдельной строке признака
  // дубля нет — он появляется только при сравнении с остальными.
  const byName = new Map<string, number[]>();
  for (const row of keyed) {
    const list = byName.get(row.normalizedName) ?? [];
    list.push(row.rowNumber);
    byName.set(row.normalizedName, list);
  }
  const withDuplicates = keyed.map((row) => {
    const group = byName.get(row.normalizedName) ?? [];
    if (group.length < 2) return row;
    return {
      ...row,
      issues: [
        ...row.issues,
        {
          code: 'DUPLICATE_CLIENT_BY_NAME' as IssueCode,
          severity: 'WARNING' as Severity,
          column: null,
          note: `совпадение ФИО со строками ${group.filter((n) => n !== row.rowNumber).join(', ')}`,
        },
      ],
    };
  });

  const issueCounts = Object.fromEntries(
    Object.keys(ISSUE_LABEL).map((code) => [
      code,
      withDuplicates.reduce(
        (sum, row) => sum + row.issues.filter((issue) => issue.code === code).length,
        0,
      ),
    ]),
  ) as Record<IssueCode, number>;

  return {
    sheet: sheet.name,
    rows: withDuplicates,
    totals: {
      cost: withDuplicates.reduce((sum, row) => sum + row.cost, 0n),
      paid: withDuplicates.reduce((sum, row) => sum + row.paid, 0n),
    },
    issueCounts,
    conflicts,
  };
}
