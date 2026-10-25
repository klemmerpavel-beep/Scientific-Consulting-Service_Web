/**
 * Источники «Требует внимания» и счётчик у пункта «Сводка» (требование
 * РК-04, решение Р-342).
 *
 * Дела «Сводки» собираются из полутора десятков выборок. Прежде их
 * вызывала сама страница, и число дел знала только она. Теперь выборки —
 * здесь, одним набором: страница строит из частей плашки, утренняя
 * сводка берёт их число. Каждая плашка — ровно одна запись части, и число
 * в сводке совпадает с «N дел требуют решения» по построению, а не по
 * договорённости. Числа у пункта меню нет с Р-573.
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
import { internalInbox, staffThreadUnread, staffThreads, unreadInbox } from './messages.ts';
import { activeFirst } from './missed.ts';
import { outboxDigest } from './outbox.ts';
import { returnedStages, todayItems, trafficLight } from './queries.ts';

async function collect(actor: Actor) {
  // «Мои» дела руководителя — тот же набор, что у менеджера, по работам,
  // где он сам менеджер; задержки остальных — «Контроль» после срока
  // реакции (требование РК-05, решение Р-337). Набор строится выборками
  // менеджера: роль здесь задаёт только сужение до своих работ.
  const mine: Actor = actor.role === 'HEAD' ? { ...actor, role: 'MANAGER' } : actor;
  const [light, returned, threads, unread, moderation, versions, today, outbox, checks, control, mineAssigned, lateAssigned, calendar, headReplies, internal] =
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
      // Менеджеру — ответ руководителя в своей ветке и непрочитанное во
      // внутренних ветках своих работ: тот же счёт, что у экрана «Руководитель»
      // и вкладки «Внутренняя»; сторона менеджера симметрична делу «Вопрос
      // сотрудника» руководителя (решение Р-739, дополняет Р-304; Р-336).
      actor.role === 'MANAGER' ? staffThreadUnread(actor, actor.id) : Promise.resolve(0),
      internalInbox(actor),
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
    headReplies,
    internal,
  };
}

/** Выборки «Требует внимания» — одним набором на запрос. */
export const attentionSources = cache(collect);

export type AttentionSources = Awaited<ReturnType<typeof collect>>;

/**
 * Светофор для ответа «Сводки»: руководителю — по всей практике, как и
 * «Действующих работ» рядом (решение Р-207); менеджеру — тот же набор,
 * что у плашек. Плашки «Мои» руководителя по-прежнему берут `light`
 * набора, суженный до своих работ (Р-337): фразу ответа это сужение не
 * касается (решение Р-695).
 */
export async function practiceLight(actor: Actor, sources: AttentionSources): Promise<AttentionSources['light']> {
  return actor.role === 'HEAD' ? trafficLight(actor) : sources.light;
}

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
  // Одна карточка на работу (решение Р-738, уточняет Р-304): «нет плана
  // этапов» и «нет куратора» одной работы — одна карточка; у работы с
  // прошедшим сроком обе беды — в строке пояснения её карточки, как уже
  // было с «план работ не заведён». Прежде одна работа стояла в перечне
  // трижды, число дел было завышено и перечень сворачивался раньше времени.
  const late = activeFirst(light.lateWorks);
  const lateCodes = new Set(late.map((work) => work.code));
  const planless = new Set(today.noPlan.map((row) => row.code));
  const unassigned = new Set(today.noExpert.map((row) => row.code));
  return {
    overdue: light.overdue,
    // Действующие работы — впереди приостановленных (решение Р-720).
    late: late.map((work) => ({ ...work, noExpert: unassigned.has(work.code) })),
    stalled: light.stalled.filter((stage) => !overdueIds.has(stage.id)),
    returned: sources.returned,
    staff: sources.staffQuestions,
    headReply: sources.headReplies > 0 ? [{ count: sources.headReplies }] : [],
    internal: sources.internal,
    unread: sources.unread,
    comment: sources.moderation,
    handover: today.handedOver,
    accepted: today.accepted,
    ndaWaiting: today.ndaWaiting,
    noNda: today.noNda,
    noPlan: today.noPlan
      .filter((row) => !lateCodes.has(row.code))
      .map((row) => ({ ...row, noExpert: unassigned.has(row.code) })),
    noExpert: today.noExpert.filter((row) => !lateCodes.has(row.code) && !planless.has(row.code)),
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
