/**
 * Наборы столбцов и выгрузки таблиц кабинета (план владельца по образцу,
 * пункт К-3, решение Р-593).
 *
 * Столбцы описаны один раз и служат и экрану, и книге Excel: что видно на
 * экране, то и выгружается, тем же набором и в том же порядке. Экран
 * рисует ячейку сам (ссылка, метка состояния), а книга берёт значение
 * `value` — строку, число или деньги в копейках.
 */

import { mskDay, mskMoment } from '../disk/table.ts';
import { type XlsxCell, xlsx } from '../disk/xlsx.ts';
import { leadFormLabel, leadSourceLabel, leadStatusLabel } from './lead-labels.ts';
import { PROJECT_STATUS_LABEL, type ProjectStatusKey } from './project-status.ts';
import type { StageStateKey } from './stage-state.ts';

/** Набор столбцов таблицы: основные или подробно. */
export type ColumnSet = 'short' | 'full';

export const COLUMN_SETS: readonly { readonly key: ColumnSet; readonly label: string }[] = [
  { key: 'short', label: 'Основные столбцы' },
  { key: 'full', label: 'Подробно' },
];

/** Набор из адреса: неизвестное значение — основные столбцы (как Р-245). */
export function columnSet(value: string | undefined): ColumnSet {
  return value === 'full' ? 'full' : 'short';
}

export interface Column<Row> {
  readonly key: string;
  readonly head: string;
  /** Входит ли столбец в основной набор; в подробный входят все. */
  readonly short: boolean;
  /** Число или деньги — выравнивание по правому краю на экране. */
  readonly numeric?: boolean;
  readonly value: (row: Row) => XlsxCell;
}

/** Столбцы выбранного набора, в порядке описания. */
export function pick<Row>(columns: readonly Column<Row>[], set: ColumnSet): Column<Row>[] {
  return set === 'full' ? [...columns] : columns.filter((column) => column.short);
}

/** Строки книги по столбцам набора. */
export function sheetRows<Row>(columns: readonly Column<Row>[], rows: readonly Row[]): XlsxCell[][] {
  return rows.map((row) => columns.map((column) => column.value(row)));
}

// ── Заявки ──────────────────────────────────────────────────────────────

/** Строка «Всех заявок» — то, что отдаёт `leadList`. */
export interface LeadRowView {
  readonly createdAt: Date;
  readonly source: string;
  readonly form: string;
  readonly name: string | null;
  readonly contact: string;
  readonly contactKind: string;
  readonly organization: string | null;
  readonly topic: string | null;
  readonly need: string | null;
  readonly deadline: string | null;
  readonly message: string | null;
  readonly status: string;
  readonly projectId: string | null;
  readonly consentGiven: boolean;
  readonly marketingOptIn: boolean;
}

const yesNo = (value: boolean) => (value ? 'да' : 'нет');

/**
 * Столбцы «Всех заявок». Подробный набор — пятнадцать столбцов прежней
 * выгрузки (Р-159, Р-235); основной — шесть столбцов экрана. В основном
 * наборе «Тема» показывает тему, а если её нет — что нужно: так было на
 * экране; в подробном у того и другого свой столбец.
 */
export const LEAD_COLUMNS: readonly Column<LeadRowView>[] = [
  { key: 'createdAt', head: 'Дата (МСК)', short: true, value: (lead) => mskMoment(lead.createdAt) },
  { key: 'source', head: 'Страница', short: true, value: (lead) => leadSourceLabel(lead.source) },
  { key: 'form', head: 'Форма', short: false, value: (lead) => leadFormLabel(lead.form) },
  { key: 'name', head: 'Имя', short: true, value: (lead) => lead.name ?? '' },
  { key: 'contact', head: 'Контакт', short: true, value: (lead) => lead.contact },
  { key: 'contactKind', head: 'Вид контакта', short: false, value: (lead) => (lead.contactKind === 'phone' ? 'Телефон' : 'Почта') },
  { key: 'organization', head: 'Организация', short: false, value: (lead) => lead.organization ?? '' },
  { key: 'topic', head: 'Тема', short: true, value: (lead) => lead.topic ?? lead.need ?? '' },
  { key: 'need', head: 'Что нужно', short: false, value: (lead) => lead.need ?? '' },
  { key: 'deadline', head: 'Срок', short: false, value: (lead) => lead.deadline ?? '' },
  { key: 'message', head: 'Сообщение', short: false, value: (lead) => lead.message ?? '' },
  { key: 'consent', head: 'Согласие', short: false, value: (lead) => yesNo(lead.consentGiven) },
  { key: 'marketing', head: 'Рассылка', short: false, value: (lead) => yesNo(lead.marketingOptIn) },
  { key: 'status', head: 'Состояние', short: true, value: (lead) => leadStatusLabel(lead.status) },
  { key: 'project', head: 'Работа заведена', short: false, value: (lead) => yesNo(lead.projectId !== null) },
];

/**
 * В подробном наборе «Тема» — только тема: «что нужно» стоит рядом своим
 * столбцом и дважды не повторяется.
 */
export function leadColumns(set: ColumnSet): Column<LeadRowView>[] {
  const columns = pick(LEAD_COLUMNS, set);
  return set === 'short'
    ? columns
    : columns.map((column) =>
        column.key === 'topic' ? { ...column, value: (lead: LeadRowView) => lead.topic ?? '' } : column,
      );
}

// ── Деньги по работам ───────────────────────────────────────────────────

/** Строка «Денег по работам» — то, что отдаёт `financeSummary`. */
export interface FinanceRowView {
  readonly code: string;
  readonly title: string;
  readonly client: string;
  readonly status: string;
  readonly manager: { readonly fullName: string };
  readonly expert: { readonly fullName: string } | null;
  readonly contracted: bigint;
  readonly received: bigint;
  readonly awaiting: bigint;
  readonly lost: bigint;
  readonly accrued: bigint;
  readonly margin: bigint;
  /** Доля расходов вида на работу (К-4, Р-594). */
  readonly typeExpenses: bigint;
  readonly net: bigint;
  /** Доля маржи после расходов вида в выручке работы, %; `null` — делить не на что. */
  readonly netShare: number | null;
}

const money = (kopecks: bigint) => ({ kopecks });

/**
 * Столбцы «Денег по работам». Основной набор — семь столбцов экрана;
 * подробный добавляет код и состояние работы, менеджера и куратора
 * отдельными столбцами, списанное и экономику работы: расходы вида, маржу
 * после них и её долю (К-4, Р-594).
 */
export const FINANCE_COLUMNS: readonly Column<FinanceRowView>[] = [
  { key: 'code', head: 'Код', short: false, value: (row) => row.code },
  { key: 'title', head: 'Проект', short: true, value: (row) => row.title },
  { key: 'client', head: 'Клиент', short: true, value: (row) => row.client },
  {
    key: 'status',
    head: 'Состояние работы',
    short: false,
    value: (row) => PROJECT_STATUS_LABEL[row.status as ProjectStatusKey] ?? row.status,
  },
  { key: 'manager', head: 'Менеджер', short: false, value: (row) => row.manager.fullName },
  { key: 'expert', head: 'Куратор', short: false, value: (row) => row.expert?.fullName ?? '' },
  { key: 'contracted', head: 'Договор', short: true, numeric: true, value: (row) => money(row.contracted) },
  { key: 'received', head: 'Получено', short: true, numeric: true, value: (row) => money(row.received) },
  { key: 'awaiting', head: 'К получению', short: true, numeric: true, value: (row) => money(row.awaiting) },
  { key: 'lost', head: 'Списано', short: false, numeric: true, value: (row) => money(row.lost) },
  { key: 'accrued', head: 'Начислено', short: true, numeric: true, value: (row) => money(row.accrued) },
  { key: 'margin', head: 'Маржа', short: true, numeric: true, value: (row) => money(row.margin) },
  { key: 'typeExpenses', head: 'Расходы вида', short: false, numeric: true, value: (row) => money(row.typeExpenses) },
  { key: 'net', head: 'Маржа после расходов вида', short: false, numeric: true, value: (row) => money(row.net) },
  { key: 'netShare', head: 'Доля маржи после расходов, %', short: false, numeric: true, value: (row) => row.netShare },
];

// ── Работы ──────────────────────────────────────────────────────────────

/** Строка «Работ» — то, что отдаёт `listProjects`. */
export interface ProjectRowView {
  readonly code: string;
  readonly title: string;
  /** Перечни — те же, что в схеме: опечатка в состоянии не проходит проверку типов. */
  readonly status: ProjectStatusKey;
  readonly dueOn: Date | null;
  readonly serviceType: { readonly name: string } | null;
  readonly client: { readonly fullName: string };
  readonly manager: { readonly fullName: string } | null;
  readonly expert: { readonly fullName: string } | null;
  readonly expertNameRaw?: string | null;
  readonly stages: readonly { readonly state: StageStateKey }[];
}

/**
 * Столбцы выгрузки «Работ». Перечень на экране — плашки, а не таблица, и
 * набора столбцов у него нет: в книгу идут сведения плашки, без денег —
 * денег на плашках нет ни у кого (Р-194).
 */
export const PROJECT_COLUMNS: readonly Column<ProjectRowView>[] = [
  { key: 'code', head: 'Код', short: true, value: (row) => row.code },
  { key: 'title', head: 'Работа', short: true, value: (row) => row.title },
  { key: 'service', head: 'Вид сопровождения', short: true, value: (row) => row.serviceType?.name ?? '' },
  { key: 'client', head: 'Клиент', short: true, value: (row) => row.client.fullName },
  {
    key: 'status',
    head: 'Состояние',
    short: true,
    value: (row) => PROJECT_STATUS_LABEL[row.status],
  },
  { key: 'dueOn', head: 'Срок работы', short: true, value: (row) => mskDay(row.dueOn) },
  {
    key: 'stages',
    head: 'Этапы',
    short: true,
    value: (row) =>
      row.stages.length === 0
        ? 'план не заведён'
        : `${row.stages.filter((stage) => stage.state === 'DONE').length} из ${row.stages.length}`,
  },
  {
    key: 'waiting',
    head: 'Ждёт клиента',
    short: true,
    // То же условие, что у вкладки «Ждут клиента»: только действующая
    // работа — у закрытой застрявший этап не ожидание человека (Р-206).
    value: (row) =>
      yesNo(row.status === 'ACTIVE' && row.stages.some((stage) => stage.state === 'AWAITING_CLIENT' || stage.state === 'IN_APPROVAL')),
  },
  { key: 'manager', head: 'Менеджер', short: true, value: (row) => row.manager?.fullName ?? '' },
  {
    key: 'expert',
    head: 'Куратор',
    short: true,
    value: (row) => row.expert?.fullName ?? (row.expertNameRaw ?? '').trim(),
  },
];

// ── Книга ───────────────────────────────────────────────────────────────

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Книга Excel по столбцам набора: один лист, закреплённая строка
 * заголовка и автофильтр (`lib/disk/xlsx.ts`, Р-260). Файл на сервере не
 * остаётся — маршрут отдаёт его в браузер.
 */
export function workbook<Row>(title: string, columns: readonly Column<Row>[], rows: readonly Row[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(xlsx({ title, head: columns.map((column) => column.head), rows: sheetRows(columns, rows) }));
}
