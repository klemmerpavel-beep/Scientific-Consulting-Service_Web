/**
 * Названия состояний этапа.
 *
 * Стоят отдельным модулем, а не в `components/cabinet/ui.tsx`: их читает и
 * кабинет, и выгрузка реестров, которая работает вне браузера. Разметку с
 * JSX скрипт загрузить не может, а второе написание перечня разошлось бы с
 * первым — как уже разошлись названия страниц заявки (Р-161).
 *
 * Основной перечень обращён к клиенту: «Ждём ваших данных» — это то, что
 * он видит у себя в кабинете. Эксперту, менеджеру и руководителю та же
 * подпись говорила обратное: эксперт читал «ждём ваших данных» как
 * задание себе, а менеджер на кнопке видел «Перевести в «Ждём ваших
 * данных»». Служебным ролям и выгрузкам для практики поэтому отдаётся
 * свой перечень, где названо, кого ждут (решение Р-206).
 */
export const STAGE_STATE_LABEL = {
  NOT_STARTED: 'Не начат',
  IN_PROGRESS: 'В работе',
  AWAITING_CLIENT: 'Ждём ваших данных',
  IN_APPROVAL: 'На согласовании',
  DONE: 'Завершён',
} as const;

export type StageStateKey = keyof typeof STAGE_STATE_LABEL;

/** Те же состояния глазами практики: чей ход, названо прямо. */
export const STAGE_STATE_LABEL_STAFF: Record<StageStateKey, string> = {
  ...STAGE_STATE_LABEL,
  AWAITING_CLIENT: 'Ждёт материалов клиента',
  IN_APPROVAL: 'На согласовании у клиента',
};

/** Подпись состояния для клиента (`staff = false`) или для практики. */
export function stageLabel(state: StageStateKey, staff: boolean): string {
  return (staff ? STAGE_STATE_LABEL_STAFF : STAGE_STATE_LABEL)[state];
}

/** Подпись для выгрузок практики: реестр на Диске читает не клиент. */
export function stageStateLabel(value: string): string {
  return STAGE_STATE_LABEL_STAFF[value as StageStateKey] ?? value;
}

/**
 * Допустимые переходы состояния этапа — одна таблица для сервера и экрана
 * (решение Р-229).
 *
 * Перечень закрыт: состояние держит на себе уведомления, фильтры, расчёт
 * просрочек и аналитику. Прежде сервер держал свою таблицу, экран — свою,
 * и сервер принимал «В работе → Не начат», которого экран намеренно не
 * предлагал: начатый этап возвращался в «не начат» с датой начала, а
 * следующий старт её переписывал, и длительность этапа в аналитике
 * врала. Переход «На согласовании → Завершён» — это согласование, его
 * экран ведёт своей кнопкой.
 */
export const STAGE_TRANSITIONS: Record<StageStateKey, readonly StageStateKey[]> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_CLIENT', 'IN_APPROVAL'],
  AWAITING_CLIENT: ['IN_PROGRESS', 'IN_APPROVAL'],
  IN_APPROVAL: ['DONE', 'IN_PROGRESS'],
  DONE: [],
};

/** Переходы, которые экран этапа предлагает кнопками смены состояния. */
export function stageStateButtons(from: StageStateKey): readonly StageStateKey[] {
  // Завершение этапа — согласование, у него отдельная кнопка.
  return STAGE_TRANSITIONS[from].filter((to) => to !== 'DONE');
}
