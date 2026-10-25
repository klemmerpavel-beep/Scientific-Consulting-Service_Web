/**
 * Пояснение замечания разбора в строке отчёта переноса книги (решение
 * Р-732).
 *
 * Разбор записывает к каждому замечанию пояснение с исходным текстом
 * ячейки и тем, что он с ней сделал (`ImportRow.errors[].note`, модуль
 * `etl.ts`), но отчёт выводил только название замечания: «Несуществующая
 * дата», а срок в строке — уже поправленный «30 апреля 2025». Руководитель
 * фиксировал книгу, не видя, какие сроки кабинет поправил сам. Теперь у
 * замечания стоит пояснение словами отчёта («в книге «31.04.2025» — срок
 * отнесён на 30 апреля 2025»), суммы — с разрядами, а ячейка «Срок»,
 * поправленная разбором, помечена. Что сделано, пояснение говорит только
 * со слов разбора: «учтена доплатой» — если сохранённое замечание это
 * подтверждает. Правила разбора, число и состав замечаний не меняются
 * (Р-657, Р-661, Р-713).
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

import { formatDay } from '../approval-text.ts';
import { formatAmount } from '../money.ts';

/** Замечание строки, как его хранит разбор. */
export interface RowIssue {
  readonly code: string;
  readonly note: string;
  /**
   * Вес замечания, если он известен: у разобранной строки он есть, в
   * сохранённой загрузке (`ImportRow.errors`) — нет.
   */
  readonly severity?: string;
}

/** Что строки нужно пояснению: прочитанный срок и суммы в копейках. */
export interface RowFacts {
  readonly deadline: Date | null;
  readonly cost: bigint;
  readonly paid: bigint;
}

/**
 * Переплата заведена доплатой сверх договора — только если это говорит само
 * замечание. До решения Р-273 (29.09.2026) переплата была ошибкой с
 * пояснением «оплачено больше стоимости на … ₽», и доплата не заводилась;
 * отчёт старой загрузки не должен называть действие, которого не было.
 * Подтверждение — слова разбора «учтено доплатой» или вес «предупреждение»
 * (с Р-273 переплата при заданной стоимости — предупреждение).
 */
function extraConfirmed(issue: RowIssue, note: string): boolean {
  return /учтено доплатой/u.test(note) || issue.severity === 'WARNING';
}

/** Исходный текст ячейки в начале пояснения разбора: «31.04.2025» — … */
function quoted(note: string): string | null {
  return /^«(.*?)»/u.exec(note)?.[1] ?? null;
}

/**
 * Пояснение к замечанию для строки отчёта; `null` — пояснения нет или оно
 * уже стоит в столбце «Решение» (неясное соответствие перенесённой работе).
 */
export function issueExplanation(issue: RowIssue, row: RowFacts): string | null {
  const note = issue.note.trim();
  switch (issue.code) {
    case 'NONEXISTENT_DATE': {
      const raw = quoted(note);
      if (raw === null || row.deadline === null) return note || null;
      return `в книге «${raw}» — срок отнесён на ${formatDay(row.deadline)}`;
    }
    case 'DEADLINE_WITHOUT_YEAR': {
      const raw = quoted(note);
      const year = /как (\d{4})/u.exec(note)?.[1] ?? null;
      if (raw === null || year === null) return note || null;
      return `в книге «${raw}» — год восстановлен как ${year}`;
    }
    case 'UNPARSED_DEADLINE':
      return note === '' ? null : `в книге «${note}» — срок не прочитан`;
    case 'PAYMENT_EXCEEDS_CONTRACT': {
      if (row.cost <= 0n) return `оплачено ${formatAmount(row.paid)} при пустой стоимости`;
      const over = `переплата ${formatAmount(row.paid - row.cost)}`;
      return extraConfirmed(issue, note) ? `${over} — учтена доплатой` : over;
    }
    case 'CLOSED_WITH_OUTSTANDING_BALANCE':
      return `работа закрыта, остаток ${formatAmount(row.cost - row.paid)}`;
    case 'AMOUNT_UNREADABLE': {
      const raw = quoted(note);
      return raw === null ? note || null : `в книге «${raw}» — сумма не прочитана`;
    }
    case 'UNKNOWN_SUPPORT_TYPE': {
      const raw = quoted(note);
      return raw === null ? note || null : `в книге «${raw}» — не сведено к справочнику`;
    }
    case 'STATUS_FILL_CONFLICT': {
      const raw = quoted(note.replace(/^текст\s+/u, ''));
      return raw === null ? note || null : `в книге «${raw}» — расходится с заливкой ячейки`;
    }
    case 'PREVIOUS_WORK_UNCLEAR':
      return null;
    default:
      return note || null;
  }
}

/** Срок, поправленный разбором: несуществующая дата или срок без года. */
export function deadlineFixed(issues: readonly RowIssue[]): boolean {
  return issues.some((issue) => issue.code === 'NONEXISTENT_DATE' || issue.code === 'DEADLINE_WITHOUT_YEAR');
}
