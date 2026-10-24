/**
 * Работа без этапов — что пишут шкала хода и «План работ» на карточке
 * работы, одной таблицей «кто смотрит × состояние работы» (решения
 * Р-742, Р-ВК-М05; Р-182, Р-206, Р-564).
 *
 * Прежде заголовок шкалы был один на всех — «План работы ещё
 * составляется», — и его же читал клиент завершённой работы, у которой
 * плана не будет. Ответ панели и пустой план повторяли ту же мысль ещё
 * дважды, а кнопка «Что подготовить» стояла отдельно, и ответ на неё не
 * указывал.
 *
 * | Кто смотрит   | Действующая                                    | Приостановленная | Завершённая / отменённая |
 * |---------------|------------------------------------------------|------------------|--------------------------|
 * | клиент        | «План работы ещё составляется»; при открытом   | как прежде       | «Работа завершена» /     |
 * |               | «Что подготовить» — «Пока менеджер составляет  |                  | «Работа отменена»;       |
 * |               | план, приложите материалы для старта» и кнопка |                  | план — «Этапов у работы  |
 * |               | на перечень; план — «Этапы появятся здесь.»    |                  | нет.»                    |
 * | практика      | как прежде                                     | как прежде       | то же для всех ролей     |
 * | куратор       | как прежде                                     | как прежде       | то же для всех ролей     |
 *
 * Модуль чистый: ни базы, ни часов — их значения передаёт экран.
 */

import { CLOSED_FOR_PRACTICE } from './access.ts';

/** Кто смотрит: клиент, практика (менеджер и руководитель) или куратор. */
export type PlanViewer = 'client' | 'practice' | 'curator';

export interface EmptyPlan {
  /** Заголовок шкалы хода. */
  readonly title: string;
  /** Главная фраза панели; `null` — прежняя по роли. */
  readonly answer: string | null;
  /** Кнопка панели — на «Что подготовить» (Р-564). */
  readonly actionHref: string | null;
  readonly actionLabel: string | null;
  /** Что пишет пустой «План работ». */
  readonly roadmap: string;
}

/** Прежний заголовок шкалы пустого плана — клиенту он и остаётся. */
export const PLAN_COMPOSING = 'План работы ещё составляется';
/** Пустой план у закрытой работы: плана не будет (Р-742, Р-206). */
export const NO_STAGES = 'Этапов у работы нет.';
/** Главная фраза клиенту, пока открыт перечень «Что подготовить» (Р-742). */
export const PREPARE_WHILE_PLANNING = 'Пока менеджер составляет план, приложите материалы для старта.';

const CLOSED_TITLE: Readonly<Record<string, string>> = {
  COMPLETED: 'Работа завершена',
  CANCELLED: 'Работа отменена',
};

export function emptyPlan(input: {
  readonly viewer: PlanViewer;
  readonly status: string;
  /** Перечень «Что подготовить» открыт: счёт приложенного и адрес. */
  readonly prepare: { readonly done: number; readonly total: number; readonly href: string } | null;
}): EmptyPlan {
  const plain = { answer: null, actionHref: null, actionLabel: null } as const;
  const closed = CLOSED_TITLE[input.status];
  if (closed !== undefined) {
    return {
      ...plain,
      title: closed,
      // Клиенту и куратору — прежние фразы о закрытой работе; практике —
      // как вернуть работу к правке, а не «План работ не заведён».
      answer: input.viewer === 'practice' ? `${CLOSED_FOR_PRACTICE}.` : null,
      roadmap: NO_STAGES,
    };
  }
  if (input.status === 'ACTIVE' && input.viewer === 'client') {
    return {
      ...plain,
      title: PLAN_COMPOSING,
      answer: input.prepare === null ? 'Сейчас от вас ничего не требуется — работа идёт.' : PREPARE_WHILE_PLANNING,
      actionHref: input.prepare?.href ?? null,
      actionLabel: input.prepare === null ? null : `Что подготовить · ${input.prepare.done} из ${input.prepare.total}`,
      roadmap: 'Этапы появятся здесь.',
    };
  }
  // Приостановленная работа и куратор — как прежде.
  return {
    ...plain,
    title: PLAN_COMPOSING,
    roadmap:
      input.viewer === 'client'
        ? 'Этапы ещё не заведены — менеджер добавит их после согласования плана.'
        : 'План работ ещё не заведён.',
  };
}
