/**
 * Пояснение в ответе «Сводки» одной фразой (решение Р-207): сорванные
 * сроки и старший из них, действующие работы, что ждёт публикации, заявки.
 *
 * Руководителю сорванные сроки считаются по всей практике, как и
 * «Действующих работ» рядом: его ответ — «то же по всей практике» (Р-207).
 * Прежде фраза брала набор плашек «Мои», суженный до своих работ (Р-337),
 * и рядом стояли «Сорвано сроков — 1» по своим работам и «Действующих
 * работ — 10» по всей практике (решение Р-695). Какой набор брать, решает
 * `practiceLight` в `attention.ts`.
 *
 * Модуль чистый: выборки делает экран, здесь — фраза.
 */

import { daysPast, now } from './clock.ts';
import { waitingPublication } from './staff-texts.ts';
import { clip } from './text-clip.ts';

/** Сорванный срок: этап или работа без сорванного этапа (Р-216). */
export interface LateRow {
  readonly title: string;
  readonly dueOn: Date | null;
  /** Экран срока: старший срок в ответе ведёт сюда (решение Р-724). */
  readonly href?: string;
}

/**
 * Кусок пояснения. Число сорванных сроков ведёт к «Ближайшим срокам» той же
 * «Сводки», старший срок — на свой экран (решение Р-724): прежде фраза
 * называла шесть сроков и старшую работу, а перейти к ним было нельзя.
 */
export interface AnswerSegment {
  readonly text: string;
  /** Кусок — число сорванных сроков: ссылка на «Ближайшие сроки», если блок на экране. */
  readonly deadlines?: true;
  /** Адрес экрана старшего срока. */
  readonly href?: string;
}

function word(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export interface AnswerInput {
  readonly light: { readonly overdue: readonly LateRow[]; readonly lateWorks: readonly LateRow[] };
  /** Действующих работ; `null` — смотрящему практика целиком не открыта. */
  readonly live: number | null;
  /** Замечания и версии куратора, ждущие публикации. */
  readonly comments: number;
  readonly versions: number;
  /** Заявки, ждущие разбора. */
  readonly leads: number;
  /** День счёта просрочки — у часов кабинета (Р-205). */
  readonly at?: Date;
}

/** Пояснение одной строкой — та же фраза, что `answerSegments`, без ссылок. */
export function answerDetail(input: AnswerInput): string | null {
  const segments = answerSegments(input);
  return segments.length === 0 ? null : segments.map((segment) => segment.text).join('');
}

/** Пояснение кусками: текст тот же, что у `answerDetail`, у двух кусков — переход. */
export function answerSegments(input: AnswerInput): AnswerSegment[] {
  const { light } = input;
  // Сорванные сроки — этапов и работ без просроченного этапа; старший
  // срок — самый давний из тех и других (решение Р-216).
  const lateCount = light.overdue.length + light.lateWorks.length;
  const oldest =
    [...light.overdue, ...light.lateWorks]
      .filter((row) => row.dueOn !== null)
      .sort((a, b) => a.dueOn!.getTime() - b.dueOn!.getTime())[0] ?? null;
  const oldestLate = oldest === null ? null : daysPast(oldest.dueOn, input.at ?? now());
  const out: AnswerSegment[] = [];
  // «Этапов и работ»: число складывает сорванные этапы и работы без
  // сорванного этапа, и без уточнения его сверяли с «Работ с прошедшим
  // сроком» отчёта — другой величиной (решение Р-257).
  if (lateCount > 0) {
    out.push({ text: `Сорвано сроков этапов и работ — ${lateCount}`, deadlines: true });
    out.push({ text: '; старший — «' });
    const title = clip(oldest?.title ?? '', 48);
    out.push(oldest?.href === undefined ? { text: title } : { text: title, href: oldest.href });
    out.push({
      text: `»${oldestLate === null ? '' : `, ${oldestLate} ${word(oldestLate, 'день', 'дня', 'дней')}`}.`,
    });
  }
  for (const sentence of [
    input.live === null ? null : `Действующих работ — ${input.live}.`,
    // Всё, что ждёт публикации, — одной строкой по видам (улучшение
    // УЭ-04, решение Р-382); сами дела — ниже, по этапам.
    waitingPublication(input.comments, input.versions),
    input.leads === 0
      ? null
      : `${input.leads} ${word(input.leads, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} разбора.`,
  ]) {
    if (sentence === null) continue;
    if (out.length > 0) out.push({ text: ' ' });
    out.push({ text: sentence });
  }
  return out;
}
