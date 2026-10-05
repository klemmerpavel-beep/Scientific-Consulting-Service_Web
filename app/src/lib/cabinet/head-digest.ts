/**
 * Утренняя сводка и сигналы руководителю (требование РК-13, решение Р-347).
 *
 * Руководитель узнавал о делах, только открыв «Сводку». Теперь:
 * - по рабочим дням — утренняя сводка: число дел по видам и ссылка на
 *   «Сводку»; в день без дел не уходит. Число — то же, что у пункта меню
 *   (`attentionParts`, Р-342);
 * - сразу, отдельным сигналом, — просроченный платёж: на следующий день
 *   после плановой даты, один раз на транш (окно — неделя, чтобы пропуск
 *   расписания не терял сигнал, а давние долги при включении не сыпались
 *   разом).
 * Остальные сигналы (`STAFF_QUESTION`, `NDA_WAITING`, `NDA_NEEDED`,
 * `STAGE_ACCEPTED`, `STAGE_REOPENED`, `ORDER_WITH_CONTRACT`,
 * `WORK_TRANSFERRED`, `OUTBOX_FAILED`) ставят их сценарии. Каждая строка
 * отключается в сетке правил руководителя. В текстах нет сумм и
 * содержания сообщений.
 */

import { prisma } from '../db.ts';
import type { Actor } from './access.ts';
import { loadCalendar } from './approval.ts';
import { formatDay } from './approval-text.ts';
import { attentionParts, attentionSources } from './attention.ts';
import { moscowToday, now as clockNow } from './clock.ts';
import { overdueTrancheWhere } from './money.ts';
import { enqueue } from './outbox.ts';
import { recommendationsFor } from './recommendations.ts';
import { dayKey, isWorkday } from './workdays.ts';

type Parts = ReturnType<typeof attentionParts>;

/** Подписи видов дел в сводке — словами «Требует внимания». */
export const DIGEST_LABEL: Record<keyof Parts, string> = {
  overdue: 'сорван срок этапа',
  late: 'прошёл срок работы',
  stalled: 'этап ждёт клиента',
  returned: 'клиент вернул этап с замечаниями',
  staff: 'вопрос сотрудника',
  unread: 'клиент ждёт ответа',
  comment: 'замечания куратора ждут публикации',
  handover: 'куратор сдал этап',
  accepted: 'этап принят — запустить следующий',
  ndaWaiting: 'нужен договор поручения',
  noNda: 'куратор без доступа к материалам',
  noPlan: 'нет плана этапов',
  noExpert: 'нет куратора',
  lateLeads: 'заявка без ответа',
  reviewLeads: 'заявка в разборе',
  version: 'версии куратора ждут публикации',
  outbox: 'уведомления не доставлены',
  check: 'акт, счёт или договор',
  control: 'контроль: дела менеджеров после срока реакции',
  assignment: 'ваши поручения',
  assignmentOverdue: 'поручение просрочено',
};

/** Текст сводки: число дел по видам, без сумм и содержания сообщений. */
export function digestLetter(parts: Parts, day: Date): { subject: string; body: string; total: number } {
  const lines = (Object.keys(DIGEST_LABEL) as (keyof Parts)[])
    .map((key) => ({ label: DIGEST_LABEL[key], count: parts[key].length }))
    .filter((row) => row.count > 0);
  const total = lines.reduce((acc, row) => acc + row.count, 0);
  return {
    total,
    subject: `Дела на ${formatDay(day)}: ${total}`,
    body:
      `Требует решения — ${total}.\n` +
      lines.map((row) => `— ${row.label}: ${row.count}`).join('\n') +
      '\nПодробности и с чего начать — на «Сводке» кабинета.',
  };
}

/** Утренняя сводка руководителям — по рабочим дням и только при делах. */
export async function enqueueHeadDigest(at: Date = clockNow()): Promise<number> {
  const today = moscowToday(at);
  if (!isWorkday(today, await loadCalendar())) return 0;
  const heads = await prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
  let queued = 0;
  for (const head of heads) {
    const actor: Actor = { id: head.id, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
    const letter = digestLetter(attentionParts(await attentionSources(actor)), today);
    if (letter.total === 0) continue;
    queued += await enqueue(prisma, {
      userId: head.id,
      eventKind: 'HEAD_DIGEST',
      subject: letter.subject,
      body: letter.body,
      dedupKey: `head-digest:${dayKey(today)}:${head.id}`,
      path: '/cabinet/manage',
    });
  }
  return queued;
}

/** Окно сигнала о просроченном платеже — неделя после плановой даты. */
const OVERDUE_WINDOW_DAYS = 7;

/** Сигнал «Просрочен платёж» — один раз на транш, без суммы. */
export async function enqueueTrancheOverdue(at: Date = clockNow()): Promise<number> {
  const today = moscowToday(at);
  const since = new Date(today.getTime() - OVERDUE_WINDOW_DAYS * 86_400_000);
  const [tranches, heads] = await Promise.all([
    prisma.tranche.findMany({
      where: { ...overdueTrancheWhere(today), plannedDate: { lt: today, gte: since } },
      orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        plannedDate: true,
        contract: { select: { project: { select: { id: true, code: true, title: true } } } },
      },
    }),
    prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } }),
  ]);
  let queued = 0;
  for (const tranche of tranches) {
    const work = tranche.contract.project;
    for (const head of heads) {
      queued += await enqueue(prisma, {
        userId: head.id,
        projectId: work.id,
        eventKind: 'TRANCHE_OVERDUE',
        subject: `Просрочен платёж: ${work.code}`,
        body:
          `Работа ${work.code} — ${work.title}.\n` +
          `Платёж «${tranche.title}» не поступил к сроку ${formatDay(tranche.plannedDate!)}.\n` +
          'Напомнить, перенести дату или списать — в «Деньги → Должники».',
        dedupKey: `tranche-overdue:${tranche.id}:${head.id}`,
        path: '/cabinet/manage/finance/debtors',
      });
    }
  }
  return queued;
}

/**
 * Письмо 1-го числа — рекомендации на месяц (требование РК-17, решение
 * Р-350): «Рекомендация месяца» и число неотмеченных по блокам, без сумм.
 * Уходит в первые три дня месяца, один раз на месяц: пропуск расписания
 * 1-го числа письмо не теряет. Без неотмеченных рекомендаций не уходит.
 */
export async function enqueueHeadMonthly(at: Date = clockNow()): Promise<number> {
  const today = moscowToday(at);
  if (today.getUTCDate() > 3) return 0;
  const month = dayKey(today).slice(0, 7);
  const heads = await prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
  let queued = 0;
  for (const head of heads) {
    const actor: Actor = { id: head.id, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
    const advice = await recommendationsFor(actor, at);
    if (advice.unmarked === 0 || advice.month === null) continue;
    const open = <T extends { key: string }>(rows: readonly T[]) => rows.filter((row) => !advice.marks.has(row.key)).length;
    queued += await enqueue(prisma, {
      userId: head.id,
      eventKind: 'HEAD_MONTHLY',
      subject: `Рекомендации на месяц: ${advice.unmarked}`,
      body:
        `Рекомендация месяца: ${advice.month.title}.\n` +
        `Календарь продвижения — ${advice.calendar.now.length}, цена и пакеты — ${open(advice.price)}, ` +
        `возврат клиентов — ${open(advice.returns)}.\n` +
        'Это описательные правила по истории практики, не прогноз. Подробности и отметки — в разделе «Рекомендации».',
      dedupKey: `head-monthly:${month}:${head.id}`,
      path: '/cabinet/manage/recommendations',
    });
  }
  return queued;
}
