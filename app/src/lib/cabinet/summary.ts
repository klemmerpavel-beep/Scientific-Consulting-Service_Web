/**
 * Сводка практики для главного экрана руководителя.
 *
 * Три величины, которые руководитель хочет видеть, открыв кабинет:
 * сколько заказов, сколько денег получено, сколько из этого прибыль.
 * Ничего нового здесь не считается — берутся уже проверенные выборки
 * финансового контура; новое только сведение и ставка издержек.
 */

import { can, ensure, type Actor } from './access.ts';
import { financeSummary } from './finance.ts';
import { prisma } from '../db.ts';
import { scopeProjects } from './access.ts';

/**
 * Доля издержек, вычитаемая из поступлений при расчёте прибыли.
 *
 * Практику до сих пор вёл сам руководитель: исполнителем по работам
 * выступал он, и вознаграждение сторонним экспертам при переносе книги
 * заказов не восстанавливалось. Поэтому честная себестоимость сводится к
 * накладным расходам — их доля принята заказчиком равной десяти процентам.
 *
 * Это допущение, а не расчёт, и подпись плитки говорит об этом прямо.
 * Как только начисления экспертам появятся в системе, они вычитаются
 * дополнительно и прибыль станет считаться по факту.
 */
export const OVERHEAD_PERCENT = 10n;

export interface PracticeSummary {
  /** Сколько работ всего и сколько из них в работе. */
  readonly orders: number;
  readonly active: number;
  /** Законтрактовано по договорам. */
  readonly contracted: bigint;
  /** Поступило — это и есть выручка. */
  readonly received: bigint;
  /** Ожидается по выставленным и запланированным траншам. */
  readonly outstanding: bigint;
  /** Начислено экспертам; пока начислений нет — ноль. */
  readonly payouts: bigint;
  /** Поступления за вычетом начислений и накладных расходов. */
  readonly profit: bigint;
}

/** Работа, идущая прямо сейчас: то, чем практика занята. */
export interface ActiveWork {
  readonly code: string;
  readonly title: string;
  readonly client: string;
  readonly dueOn: Date | null;
  /**
   * Деньги стоят `null` у того, кому они не открыты. Поля нет в объекте по
   * значению, а не по условию в разметке: показать нечего, даже если
   * разметку перепишут (тот же порядок, что у `present*` в `access.ts`).
   */
  readonly contracted: bigint | null;
  readonly received: bigint | null;
  readonly outstanding: bigint | null;
  readonly stage: string | null;
  readonly stageState: string | null;
}

/**
 * Перечень действующих работ.
 *
 * Нужен не архив, а то, что в работе: на каком этапе каждая и когда срок.
 * Сортировка по сроку — ближайший сверху; работы без срока уходят вниз.
 *
 * Выборку видят обе служебные роли, и каждая — своё: `scopeProjects`
 * оставляет менеджеру работы, где он куратор (Р-149). Прежде перечень был
 * закрыт правом на маржу целиком, и менеджеру главный экран показывал два
 * блока на половину окна, а вторая половина пустовала (решение Р-175).
 * Деньги по-прежнему за правом на маржу — но снимаются из строки, а не
 * запирают перечень.
 */
export async function activeWorks(actor: Actor): Promise<ActiveWork[]> {
  ensure(actor, 'PROJECT_VIEW');
  const money = can(actor, 'MARGIN_VIEW');
  const scope = scopeProjects(actor);

  const projects = await prisma.project.findMany({
    where: { ...(scope ?? {}), status: 'ACTIVE' },
    select: {
      code: true,
      title: true,
      dueOn: true,
      client: { select: { fullName: true } },
      contract: { select: { totalAmount: true, tranches: { select: { amount: true, status: true } } } },
      stages: { orderBy: { position: 'asc' }, select: { title: true, state: true } },
    },
  });

  const rows = projects.map((project) => {
    const tranches = project.contract?.tranches ?? [];
    const received = tranches
      .filter((tranche) => tranche.status === 'PAID')
      .reduce((acc, tranche) => acc + tranche.amount, 0n);
    const contracted = project.contract?.totalAmount ?? 0n;
    const current = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
    return {
      code: project.code,
      title: project.title,
      client: project.client.fullName,
      dueOn: project.dueOn,
      contracted: money ? contracted : null,
      received: money ? received : null,
      // Переплату в задолженность не записываем: остаток не бывает
      // отрицательным (то же правило, что в финансовом контуре).
      outstanding: money ? (contracted > received ? contracted - received : 0n) : null,
      stage: current?.title ?? null,
      stageState: current?.state ?? null,
    };
  });

  return rows.sort((a, b) => {
    if (a.dueOn === null) return b.dueOn === null ? 0 : 1;
    if (b.dueOn === null) return -1;
    return a.dueOn.getTime() - b.dueOn.getTime();
  });
}

/** Сколько работ в каждом состоянии и сколько из них со сроком в прошлом. */
export interface LoadPoint {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** Этап, срок которого наступает в ближайшие две недели. */
export interface DueSoon {
  readonly id: string;
  readonly code: string;
  /** Название работы: код с экранов убран и человеку ничего не говорит. */
  readonly title: string;
  readonly stage: string;
  readonly client: string;
  readonly dueOn: Date;
}

/**
 * Окно ближайших сроков — две недели.
 *
 * Неделя коротка: при сроках, назначаемых по этапам в месяц, в окно
 * попадает один-два этапа, и перечень не говорит ничего о месяце. Месяц
 * длинен: в него попадает всё подряд, и срочное перестаёт отличаться от
 * планового. Две недели — решение заказчика.
 */
const SOON_DAYS = 14;

/**
 * Загрузка практики по состоянию текущего этапа.
 *
 * Плитки отвечают на вопрос «сколько денег», но не на вопрос «чем занята
 * практика»: пять работ в согласовании и пять, ждущих клиента, — это
 * разные положения дел при одной и той же выручке. Состояние берётся у
 * первого незавершённого этапа: он и есть то, где работа стоит сейчас
 * (решение Р-180).
 */
export async function stageLoad(
  actor: Actor,
  now: Date = new Date(),
): Promise<{ points: LoadPoint[]; overdue: number; planless: number; soon: DueSoon[] }> {
  ensure(actor, 'PROJECT_VIEW');
  const scope = scopeProjects(actor);

  const projects = await prisma.project.findMany({
    where: { ...(scope ?? {}), status: 'ACTIVE' },
    select: {
      code: true,
      title: true,
      client: { select: { fullName: true } },
      stages: {
        orderBy: { position: 'asc' },
        select: { id: true, title: true, state: true, dueOn: true },
      },
    },
  });

  const counts = new Map<string, number>();
  const soon: DueSoon[] = [];
  const horizon = new Date(now.getTime() + SOON_DAYS * 86_400_000);
  let overdue = 0;
  let planless = 0;

  for (const project of projects) {
    const current = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
    if (project.stages.length === 0) {
      planless += 1;
      continue;
    }
    const key = current?.state ?? 'DONE';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (current?.dueOn != null && current.dueOn < now) overdue += 1;
    // Срок ближайших двух недель берётся у того же текущего этапа: работа
    // стоит на нём, и его срок — это и есть ближайшее обязательство.
    // Просроченное сюда не попадает — оно названо выше отдельно.
    if (current?.dueOn != null && current.dueOn >= now && current.dueOn <= horizon) {
      soon.push({
        id: current.id,
        code: project.code,
        title: project.title,
        stage: current.title,
        client: project.client.fullName,
        dueOn: current.dueOn,
      });
    }
  }

  soon.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());

  // Порядок — ход работы, а не убывание числа: перечень читается как
  // путь от «не начат» до «на согласовании».
  const ORDER: readonly { key: string; label: string }[] = [
    { key: 'NOT_STARTED', label: 'Не начаты' },
    { key: 'IN_PROGRESS', label: 'В работе' },
    { key: 'AWAITING_CLIENT', label: 'Ждут клиента' },
    { key: 'IN_APPROVAL', label: 'На согласовании' },
    { key: 'DONE', label: 'Все этапы пройдены' },
  ];

  return {
    points: ORDER.map((row) => ({ ...row, count: counts.get(row.key) ?? 0 })).filter(
      (row) => row.count > 0,
    ),
    overdue,
    planless,
    soon,
  };
}

/**
 * Состояние заказов без денег.
 *
 * Главная руководителя показывает, чем практика занята, а не сколько она
 * заработала: деньгам отведён свой экран, и выносить их дважды заказчик
 * запретил (решение Р-194). Право спрашивается то же, что на перечень
 * работ, — деньги здесь не участвуют вовсе.
 */
export async function orderSummary(actor: Actor): Promise<{
  orders: number;
  active: number;
  paused: number;
  completed: number;
  startedLastQuarter: number;
  closedLastQuarter: number;
}> {
  ensure(actor, 'PROJECT_VIEW');
  const scope = scopeProjects(actor) ?? {};
  const quarterAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [orders, active, paused, completed, startedLastQuarter, closedLastQuarter] =
    await Promise.all([
      prisma.project.count({ where: scope }),
      prisma.project.count({ where: { ...scope, status: 'ACTIVE' } }),
      prisma.project.count({ where: { ...scope, status: 'PAUSED' } }),
      prisma.project.count({ where: { ...scope, status: 'COMPLETED' } }),
      prisma.project.count({ where: { ...scope, startedOn: { gte: quarterAgo } } }),
      prisma.project.count({ where: { ...scope, closedOn: { gte: quarterAgo } } }),
    ]);

  return { orders, active, paused, completed, startedLastQuarter, closedLastQuarter };
}

export async function practiceSummary(actor: Actor): Promise<PracticeSummary> {
  ensure(actor, 'MARGIN_VIEW');

  const scope = scopeProjects(actor);
  const [orders, active, finance] = await Promise.all([
    prisma.project.count({ where: scope ?? undefined }),
    prisma.project.count({ where: { ...(scope ?? {}), status: 'ACTIVE' } }),
    financeSummary(actor),
  ]);

  const received = finance.totals.received;
  const payouts = finance.rows.reduce((acc, row) => acc + row.accrued, 0n);
  // Деление целых: копейка округления в меньшую сторону безразлична, а
  // плавающая точка к деньгам не применяется.
  const overhead = (received * OVERHEAD_PERCENT) / 100n;

  return {
    orders,
    active,
    contracted: finance.totals.contracted,
    received,
    outstanding: finance.totals.awaiting,
    payouts,
    profit: received - payouts - overhead,
  };
}
