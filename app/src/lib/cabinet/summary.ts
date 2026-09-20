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
