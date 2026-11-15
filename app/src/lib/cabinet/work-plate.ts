/**
 * Чем плашка работы в перечне отличается от соседних (аудит 15.11.2026,
 * находка Н-7; решение Р-916).
 *
 * У работ, перенесённых из книги заказов, название равно типу
 * сопровождения. Шапкой плашки стоит тип (Р-831), и три работы одного
 * типа выглядели у клиента тремя одинаковыми плашками. Клиенту заголовком
 * плашки стоит то, что отличает работу: её название, а когда оно равно
 * типу — тема; тип — строкой ниже. Практике шапка Р-831 остаётся, а в
 * строке фактов последним стоит код работы — тот, что в письмах
 * сотруднику (Р-362): единственное исключение из правила Р-189, только
 * для перечня и только сотрудникам.
 */

export type PlateWork = {
  readonly title: string;
  readonly topic: string | null;
  readonly type: string;
};

export type ClientPlateHead = {
  /** Заголовок-ссылка плашки. */
  readonly heading: string;
  /** Тип сопровождения строкой под заголовком; `null` — заголовок и есть тип. */
  readonly typeLine: string | null;
  /** Тема стала заголовком: отдельной строкой она не повторяется. */
  readonly topicAsHeading: boolean;
};

export function clientPlateHead(work: PlateWork): ClientPlateHead {
  const topic = (work.topic ?? '').trim();
  const own = work.title !== work.type;
  const topicAsHeading = !own && topic !== '' && topic !== work.title;
  const heading = topicAsHeading ? topic : work.title;
  return { heading, typeLine: heading === work.type ? null : work.type, topicAsHeading };
}

/** Код работы в строке фактов — сотруднику; клиенту кода нет (Р-189). */
export function plateCode(code: string, forClient: boolean): string | null {
  return forClient ? null : code;
}
