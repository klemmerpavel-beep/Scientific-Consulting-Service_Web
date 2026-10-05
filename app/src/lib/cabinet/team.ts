/**
 * «Команда»: кто чем занят (требование РК-06, решение Р-343).
 *
 * Руководитель управлял работами, а не людьми: сколько работ у менеджера,
 * где они стоят и что ждёт его решения, нигде не сводилось. Здесь — строка
 * на человека, по менеджерам и кураторам. Числа строятся на тех же
 * определениях, что «Сводка» и «Контроль»:
 * - работ — действующих, идущих и приостановленных (`LIVE_STATUSES`, Р-342);
 * - где стоят — по первому незавершённому этапу, как «Чем занята
 *   практика» (Р-180, Р-216);
 * - просрочено — работа, у которой прошёл срок текущего этапа, а без
 *   плана — срок работы (тот же счёт, что у «Чем занята практика»);
 * - у менеджера «ждёт его решения» — его дела контроля без срока
 *   реакции (Р-337): клиент ждёт ответа (одно на работу), ждёт
 *   публикации (одно на материал), куратор сдал этап;
 * - у куратора — его дела «Что сделать сейчас» (Э-04, Р-329), договор
 *   поручения и способ связи (право `CURATOR_CONTACTS_VIEW`, Э-10).
 */

import { prisma } from '../db.ts';
import { can, type Actor, type ProjectRef } from './access.ts';
import { curatorContacts, type ContactRow } from './channels.ts';
import { moscowToday, now as clockNow } from './clock.ts';
import { curatorTasksData } from './queries.ts';
import { LIVE_STATUSES, LOAD_ORDER } from './summary.ts';
import { nearestPeak } from './analytics/calendar.ts';
import { calendarFor } from './recommendations.ts';

export interface TeamPoint {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

interface PersonLoad {
  readonly id: string;
  readonly fullName: string;
  /** Действующих работ. */
  readonly works: number;
  /** Из них приостановлено. */
  readonly paused: number;
  /** Где стоят работы — по текущему этапу. */
  readonly points: readonly TeamPoint[];
  /** Работ с прошедшим сроком текущего этапа или работы без плана. */
  readonly overdue: number;
  /** Ждёт его решения. */
  readonly decide: number;
  /** «Работы» с отбором по человеку (РК-03). */
  readonly href: string;
}

export interface ManagerLoad extends PersonLoad {
  readonly role: 'MANAGER' | 'HEAD';
  readonly clientWaiting: number;
  readonly moderation: number;
  readonly handedOver: number;
}

export interface CuratorLoad extends PersonLoad {
  /** Действующих работ со сроком в месяце ближайшего пика сдачи (РК-22, Р-354). */
  readonly peakWorks: number;
  readonly ndaSignedAt: Date | null;
  /** Предпочтительный способ связи; без действующих работ — `null`. */
  readonly contact: ContactRow | null;
}

interface WorkRow {
  readonly id: string;
  readonly clientId: string;
  readonly managerId: string;
  readonly expertId: string | null;
  readonly status: string;
  readonly dueOn: Date | null;
  readonly stages: readonly { state: string; dueOn: Date | null }[];
}

export interface Peak {
  readonly key: string;
  readonly year: number;
  readonly month: number;
}

function personLoad(works: readonly WorkRow[], day: Date) {
  const counts = new Map<string, number>();
  let overdue = 0;
  for (const work of works) {
    if (work.stages.length === 0) {
      counts.set('PLANLESS', (counts.get('PLANLESS') ?? 0) + 1);
      if (work.dueOn !== null && work.dueOn < day) overdue += 1;
      continue;
    }
    const current = work.stages.find((stage) => stage.state !== 'DONE') ?? null;
    const key = current?.state ?? 'DONE';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (current?.dueOn != null && current.dueOn < day) overdue += 1;
  }
  return {
    works: works.length,
    paused: works.filter((work) => work.status === 'PAUSED').length,
    points: LOAD_ORDER.map((row) => ({ ...row, count: counts.get(row.key) ?? 0 })).filter((row) => row.count > 0),
    overdue,
  };
}

/** Нагрузка команды — руководителю. Остальным — пусто. */
export async function teamLoad(
  actor: Actor,
  at: Date = clockNow(),
): Promise<{ managers: ManagerLoad[]; curators: CuratorLoad[]; peak: Peak | null }> {
  if (actor.role !== 'HEAD' || !can(actor, 'AUDIT_VIEW')) return { managers: [], curators: [], peak: null };
  // Ближайший пик сдачи по календарю продвижения (РК-22, Р-354; ДР-3).
  const peak = can(actor, 'ANALYTICS_VIEW') ? nearestPeak((await calendarFor(actor, at)).rows, at) : null;
  const inPeak = (date: Date | null) =>
    peak !== null && date !== null && date.getUTCFullYear() === peak.year && date.getUTCMonth() + 1 === peak.month;
  const day = moscowToday(at);
  const live = { status: { in: [...LIVE_STATUSES] } };

  const [people, works, unread, comments, versions, handed] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE', role: { in: ['MANAGER', 'HEAD', 'EXPERT'] } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: { id: true, fullName: true, role: true, status: true, expertProfile: { select: { ndaSignedAt: true } } },
    }),
    prisma.project.findMany({
      where: live,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        clientId: true,
        managerId: true,
        expertId: true,
        status: true,
        dueOn: true,
        stages: { orderBy: { position: 'asc' }, select: { state: true, dueOn: true } },
      },
    }),
    // Клиент ждёт ответа — работа с сообщением клиента без отметки
    // прочтения менеджером (Р-221), как вид «Контроля».
    prisma.message.groupBy({
      by: ['projectId'],
      where: { thread: 'CLIENT_MANAGER', readAt: null, author: { role: 'CLIENT' }, project: live },
    }),
    prisma.versionComment.findMany({
      where: {
        moderationStatus: 'PENDING',
        author: { role: 'EXPERT' },
        version: { purgedAt: null, material: { deletedAt: null, project: live } },
      },
      select: { version: { select: { material: { select: { id: true, project: { select: { managerId: true } } } } } } },
    }),
    prisma.versionModeration.findMany({
      where: { status: 'PENDING', version: { purgedAt: null, material: { deletedAt: null, project: live } } },
      select: { version: { select: { material: { select: { id: true, project: { select: { managerId: true } } } } } } },
    }),
    prisma.stage.findMany({
      where: { state: 'IN_PROGRESS', handedOverAt: { not: null }, project: live },
      select: { project: { select: { managerId: true } } },
    }),
  ]);

  const managerOf = new Map(works.map((work) => [work.id, work.managerId]));
  const tally = (ids: readonly (string | undefined)[]) => {
    const out = new Map<string, number>();
    for (const id of ids) if (id !== undefined) out.set(id, (out.get(id) ?? 0) + 1);
    return out;
  };
  const waitingBy = tally(unread.map((row) => (row.projectId === null ? undefined : managerOf.get(row.projectId))));
  // Одно дело на материал — замечания и версии вместе, как в «Контроле».
  const materials = new Map<string, string>();
  for (const row of [...comments, ...versions]) {
    materials.set(row.version.material.id, row.version.material.project.managerId);
  }
  const moderationBy = tally([...materials.values()]);
  const handedBy = tally(handed.map((stage) => stage.project.managerId));

  const managers: ManagerLoad[] = [];
  const curators: CuratorLoad[] = [];
  for (const person of people) {
    if (person.role === 'MANAGER' || person.role === 'HEAD') {
      const own = works.filter((work) => work.managerId === person.id);
      // Руководитель стоит строкой, только когда сам ведёт работы.
      if (person.role === 'HEAD' && own.length === 0) continue;
      const clientWaiting = waitingBy.get(person.id) ?? 0;
      const moderation = moderationBy.get(person.id) ?? 0;
      const handedOver = handedBy.get(person.id) ?? 0;
      managers.push({
        id: person.id,
        fullName: person.fullName,
        role: person.role,
        ...personLoad(own, day),
        clientWaiting,
        moderation,
        handedOver,
        decide: clientWaiting + moderation + handedOver,
        href: `/cabinet/projects?state=active&manager=${person.id}`,
      });
      continue;
    }
    const own = works.filter((work) => work.expertId === person.id);
    const ndaSignedAt = person.expertProfile?.ndaSignedAt ?? null;
    // Дела куратора — те же, что он видит в «Что сделать сейчас» (Э-04):
    // выборка строится от его лица, его правами.
    const tasks = await curatorTasksData({
      id: person.id,
      role: 'EXPERT',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: ndaSignedAt,
    });
    const first: ProjectRef | undefined = own[0];
    const contacts =
      first !== undefined && can(actor, 'CURATOR_CONTACTS_VIEW', first) ? await curatorContacts(actor, first) : [];
    curators.push({
      id: person.id,
      fullName: person.fullName,
      ...personLoad(own, day),
      peakWorks: own.filter((work) => inPeak(work.dueOn)).length,
      decide: tasks.length,
      ndaSignedAt,
      contact: contacts[0] ?? null,
      href: `/cabinet/projects?state=active&curator=${person.id}`,
    });
  }
  return { managers, curators, peak };
}

/**
 * Блок «Команда» на «Сводке» — до пяти строк: сначала те, у кого больше
 * просроченного и ждущего решения (ОР-2).
 */
export function teamBrief(
  team: { managers: readonly ManagerLoad[]; curators: readonly CuratorLoad[] },
  limit = 5,
) {
  return [
    ...team.managers.map((row) => ({ ...row, side: 'менеджер' as const })),
    ...team.curators.map((row) => ({ ...row, side: 'куратор' as const })),
  ]
    .filter((row) => row.works > 0 || row.decide > 0)
    .sort((a, b) => b.overdue + b.decide - (a.overdue + a.decide) || b.works - a.works || a.fullName.localeCompare(b.fullName))
    .slice(0, limit);
}
