/**
 * Состояния работы и допустимые переходы между ними (решение Р-223).
 *
 * Модуль без базы — как `stage-state.ts`: перечень читают экран работы,
 * серверная функция и проверки, а два написания одного перечня расходятся
 * при первой же правке.
 */

export const PROJECT_STATUS_LABEL = {
  ACTIVE: 'Действует',
  PAUSED: 'Приостановлена',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
} as const;

export type ProjectStatusKey = keyof typeof PROJECT_STATUS_LABEL;

/** Как называется переход на кнопке и в списке выбора. */
export const PROJECT_STATUS_ACTION: Record<ProjectStatusKey, string> = {
  ACTIVE: 'Возобновить',
  PAUSED: 'Приостановить',
  COMPLETED: 'Завершить',
  CANCELLED: 'Отменить',
};

/**
 * Закрытую работу можно вернуть в действие: закрывают и по ошибке, и
 * заказчик возвращается с доработкой по той же теме. Между закрытыми
 * состояниями перехода нет — сначала работа возвращается в действие.
 */
const TRANSITIONS: Record<ProjectStatusKey, readonly ProjectStatusKey[]> = {
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ACTIVE'],
  CANCELLED: ['ACTIVE'],
};

export function nextProjectStatuses(from: ProjectStatusKey): readonly ProjectStatusKey[] {
  return TRANSITIONS[from];
}

export function canChangeProjectStatus(from: ProjectStatusKey, to: ProjectStatusKey): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Закрытая работа — та, у которой есть дата закрытия. */
export function isClosedStatus(status: ProjectStatusKey): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}
