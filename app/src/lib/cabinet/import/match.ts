import { ERASED_KEY_PREFIX, erasedKey, signatureBase } from './etl.ts';

/**
 * Сверка строк книги с уже перенесённым (решение Р-252).
 *
 * Модуль чистый: на входе строки книги и выборка прежних переносов, на
 * выходе — решение по каждой строке. Поэтому он проверяется без базы, а
 * предпросмотр и фиксация пользуются им одним и тем же образом: две
 * отдельные сверки разошлись бы на первой же правке книги.
 *
 * Зачем сверка сложнее равенства ключей. Прежде ключ строки включал сумму,
 * и правка стоимости в книге давала «новую» строку — мост «Диск → база»
 * раз в час заводил по ней вторую работу с договором и оплатой. Сумма из
 * ключа убрана (`KEY_VERSION`), но в базе уже лежат перенесённые строки
 * со старыми ключами, и простая смена формулы превратила бы при следующем
 * прогоне все строки книги в новые работы. Поэтому строки сопоставляются
 * не по ключу целиком, а по его основе — дате, ФИО и написанию типа, —
 * которая одинакова у обеих формул:
 *
 *   1. основа строки совпадает с надгробием — данные стёрты по требованию
 *      субъекта, строка не переносится никогда;
 *   2. внутри группы с одной основой сначала сводятся пары с равной суммой
 *      — так неизменившиеся строки находят свои работы и при старом, и при
 *      новом ключе, и близнецы (один клиент, одна дата, один тип, разные
 *      суммы) не путаются между собой;
 *   3. если после этого остались одна строка и одна работа — это та же
 *      работа с исправленной суммой: обновление, а не новая работа;
 *   4. если работ не осталось — строка новая;
 *   5. иначе (две строки на одну работу, одна строка на две работы) —
 *      угадывать нельзя: строка уходит на разбор человеку, и фиксация её
 *      не заводит, пока книгу не поправят.
 *
 * Чего сверка не умеет: правка ФИО или написания типа меняет основу, и
 * такая строка читается новой. Опечатку в ключевом поле по-прежнему
 * разбирает руководитель на экране переноса.
 */

export interface BookRowKey {
  /** Подпись строки из разбора либо сохранённая подпись загрузки. */
  readonly signature: string | null;
  readonly cost: bigint;
}

export interface KnownWork {
  /** Сохранённая подпись прежней строки — любой из двух формул. */
  readonly signature: string | null;
  readonly projectId: string;
  /** Сохранённые значения прежней строки: по ним видно, что изменилось. */
  readonly parsed: unknown;
  /** Порядок фиксации: из нескольких строк одной работы берётся последняя. */
  readonly order: number;
}

export type RowMatch =
  | { readonly kind: 'NEW' }
  | { readonly kind: 'KNOWN'; readonly projectId: string; readonly parsed: unknown }
  | { readonly kind: 'UNCLEAR'; readonly candidates: number }
  | { readonly kind: 'ERASED' };

function costOf(parsed: unknown): string | null {
  const value = (parsed as { cost?: unknown } | null)?.cost;
  return typeof value === 'string' ? value : null;
}

/**
 * Решение по каждой строке, в порядке входа.
 *
 * `erased` — надгробия, найденные в базе для строк этой книги
 * (`erasedKey` от их подписей).
 */
export function matchBook(
  rows: readonly BookRowKey[],
  known: readonly KnownWork[],
  erased: ReadonlySet<string>,
): RowMatch[] {
  // Одна работа — одна последняя строка: ранние строки той же работы
  // помнят прежние значения, и сравнение с ними давало бы ложные правки.
  const latest = new Map<string, KnownWork>();
  for (const work of known) {
    const seen = latest.get(work.projectId);
    if (seen === undefined || work.order >= seen.order) latest.set(work.projectId, work);
  }
  const worksByBase = new Map<string, KnownWork[]>();
  for (const work of [...latest.values()].sort((a, b) => a.order - b.order)) {
    const base = signatureBase(work.signature);
    if (base === null) continue;
    const list = worksByBase.get(base) ?? [];
    list.push(work);
    worksByBase.set(base, list);
  }

  const result: RowMatch[] = rows.map(() => ({ kind: 'NEW' }));
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const tomb = erasedKey(row.signature);
    if (
      (row.signature !== null && row.signature.startsWith(ERASED_KEY_PREFIX)) ||
      (tomb !== null && erased.has(tomb))
    ) {
      result[index] = { kind: 'ERASED' };
      return;
    }
    const base = signatureBase(row.signature);
    if (base === null) return;
    const list = groups.get(base) ?? [];
    list.push(index);
    groups.set(base, list);
  });

  for (const [base, indexes] of groups) {
    const works = [...(worksByBase.get(base) ?? [])];
    const left: number[] = [];
    for (const index of indexes) {
      const cost = rows[index]!.cost.toString();
      const pair = works.findIndex((work) => costOf(work.parsed) === cost);
      if (pair === -1) {
        left.push(index);
        continue;
      }
      const [work] = works.splice(pair, 1);
      result[index] = { kind: 'KNOWN', projectId: work!.projectId, parsed: work!.parsed };
    }
    if (left.length === 0 || works.length === 0) continue;
    if (left.length === 1 && works.length === 1) {
      result[left[0]!] = { kind: 'KNOWN', projectId: works[0]!.projectId, parsed: works[0]!.parsed };
      continue;
    }
    for (const index of left) result[index] = { kind: 'UNCLEAR', candidates: works.length };
  }
  return result;
}

/** Прежние значения строки, по которым решается «обновить» или «пропустить». */
export interface RowValues {
  readonly cost: string;
  readonly paid: string;
  readonly status: string;
  readonly deadline: string | null;
}

/**
 * Изменилась ли строка против прежнего переноса: деньги, состояние, срок.
 *
 * Срок сравнивается с решения Р-252: прежде его правка в книге читалась
 * «уже перенесено» и до работы не доходила, хотя ветка обновления срок
 * переписывает. Сохранённые строки прежних загрузок срок хранят, так что
 * сравнение с ними не даёт ложных правок.
 */
export function changed(values: RowValues, before: unknown): boolean {
  const earlier = before as Partial<RowValues> | null | undefined;
  if (earlier === null || earlier === undefined) return true;
  return (
    earlier.cost !== values.cost ||
    earlier.paid !== values.paid ||
    earlier.status !== values.status ||
    (earlier.deadline ?? null) !== values.deadline
  );
}
