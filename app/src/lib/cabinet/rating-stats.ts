/**
 * Оценки сопровождения (решение Р-565): разбор формы и средние для
 * руководителя. Чистый модуль: проверяется без базы.
 */

/** Предел отзыва: абзац-другой, а не рецензия. */
export const RATING_TEXT_MAX = 2000;

export interface RatingAverage {
  readonly average: number;
  readonly count: number;
}

/** Оценка с формы: целое от 1 до 5, иначе `null`. */
export function parseScore(raw: string): number | null {
  if (!/^[1-5]$/u.test(raw.trim())) return null;
  return Number(raw.trim());
}

export function averageOf(scores: readonly number[]): RatingAverage | null {
  if (scores.length === 0) return null;
  return { average: scores.reduce((sum, score) => sum + score, 0) / scores.length, count: scores.length };
}

/**
 * Средние по практике, по менеджеру и по куратору. Оценка относится к тем,
 * кто вёл работу в момент оценки; снятая учётная запись — только в общую
 * среднюю.
 */
export function ratingStats(rows: readonly { score: number; managerId: string | null; expertId: string | null }[]): {
  practice: RatingAverage | null;
  managers: ReadonlyMap<string, RatingAverage>;
  curators: ReadonlyMap<string, RatingAverage>;
} {
  const group = (key: 'managerId' | 'expertId') => {
    const scores = new Map<string, number[]>();
    for (const row of rows) {
      const id = row[key];
      if (id === null) continue;
      scores.set(id, [...(scores.get(id) ?? []), row.score]);
    }
    return new Map([...scores].map(([id, list]) => [id, averageOf(list)!]));
  };
  return { practice: averageOf(rows.map((row) => row.score)), managers: group('managerId'), curators: group('expertId') };
}

/** «4,6 (12)» — средняя до десятых и число оценок; нет оценок — «—». */
export function formatAverage(value: RatingAverage | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.average.toFixed(1).replace('.', ',')} (${value.count})`;
}
