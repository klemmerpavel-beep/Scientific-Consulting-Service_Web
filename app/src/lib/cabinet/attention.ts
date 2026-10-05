/**
 * Источники «Требует внимания» и счётчик у пункта «Сводка» (требование
 * РК-04, решение Р-342).
 *
 * Дела «Сводки» собираются из полутора десятков выборок. Прежде их
 * вызывала сама страница, и число дел знала только она. Теперь выборки —
 * здесь, одним набором: страница строит из частей плашки, оболочка
 * кабинета берёт их число для пункта меню. Каждая плашка — ровно одна
 * запись части, и число у пункта меню совпадает с «N дел требуют
 * решения» по построению, а не по договорённости.
 *
 * Набор кешируется на запрос (`cache` React): страница и оболочка
 * получают один и тот же объект, и выборки идут один раз.
 */

import { cache } from 'react';

import { can, type Actor } from './access.ts';
import { myAssignments, overdueAssignments } from './assignments.ts';
import { controlItems } from './control.ts';
import { calendarGaps, openChecks } from './head-checks.ts';
import { pendingComments, pendingVersions } from './materials.ts';
import { staffThreads, unreadInbox } from './messages.ts';
import { outboxDigest } from './outbox.ts';
import { returnedStages, todayItems, trafficLight } from './queries.ts';

async function collect(actor: Actor) {
  // «Мои» дела руководителя — тот же набор, что у менеджера, по работам,
  // где он сам менеджер; задержки остальных — «Контроль» после срока
  // реакции (требование РК-05, решение Р-337). Набор строится выборками
  // менеджера: роль здесь задаёт только сужение до своих работ.
  const mine: Actor = actor.role === 'HEAD' ? { ...actor, role: 'MANAGER' } : actor;
  const [light, returned, threads, unread, moderation, versions, today, outbox, checks, control, mineAssigned, lateAssigned, calendar] =
    await Promise.all([
      trafficLight(mine),
      // Клиент вернул этап с замечаниями: ход за куратором (решение Р-283).
      returnedStages(mine),
      // Вопрос сотрудника — пока руководитель его не прочитал (РК-07, Р-336).
      actor.role === 'HEAD' ? staffThreads(actor) : Promise.resolve([]),
      unreadInbox(mine),
      // Замечание и версия куратора не видны клиенту до публикации
      // (Р-183, Т-18, Р-294).
      pendingComments(mine),
      pendingVersions(mine),
      // Принятый этап, работа без плана, без куратора или с куратором без
      // доступа, заявки без ответа и в разборе (требование М-06, Р-304).
      todayItems(actor),
      // Очередь уведомлений — только руководителю (решение Р-154).
      can(actor, 'AUDIT_VIEW') ? outboxDigest(actor) : Promise.resolve(null),
      // Дела «акт и счёт» и «проверьте договор» (РК-12, Р-338).
      openChecks(actor),
      controlItems(actor),
      // Поручения: свои открытые — исполнителю, просроченные — руководителю
      // (требование РК-19, решение Р-352).
      myAssignments(actor),
      overdueAssignments(actor),
      // Год срока согласования без производственного календаря (УК-15, Р-394).
      calendarGaps(actor),
    ]);
  return {
    light,
    returned,
    staffQuestions: threads.filter((row) => row.unread > 0),
    unread,
    moderation,
    versions,
    today,
    outbox,
    checks,
    control,
    mineAssigned,
    lateAssigned,
    calendar,
  };
}

/** Выборки «Требует внимания» — одним набором на запрос. */
export const attentionSources = cache(collect);

export type AttentionSources = Awaited<ReturnType<typeof collect>>;

/**
 * Части «Требует внимания»: каждая запись — одна плашка.
 *
 * Этап, уже названный просроченным, второй плашкой «ждёт клиента» не
 * повторяется (решение Р-206). Очередь уведомлений — одна плашка и
 * только при отказах доставки (требование РК-02, решение Р-334).
 */
export function attentionParts(sources: AttentionSources) {
  const { light, today, outbox } = sources;
  const overdueIds = new Set(light.overdue.map((stage) => stage.id));
  return {
    overdue: light.overdue,
    late: light.lateWorks,
    stalled: light.stalled.filter((stage) => !overdueIds.has(stage.id)),
    returned: sources.returned,
    staff: sources.staffQuestions,
    unread: sources.unread,
    comment: sources.moderation,
    handover: today.handedOver,
    accepted: today.accepted,
    ndaWaiting: today.ndaWaiting,
    noNda: today.noNda,
    noPlan: today.noPlan,
    noExpert: today.noExpert,
    lateLeads: today.lateLeads,
    reviewLeads: today.reviewLeads,
    version: sources.versions,
    outbox: outbox !== null && outbox.deliveryFailed > 0 ? [outbox] : [],
    check: sources.checks,
    control: sources.control,
    assignment: sources.mineAssigned,
    assignmentOverdue: sources.lateAssigned,
    calendar: sources.calendar,
  };
}

/** Сколько дел требуют решения — то же число, что на «Сводке». */
export function attentionCount(sources: AttentionSources): number {
  return Object.values(attentionParts(sources)).reduce((acc, part) => acc + part.length, 0);
}

/**
 * Счётчик у пункта «Сводка» — только руководителю. Сбой выборки не
 * роняет страницу: пункт меню остаётся без числа.
 */
export async function headAttentionCount(actor: Actor): Promise<number | null> {
  if (actor.role !== 'HEAD') return null;
  try {
    return attentionCount(await attentionSources(actor));
  } catch {
    return null;
  }
}
