/**
 * Контрольные дела руководителя (требование РК-05, решение Р-337; решение
 * владельца В-18).
 *
 * «Контроль» — дело менеджера, не закрытое за срок реакции, по работам,
 * где руководитель не менеджер. Видов четыре (после ответа ОЭ-1 — без
 * «вопроса куратора»):
 * - клиент ждёт ответа — сообщение клиента без отметки прочтения
 *   менеджером (Р-221);
 * - ждёт публикации — замечание или версия куратора на модерации;
 * - заявка без ответа — новая или в разборе;
 * - куратор сдал этап, решения нет (Э-05).
 *
 * Дело контрольное, когда прошёл срок реакции: `reactionDays` рабочих
 * дней после дня, когда оно появилось. Счёт по московским дням и
 * производственному календарю практики.
 */

import { prisma } from '../db.ts';
import { can, type Actor } from './access.ts';
import { loadCalendar } from './approval.ts';
import { moscowToday, now as clockNow } from './clock.ts';
import { reactionDays } from './practice-settings.ts';
import { addWorkdays, type CalendarOverrides } from './workdays.ts';

export type ControlKind = 'client' | 'moderation' | 'lead' | 'handover';

export interface ControlItem {
  readonly key: string;
  readonly kind: ControlKind;
  /** Работа или заявка. */
  readonly title: string;
  /** Менеджер работы; у заявки — `null`. */
  readonly manager: string | null;
  /** С какого мгновения ждёт. */
  readonly since: Date;
  /** Сколько календарных дней ждёт. */
  readonly waitDays: number;
  /** Экран, где руководитель закрывает дело сам. */
  readonly href: string;
  /** Что сделать. */
  readonly todo: string;
}

const DAY = 86_400_000;

/** Срок реакции прошёл: последний его день — до сегодняшнего. */
export function overdue(since: Date, term: number, today: Date, calendar: CalendarOverrides): boolean {
  return addWorkdays(moscowToday(since), term, calendar).getTime() < today.getTime();
}

/** Контрольные дела руководителя по ближайшему ожиданию — давние сверху. */
export async function controlItems(actor: Actor, at: Date = clockNow()): Promise<ControlItem[]> {
  // Контроль — руководителю: он ведёт людей и видит все работы (РК-05).
  if (actor.role !== 'HEAD' || !can(actor, 'AUDIT_VIEW')) return [];
  const [term, calendar] = await Promise.all([reactionDays(), loadCalendar()]);
  const today = moscowToday(at);
  // Грубый отбор по дате — заведомо раньше срока; точный — по календарю.
  const before = new Date(today.getTime() - term * DAY);
  const foreign = { managerId: { not: actor.id }, status: { in: ['ACTIVE' as const, 'PAUSED' as const] } };
  const work = { select: { code: true, title: true, manager: { select: { fullName: true } } } };

  const [messages, comments, versions, leads, handed] = await Promise.all([
    prisma.message.findMany({
      where: { thread: 'CLIENT_MANAGER', readAt: null, author: { role: 'CLIENT' }, createdAt: { lt: before }, project: foreign },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, projectId: true, project: work },
    }),
    prisma.versionComment.findMany({
      where: {
        moderationStatus: 'PENDING',
        author: { role: 'EXPERT' },
        createdAt: { lt: before },
        version: { purgedAt: null, material: { deletedAt: null, project: foreign } },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, version: { select: { material: { select: { id: true, stageId: true, project: work } } } } },
    }),
    prisma.versionModeration.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: before },
        version: { purgedAt: null, material: { deletedAt: null, project: foreign } },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, version: { select: { material: { select: { id: true, stageId: true, project: work } } } } },
    }),
    prisma.lead.findMany({
      where: { status: { in: ['NEW', 'IN_PROGRESS'] }, projectId: null, statusChangedAt: { lt: before } },
      orderBy: { statusChangedAt: 'asc' },
      take: 50,
      select: { id: true, name: true, statusChangedAt: true },
    }),
    prisma.stage.findMany({
      where: { state: 'IN_PROGRESS', handedOverAt: { lt: before }, project: foreign },
      orderBy: { handedOverAt: 'asc' },
      select: { id: true, title: true, handedOverAt: true, project: work },
    }),
  ]);

  const items: ControlItem[] = [];
  const wait = (since: Date) => Math.max(1, Math.floor((today.getTime() - moscowToday(since).getTime()) / DAY));
  const push = (item: Omit<ControlItem, 'waitDays'>) => {
    if (overdue(item.since, term, today, calendar)) items.push({ ...item, waitDays: wait(item.since) });
  };

  // Одно дело на работу — по самому давнему сообщению.
  const seenWork = new Set<string>();
  for (const message of messages) {
    if (message.project === null || message.projectId === null || seenWork.has(message.projectId)) continue;
    seenWork.add(message.projectId);
    push({
      key: `control-client-${message.projectId}`,
      kind: 'client',
      title: message.project.title,
      manager: message.project.manager.fullName,
      since: message.createdAt,
      href: `/cabinet/projects/${message.project.code}/messages`,
      todo: 'Клиент ждёт ответа — ответить в переписке',
    });
  }

  // Одно дело на материал — замечания и версии вместе.
  const seenMaterial = new Set<string>();
  for (const row of [...comments, ...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const material = row.version.material;
    if (seenMaterial.has(material.id)) continue;
    seenMaterial.add(material.id);
    push({
      key: `control-moderation-${material.id}`,
      kind: 'moderation',
      title: material.project.title,
      manager: material.project.manager.fullName,
      since: row.createdAt,
      href:
        material.stageId === null
          ? `/cabinet/projects/${material.project.code}/materials#material-${material.id}`
          : `/cabinet/stages/${material.stageId}`,
      todo: 'Ждёт публикации — опубликовать клиенту или не публиковать с причиной',
    });
  }

  for (const lead of leads) {
    push({
      key: `control-lead-${lead.id}`,
      kind: 'lead',
      title: `Заявка${lead.name === null ? '' : `: ${lead.name}`}`,
      manager: null,
      since: lead.statusChangedAt,
      href: `/cabinet/manage/leads/${lead.id}`,
      todo: 'Заявка без ответа — разобрать',
    });
  }

  for (const stage of handed) {
    push({
      key: `control-handover-${stage.id}`,
      kind: 'handover',
      title: `${stage.title} · ${stage.project.title}`,
      manager: stage.project.manager.fullName,
      since: stage.handedOverAt!,
      href: `/cabinet/stages/${stage.id}`,
      todo: 'Куратор сдал этап, решения нет — на согласование или вернуть куратору',
    });
  }

  return items.sort((a, b) => a.since.getTime() - b.since.getTime());
}
