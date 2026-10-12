/**
 * Сравнение «было — станет» для карточки работы (решение Р-560). Чистый
 * модуль: проверяется без базы.
 */

import { composeSummary, universityLine } from './order-draft.ts';
import type { BriefFieldKey } from './fields.ts';
import type { ParsedBrief } from './parse.ts';

export type WorkBriefKey = 'topic' | 'summary' | 'university' | 'speciality';

export interface WorkBriefRow {
  readonly key: WorkBriefKey;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /** `replace` — заменить; `fill` — дополнить пустое; `same` — уже так; `keep` — заполненное у клиента не трогается. */
  readonly mode: 'replace' | 'fill' | 'same' | 'keep';
}

const LABELS: Readonly<Record<WorkBriefKey, string>> = {
  topic: 'Тема',
  summary: 'Суть задачи',
  university: 'Вуз или организация (карточка клиента)',
  speciality: 'Направление или специальность (карточка клиента)',
};

/** Поля документа с учётом выбранного варианта темы. */
export function variantFields(brief: ParsedBrief, variant: number | null): Partial<Record<BriefFieldKey, string>> {
  if (brief.variants.length === 0 || variant === null) return brief.fields;
  const chosen = brief.variants[variant];
  return chosen === undefined ? brief.fields : { ...brief.fields, ...chosen.fields };
}

/** Строки сравнения «было — станет». Чистая функция: проверяется без базы. */
export function workBriefRows(
  current: { topic: string | null; summary: string | null; university: string | null; speciality: string | null },
  fields: Partial<Record<BriefFieldKey, string>>,
): WorkBriefRow[] {
  const next: Record<WorkBriefKey, string> = {
    topic: fields.topic ?? '',
    summary: composeSummary(fields).text,
    university: universityLine(fields),
    speciality: fields.direction ?? '',
  };
  const rows: WorkBriefRow[] = [];
  for (const key of ['topic', 'summary', 'university', 'speciality'] as const) {
    const after = next[key].trim();
    if (after === '') continue;
    const before = (current[key] ?? '').trim();
    const client = key === 'university' || key === 'speciality';
    const mode = before === after ? 'same' : client ? (before === '' ? 'fill' : 'keep') : 'replace';
    rows.push({ key, label: LABELS[key], before, after, mode });
  }
  return rows;
}
