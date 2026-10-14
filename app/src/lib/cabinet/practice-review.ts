/**
 * «Разбор практики» на «Сводке» руководителя (план владельца по образцу,
 * пункт К-2, решение Р-586): три группы с числом и главной строкой в
 * каждой — «Сделать», «Наблюдать», «Возможность».
 *
 * Группы не считают ничего своего, а сводят то, что «Сводка» уже знает:
 * «Сделать» — дела «Требует внимания» (их число — то же, что в ответе
 * сводки и в заголовке блока); «Наблюдать» — сроки этой недели, ещё не
 * сорванные; «Возможность» — неотмеченные рекомендации, первой строкой —
 * «Рекомендация месяца» (Р-350). Подробные перечни остаются ниже и на
 * экране «Рекомендации»; ссылка группы ведёт к ним.
 */

export interface ReviewLine {
  readonly title: string;
  /** Пометка под строкой: «просрочено 3 дня», «до 17 октября». */
  readonly note: string | null;
  readonly href: string;
}

export interface ReviewGroup {
  readonly key: 'act' | 'watch' | 'chance';
  readonly label: string;
  readonly count: number;
  /** Что входит в группу — подписью под числом. */
  readonly scope: string;
  /** Главная строка группы; при пустой группе — `null`. */
  readonly first: ReviewLine | null;
  /** Строка на месте главной, когда группа пуста. */
  readonly empty: string;
  /** Переход к перечню группы; при пустой группе — `null`: перечня нет. */
  readonly all: { readonly href: string; readonly label: string } | null;
}

export interface ReviewInput {
  /** Дела «Требует внимания» в порядке блока: первое — «Начать с главного». */
  readonly act: readonly ReviewLine[];
  /** «На этой неделе» — по сроку, ближайший первым. */
  readonly watch: readonly ReviewLine[];
  /** Неотмеченные рекомендации и «Рекомендация месяца». */
  readonly chance: { readonly count: number; readonly month: { readonly title: string; readonly href: string } | null };
}

export function practiceReview(input: ReviewInput): ReviewGroup[] {
  const { act, watch, chance } = input;
  return [
    {
      key: 'act',
      label: 'Сделать',
      count: act.length,
      scope: 'сорванные сроки, ответы и решения',
      first: act[0] ?? null,
      empty: 'Ничего не горит.',
      all: act.length === 0 ? null : { href: '#attention', label: 'Все дела' },
    },
    {
      key: 'watch',
      label: 'Наблюдать',
      count: watch.length,
      scope: 'сроки этой недели, ещё не сорваны',
      first: watch[0] ?? null,
      empty: 'На неделе сроков нет.',
      all: watch.length === 0 ? null : { href: '#week', label: 'Все сроки недели' },
    },
    {
      key: 'chance',
      label: 'Возможность',
      count: chance.count,
      scope: 'окна продвижения, цена, возврат клиентов',
      first: chance.month === null ? null : { title: chance.month.title, note: 'рекомендация месяца', href: chance.month.href },
      empty: 'Новых рекомендаций нет.',
      all: chance.count === 0 ? null : { href: '/cabinet/manage/recommendations', label: 'Все рекомендации' },
    },
  ];
}
