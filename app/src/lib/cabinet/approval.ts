import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { siteUrl } from '../site-url.ts';
import { formatDay } from './approval-text.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { enqueue, notifyCurator, notifyExpert } from './outbox.ts';
import {
  addWorkdays,
  dayKey,
  previousWorkday,
  workdaysBetween,
  type CalendarOverrides,
} from './workdays.ts';

/**
 * Срок согласования этапа (требование Т-15, решение Р-290).
 *
 * Оферта, п. 7.2: заказчик в течение пяти рабочих дней с даты направления
 * результата подписывает акт либо направляет мотивированные замечания;
 * п. 7.3: не сделал ни того ни другого — этап считается принятым. Кабинет
 * прежде срока не знал: этап мог стоять на согласовании месяцами, а экран
 * и оферта говорили о разном.
 *
 * Срок ставится при сдаче этапа и гаснет при возврате и снятии с
 * согласования. Автозакрытие по п. 7.3 включается переключателем
 * `APPROVAL_AUTO_ACCEPT` — после того как шаблон Задания назовёт кабинет
 * способом направления результата (О-8). До этого срок показывается и о
 * нём напоминают, но этап сам не закрывается.
 *
 * Расчёт идёт по настоящим часам: `CABINET_NOW` (часы снимков, Р-205)
 * сюда не доходит — ошибка в часах здесь закрыла бы этап, а не сдвинула
 * подпись.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Пределы срока: не меньше пяти рабочих дней — п. 7.2 оферты. */
export const APPROVAL_DAYS_MIN = 5;
export const APPROVAL_DAYS_MAX = 20;

/** Запись в истории этапа и работы при автозакрытии. */
export const AUTO_ACCEPT_NOTE = 'Этап принят по истечении срока согласования (п. 7.3 оферты)';

/** Автозакрытие по п. 7.3 оферты; по умолчанию выключено (О-8). */
export function autoAcceptEnabled(): boolean {
  return /^(1|true|on|yes)$/iu.test(process.env.APPROVAL_AUTO_ACCEPT?.trim() ?? '');
}

export { formatDay };

/** Строка письма со ссылкой на экран этапа; без адреса сайта — общая. */
export function stageLink(stageId: string): string {
  const base = siteUrl();
  return base === null ? 'Открыть этап можно в личном кабинете.' : `Открыть этап: ${base}/cabinet/stages/${stageId}`;
}

/** Производственный календарь целиком: записей — десяток в год. */
export async function loadCalendar(db: Db = prisma): Promise<CalendarOverrides> {
  const rows = await db.calendarDay.findMany({ select: { day: true, workday: true } });
  return new Map(rows.map((row) => [dayKey(row.day), row.workday]));
}

/** Последний день срока: `days` рабочих дней со дня, следующего за сдачей. */
export function approvalDeadline(sentAt: Date, days: number, calendar: CalendarOverrides): Date {
  return addWorkdays(moscowToday(sentAt), days, calendar);
}

/** Истёк ли срок к моменту `at`: последний день срока — включительно. */
export function approvalExpired(dueOn: Date | null, at: Date = new Date()): boolean {
  return dueOn !== null && moscowToday(at).getTime() > dueOn.getTime();
}

/** Отказ действию клиента после срока при включённом автозакрытии. */
export function ensureApprovalOpen(dueOn: Date | null, at: Date = new Date()): void {
  if (dueOn !== null && autoAcceptEnabled() && approvalExpired(dueOn, at)) {
    throw new Error(`Срок согласования истёк ${formatDay(dueOn)}: этап принят по п. 7.3 оферты`);
  }
}

/**
 * Работа выходит из действия: срок снимается, остаток рабочих дней
 * сохраняется. Отсчёт остатка — со следующего дня; меньше одного дня
 * остаток не бывает. Вызывается в транзакции смены состояния работы.
 */
export async function holdApprovalDeadlines(tx: Db, projectId: string, at: Date): Promise<void> {
  const stages = await tx.stage.findMany({
    where: { projectId, state: 'IN_APPROVAL', approvalDueOn: { not: null } },
    select: { id: true, approvalDueOn: true },
  });
  if (stages.length === 0) return;
  const calendar = await loadCalendar(tx);
  const from = new Date(moscowToday(at).getTime() + 86_400_000);
  for (const stage of stages) {
    const left = Math.max(1, workdaysBetween(from, stage.approvalDueOn!, calendar));
    await tx.stage.update({
      where: { id: stage.id },
      data: { approvalDueOn: null, approvalDaysLeft: left },
    });
  }
}

/** Работа вернулась в действие: новый срок — от дня возобновления на остаток. */
export async function resumeApprovalDeadlines(tx: Db, projectId: string, at: Date): Promise<void> {
  const stages = await tx.stage.findMany({
    where: { projectId, state: 'IN_APPROVAL', approvalDaysLeft: { not: null } },
    select: { id: true, approvalDaysLeft: true },
  });
  if (stages.length === 0) return;
  const calendar = await loadCalendar(tx);
  for (const stage of stages) {
    await tx.stage.update({
      where: { id: stage.id },
      data: {
        approvalDueOn: addWorkdays(moscowToday(at), stage.approvalDaysLeft!, calendar),
        approvalDaysLeft: null,
      },
    });
  }
}

/**
 * Срок для этапов, стоящих на согласовании без него: при выкате и у
 * клиента, которому вход открыли после сдачи. Результат «направлен»
 * тогда, когда клиент может его увидеть, поэтому срок идёт от этого дня, а
 * не от старой даты перехода; клиент получает письмо с датой.
 */
export async function startMissingDeadlines(at: Date = new Date()): Promise<number> {
  const stages = await prisma.stage.findMany({
    where: {
      state: 'IN_APPROVAL',
      approvalDueOn: null,
      approvalDaysLeft: null,
      project: { status: 'ACTIVE', client: { userId: { not: null } } },
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      project: {
        select: { code: true, title: true, approvalDays: true, client: { select: { userId: true } } },
      },
    },
  });
  if (stages.length === 0) return 0;
  const calendar = await loadCalendar();
  let started = 0;
  for (const stage of stages) {
    const dueOn = approvalDeadline(at, stage.project.approvalDays, calendar);
    const userId = stage.project.client.userId;
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.stage.updateMany({
        where: { id: stage.id, state: 'IN_APPROVAL', approvalDueOn: null, approvalDaysLeft: null },
        data: { approvalSentAt: at, approvalDueOn: dueOn },
      });
      if (claimed.count === 0) return false;
      if (userId !== null) {
        await enqueue(tx, {
          userId,
          projectId: stage.projectId,
          eventKind: 'STAGE_IN_APPROVAL',
          subject: `Срок согласования этапа «${stage.title}»`,
          body:
            `Проект ${stage.project.code} — ${stage.project.title}.\n` +
            `Этап «${stage.title}» ждёт вашего согласования. Согласуйте его или верните с замечаниями ` +
            `до ${formatDay(dueOn)} включительно (по московскому времени).\n` +
            stageLink(stage.id),
          dedupKey: `stage:${stage.id}:approval-due:${dayKey(dueOn)}`,
          path: `/cabinet/stages/${stage.id}`,
        });
      }
      return true;
    });
    if (done) started += 1;
  }
  return started;
}

/**
 * Напоминание клиенту за один рабочий день до срока согласования. Ключ —
 * этап и последний день срока: новый срок даёт новое напоминание, а
 * прогон каждую минуту — не больше одного письма.
 */
export async function enqueueApprovalReminders(at: Date = new Date()): Promise<number> {
  const today = moscowToday(at);
  const stages = await prisma.stage.findMany({
    where: {
      state: 'IN_APPROVAL',
      approvalDueOn: { gte: today },
      project: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      approvalDueOn: true,
      project: { select: { code: true, title: true, client: { select: { userId: true } } } },
    },
  });
  if (stages.length === 0) return 0;
  const calendar = await loadCalendar();
  const auto = autoAcceptEnabled();
  let queued = 0;
  for (const stage of stages) {
    const userId = stage.project.client.userId;
    const dueOn = stage.approvalDueOn!;
    if (userId === null) continue;
    if (today.getTime() < previousWorkday(dueOn, calendar).getTime()) continue;
    queued += await enqueue(prisma, {
      userId,
      projectId: stage.projectId,
      eventKind: 'DEADLINE_APPROVAL_SOON',
      subject: `Согласуйте этап «${stage.title}» до ${formatDay(dueOn)}`,
      body:
        `Проект ${stage.project.code} — ${stage.project.title}.\n` +
        `Срок согласования этапа «${stage.title}» — до ${formatDay(dueOn)} включительно ` +
        '(по московскому времени).\n' +
        (auto
          ? 'Если до этой даты вы не согласуете этап и не вернёте его с замечаниями, он считается принятым — п. 7.3 оферты.\n'
          : '') +
        stageLink(stage.id),
      dedupKey: `stage:${stage.id}:approval-soon:${dayKey(dueOn)}`,
      path: `/cabinet/stages/${stage.id}`,
    });
  }
  return queued;
}

/**
 * Автозакрытие по п. 7.3 оферты: этапы действующих работ, срок которых
 * истёк, переходят в «Завершён» без автора. Строка захватывается условием
 * по состоянию и сроку — два одновременных прогона закрывают этап один раз
 * (образец — Р-240). Клиент и куратор получают письма.
 */
export async function autoAcceptExpired(at: Date = new Date()): Promise<number> {
  if (!autoAcceptEnabled()) return 0;
  const stages = await prisma.stage.findMany({
    where: {
      state: 'IN_APPROVAL',
      approvalDueOn: { lt: moscowToday(at) },
      project: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      approvalDueOn: true,
      project: { select: { code: true, title: true, client: { select: { userId: true } } } },
    },
  });
  let closed = 0;
  for (const stage of stages) {
    const dueOn = stage.approvalDueOn!;
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.stage.updateMany({
        where: { id: stage.id, state: 'IN_APPROVAL', approvalDueOn: dueOn },
        data: { state: 'DONE', completedAt: at },
      });
      if (claimed.count === 0) return false;
      const change = await tx.stageStateChange.create({
        data: {
          stageId: stage.id,
          fromState: 'IN_APPROVAL',
          toState: 'DONE',
          actorId: null,
          reason: AUTO_ACCEPT_NOTE,
          via: 'AUTO_ACCEPT',
        },
      });
      await tx.projectEvent.create({
        data: {
          projectId: stage.projectId,
          actorId: null,
          kind: 'STAGE_STATE_CHANGED',
          payload: {
            stageId: stage.id,
            from: 'IN_APPROVAL',
            to: 'DONE',
            reason: AUTO_ACCEPT_NOTE,
            via: 'AUTO_ACCEPT',
          },
        },
      });
      const userId = stage.project.client.userId;
      if (userId !== null) {
        await enqueue(tx, {
          userId,
          projectId: stage.projectId,
          eventKind: 'STAGE_APPROVED',
          subject: `Этап «${stage.title}» принят`,
          body:
            `Проект ${stage.project.code} — ${stage.project.title}.\n` +
            `Срок согласования этапа «${stage.title}» истёк ${formatDay(dueOn)}: этап принят по п. 7.3 оферты.\n` +
            stageLink(stage.id),
          dedupKey: `stage:${stage.id}:auto-accepted:${change.id}`,
          path: `/cabinet/stages/${stage.id}`,
        });
      }
      await notifyCurator(tx, {
        projectId: stage.projectId,
        actorId: null,
        eventKind: 'STAGE_APPROVED',
        subject: `Этап «${stage.title}» принят по истечении срока`,
        body: `${AUTO_ACCEPT_NOTE}: «${stage.title}».\nМожно запускать следующий этап.\n${stageLink(stage.id)}`,
        key: `stage:${stage.id}:auto-accepted:${change.id}`,
        path: `/cabinet/stages/${stage.id}`,
      });
      // Куратору работы — тоже (требование Э-09, решение Р-328).
      await notifyExpert(tx, {
        projectId: stage.projectId,
        actorId: null,
        eventKind: 'STAGE_APPROVED',
        letter: (work) => ({
          subject: `Этап «${stage.title}» принят по истечении срока`,
          body: `Работа ${work.code}.\n${AUTO_ACCEPT_NOTE}: «${stage.title}».\n${stageLink(stage.id)}`,
        }),
        key: `stage:${stage.id}:auto-accepted-expert:${change.id}`,
        path: `/cabinet/stages/${stage.id}`,
      });
      return true;
    });
    if (!done) continue;
    closed += 1;
    // Первая запись журнала без автора: действие совершила система по
    // правилу оферты, а не человек (Р-239 дополняется).
    await record(null, {
      action: 'STAGE_APPROVED',
      objectType: 'Stage',
      objectId: stage.id,
      projectId: stage.projectId,
      payload: { from: 'IN_APPROVAL', to: 'DONE', via: 'AUTO_ACCEPT' },
    });
  }
  return closed;
}
