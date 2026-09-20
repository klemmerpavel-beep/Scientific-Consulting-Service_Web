/**
 * Названия состояний этапа.
 *
 * Стоят отдельным модулем, а не в `components/cabinet/ui.tsx`: их читает и
 * кабинет, и выгрузка реестров, которая работает вне браузера. Разметку с
 * JSX скрипт загрузить не может, а второе написание перечня разошлось бы с
 * первым — как уже разошлись названия страниц заявки (Р-161).
 *
 * Текст обращён к клиенту: «Ждём ваших данных» — это то, что он видит у
 * себя в кабинете, и в таблице у руководителя должно стоять то же самое.
 */
export const STAGE_STATE_LABEL = {
  NOT_STARTED: 'Не начат',
  IN_PROGRESS: 'В работе',
  AWAITING_CLIENT: 'Ждём ваших данных',
  IN_APPROVAL: 'На согласовании',
  DONE: 'Завершён',
} as const;

export type StageStateKey = keyof typeof STAGE_STATE_LABEL;

export function stageStateLabel(value: string): string {
  return STAGE_STATE_LABEL[value as StageStateKey] ?? value;
}
