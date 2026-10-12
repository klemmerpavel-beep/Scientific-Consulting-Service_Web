/**
 * Автоотметки шагов чек-листа по состоянию работы (улучшение У-3,
 * задание владельца 12.10.2026, решение Р-552).
 *
 * Шаг, который кабинет может проверить сам, отмечается по состоянию
 * работы: куратор назначен, договор и график платежей заведены, этапы
 * согласованы, остаток получен или списан, вознаграждение выплачено,
 * работа завершена. Такой шаг нажатием не меняется: отметка, поставленная
 * рукой поверх состояния, разошлась бы с ним на следующий день.
 *
 * Правило отвечает «да», «нет» или «не знаю». «Не знаю» — когда смотрящему
 * не положено знать ответ: начисления куратору видит только руководитель
 * (финансовый контур, Р-149), и менеджеру этот шаг остаётся ручным, а не
 * подсказывает, выплачено ли вознаграждение.
 *
 * Модуль чистый: состояние собирает `workState` в `checklist-marks.ts`.
 */

export type AutoRule =
  | 'curator-ready'
  | 'contract-schedule'
  | 'client-entered'
  | 'stages-done'
  | 'money-settled'
  | 'payouts-paid'
  | 'work-completed'
  | 'own-nda';

/** Состояние работы глазами смотрящего; `null` — ему не положено знать. */
export interface WorkState {
  /** Назначен куратор с подписанным договором поручения. */
  readonly curatorReady: boolean;
  /** Подписан ли договор поручения у самого смотрящего-куратора. */
  readonly ownNda: boolean | null;
  readonly stages: number;
  readonly stagesDone: number;
  /** Договор и хотя бы один транш; `null` — договор смотрящему не виден. */
  readonly contractSchedule: boolean | null;
  /** Остаток по договору получен или списан; `null` — не виден. */
  readonly moneySettled: boolean | null;
  /** Начисления по работе выплачены; `null` — не виден (только руководителю). */
  readonly payoutsPaid: boolean | null;
  /** Клиент хотя бы раз вошёл в кабинет. */
  readonly clientEntered: boolean;
  readonly status: string;
}

export const AUTO_NOTE: Readonly<Record<AutoRule, string>> = {
  'curator-ready': 'куратор назначен, договор поручения подписан',
  'contract-schedule': 'договор и график платежей заведены',
  'client-entered': 'клиент входил в кабинет',
  'stages-done': 'все этапы согласованы',
  'money-settled': 'остаток по договору получен или списан',
  'payouts-paid': 'вознаграждение куратору выплачено',
  'work-completed': 'работа завершена',
  'own-nda': 'договор поручения подписан',
};

/** Выполнен ли шаг по состоянию работы; `null` — смотрящему не положено знать. */
export function autoDone(rule: AutoRule, state: WorkState): boolean | null {
  switch (rule) {
    case 'curator-ready':
      return state.curatorReady;
    case 'own-nda':
      return state.ownNda;
    case 'contract-schedule':
      return state.contractSchedule;
    case 'client-entered':
      return state.clientEntered;
    case 'stages-done':
      return state.stages > 0 && state.stagesDone === state.stages;
    case 'money-settled':
      return state.moneySettled;
    case 'payouts-paid':
      return state.payoutsPaid;
    case 'work-completed':
      return state.status === 'COMPLETED';
  }
}

/**
 * Остаток по договору закрыт: открытых траншей нет, и оплаченное вместе
 * со списанным покрывает сумму договора. Сторнированный транш оплатой не
 * считается (Р-249). Суммы — в копейках.
 */
export function moneySettled(
  totalAmount: bigint,
  tranches: readonly { readonly status: string; readonly amount: bigint }[],
): boolean {
  if (tranches.some((tranche) => tranche.status === 'PLANNED' || tranche.status === 'INVOICED')) return false;
  const covered = tranches
    .filter((tranche) => tranche.status === 'PAID' || tranche.status === 'WRITTEN_OFF')
    .reduce((sum, tranche) => sum + tranche.amount, 0n);
  return covered >= totalAmount;
}
