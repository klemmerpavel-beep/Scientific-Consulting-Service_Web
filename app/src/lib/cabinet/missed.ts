/**
 * Одно правило «срок сорван» на всех экранах сотрудников (решение Р-719;
 * Р-216, Р-257).
 *
 * Правило — то, по которому считает ответ «Сводки» (`trafficLight` в
 * `queries.ts`): сорван срок незакрытого этапа идущей работы, если он
 * раньше сегодняшнего московского дня; срок самой работы — отдельный
 * сорванный срок у идущей работы без сорванного этапа и у приостановленной.
 * Прежде «Команда» брала срок текущего этапа, а срок работы — только у
 * работы без плана; «Работы» помечали «прошёл» одни идущие; «Ближайшие
 * сроки» не давали строки срока работы с планом; карточка работы без
 * плана пометки не имела. По пути от «Сводки» к работе у одного менеджера
 * выходило 5 → 4 → 3 → 0.
 *
 * Модуль чистый: выборку делает экран, здесь — правило. Экраны клиента
 * им не пользуются и не меняются (Р-654).
 */

import { isPastDue, moscowToday, now } from './clock.ts';

export interface DueWork {
  readonly status: string;
  readonly dueOn: Date | null;
  readonly stages: readonly { readonly state: string; readonly dueOn: Date | null }[];
}

/** Сорванные сроки этапов: незакрытые этапы идущей работы со сроком до сегодняшнего дня. */
export function missedStages(work: DueWork, day: Date = moscowToday(now())): number {
  if (work.status !== 'ACTIVE') return 0;
  return work.stages.filter((stage) => stage.state !== 'DONE' && isPastDue(stage.dueOn, day)).length;
}

/**
 * Срок работы прошёл: работа идёт или приостановлена, а её срок раньше
 * сегодняшнего дня. Это пометка «· прошёл» в «Работах» и на карточке.
 */
export function workDuePassed(
  work: Pick<DueWork, 'status' | 'dueOn'>,
  day: Date = moscowToday(now()),
): boolean {
  return (work.status === 'ACTIVE' || work.status === 'PAUSED') && isPastDue(work.dueOn, day);
}

/**
 * Срок работы — отдельный сорванный срок в счёте: у идущей — только без
 * сорванного этапа (срыв уже назван этапом), у приостановленной — всегда:
 * её этапы в счёт не входят.
 */
export function workMissed(work: DueWork, day: Date = moscowToday(now())): boolean {
  return workDuePassed(work, day) && (work.status === 'PAUSED' || missedStages(work, day) === 0);
}

/** Сколько сорванных сроков у работы — тот же счёт, что у ответа «Сводки». */
export function missedCount(work: DueWork, day: Date = moscowToday(now())): number {
  return missedStages(work, day) + (workMissed(work, day) ? 1 : 0);
}

/**
 * Порядок дел «срок работы прошёл» на «Сегодня» и «Сводке»: действующие
 * работы впереди приостановленных, внутри каждой группы — прежний порядок
 * выборки (по сроку, давние сверху). Прежде самые давние сроки были у
 * приостановленных, и в свёрнутом перечне стояли только они, а три
 * действующие работы с сорванным сроком уходили под «Показать все»
 * (решение Р-720). Число дел не меняется — только порядок.
 */
export function activeFirst<T extends { readonly status: string }>(rows: readonly T[]): T[] {
  return [...rows.filter((row) => row.status !== 'PAUSED'), ...rows.filter((row) => row.status === 'PAUSED')];
}
