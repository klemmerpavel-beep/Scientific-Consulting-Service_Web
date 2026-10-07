import { can, type Actor } from './access.ts';
import { prisma } from '../db.ts';

/**
 * Исходная строка книги заказов, из которой заведена работа.
 *
 * Перенос сводит книгу к полям кабинета: статус — к четырём состояниям,
 * тип — к позиции справочника, срок — к дате. Сама строка лежит в загрузке
 * целиком, но в карточке работы её не было, и руководитель не видел того,
 * что записано в книге: «принято, жду оплату», «заказ на 4 семестр»,
 * дедлайн словами (решение Р-269). Строка показывается руководителю и
 * менеджеру — клиенту и эксперту внутренние пометки книги не нужны.
 */
export interface BookRow {
  readonly fileName: string;
  readonly rowNumber: number;
  readonly appliedAt: Date;
  readonly orderDate: Date | null;
  readonly customer: string;
  readonly type: string;
  readonly description: string;
  /** Срок как записан в книге; ячейку-дату Excel книга хранит числом. */
  readonly deadline: string;
  readonly deadlineDate: Date | null;
  readonly cost: bigint;
  readonly paid: bigint;
  readonly status: string;
  readonly fill: string | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const amount = (value: unknown): bigint => {
  try {
    return typeof value === 'string' && /^-?\d+$/u.test(value) ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
};

export async function bookRowOf(actor: Actor, projectId: string): Promise<BookRow | null> {
  // Руководитель и менеджер — те, кто разбирает заявки и ведёт работы.
  if (!can(actor, 'REQUEST_MODERATE')) return null;

  // Последняя зафиксированная загрузка: книга переносится повторно, и
  // свежая строка отражает текущее состояние записи в книге.
  const row = await prisma.importRow.findFirst({
    where: { projectId, batch: { state: 'APPLIED' } },
    orderBy: { batch: { createdAt: 'desc' } },
    select: {
      rowNumber: true,
      raw: true,
      parsed: true,
      batch: { select: { fileName: true, createdAt: true } },
    },
  });
  if (row === null) return null;

  const raw = (row.raw ?? {}) as Record<string, unknown>;
  // Строка стёртого по требованию субъекта заказчика: значений нет.
  if (raw.erased === true) return null;
  const parsed = (row.parsed ?? {}) as Record<string, unknown>;
  const day = (value: unknown): Date | null => {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  return {
    fileName: row.batch.fileName,
    rowNumber: row.rowNumber,
    appliedAt: row.batch.createdAt,
    orderDate: day(parsed.orderDate),
    customer: text(raw.customer),
    type: text(raw.type),
    description: text(raw.description),
    deadline: text(raw.deadline),
    deadlineDate: day(parsed.deadline),
    cost: amount(raw.cost),
    paid: amount(raw.paid),
    status: text(raw.status),
    fill: typeof raw.fill === 'string' && raw.fill.length > 0 ? raw.fill : null,
  };
}

/**
 * Доля оплаты в процентах — столбец, который книга считает формулой.
 * Пока оплачено меньше стоимости, доля не больше 99 %: 9 995 из 10 000
 * округлялись до «100 %» при неоплаченном остатке — то, что правило
 * собираемости запрещает (Р-257; решение Р-444).
 */
export function paidShare(row: Pick<BookRow, 'cost' | 'paid'>): string | null {
  if (row.cost <= 0n) return null;
  const rounded = Math.round(Number((row.paid * 1000n) / row.cost) / 10);
  return `${row.paid < row.cost ? Math.min(rounded, 99) : rounded} %`;
}
