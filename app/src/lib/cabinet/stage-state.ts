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
