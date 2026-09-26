/**
 * Сводка практики для главного экрана руководителя.
 *
 * Сколько заказов, чем практика занята и деньги коротко. Ничего нового
 * здесь не считается — берутся уже проверенные правила денежного контура
 * (`money.ts`) и часов кабинета (`clock.ts`); новое только сведение.
 */

import { can, ensure, type Actor } from './access.ts';
import { prisma } from '../db.ts';
import { scopeProjects } from './access.ts';
import { moscowToday, now as today } from './clock.ts';
import { PAYMENT_CLOSED_STATUSES, outstandingOf, receivableOf } from './money.ts';

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
  /** Списано по траншам: без него закрытый списанием остаток читался «оплачено полностью». */
  readonly writtenOff: bigint | null;
  /**
   * Заведён ли договор. Без этого признака работа без договора выглядела
   * как «0 ₽ по договору · оплачено полностью» (решение Р-256).
   */
  readonly hasContract: boolean;
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
      writtenOff: money
        ? tranches
            .filter((tranche) => tranche.status === 'WRITTEN_OFF')
            .reduce((acc, tranche) => acc + tranche.amount, 0n)
        : null,
      hasContract: project.contract !== null,
      // Переплату в задолженность не записываем: остаток не бывает
      // отрицательным (то же правило, что в финансовом контуре). Списанное
      // долгом не считается (решение Р-240).
      outstanding: money ? outstandingOf(contracted, tranches) : null,
      stage: current?.title ?? null,
      stageState: current?.state ?? null,
    };
  });

  // При равном сроке — по коду. Без второго ключа две работы с одним днём
  // стояли в том порядке, в каком их отдала база, и сводка менялась от
  // прогона к прогону при тех же данных (решение Р-217).
  return rows.sort((a, b) => {
    if (a.dueOn === null) return b.dueOn === null ? a.code.localeCompare(b.code) : 1;
    if (b.dueOn === null) return -1;
    return a.dueOn.getTime() - b.dueOn.getTime() || a.code.localeCompare(b.code);
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
  now: Date = today(),
): Promise<{ points: LoadPoint[]; overdue: number; planless: number; soon: DueSoon[] }> {
  ensure(actor, 'PROJECT_VIEW');
  const scope = scopeProjects(actor);

  const projects = await prisma.project.findMany({
    where: { ...(scope ?? {}), status: 'ACTIVE' },
    // Порядок задан явно: без него строки шли так, как их отдала база
    // (решение Р-229).
    orderBy: { code: 'asc' },
    select: {
      code: true,
      title: true,
      dueOn: true,
      client: { select: { fullName: true } },
      stages: {
        orderBy: { position: 'asc' },
        select: { id: true, title: true, state: true, dueOn: true },
      },
    },
  });

  const counts = new Map<string, number>();
  const soon: DueSoon[] = [];
  // Срок — день: сравнение с началом суток, иначе срок «сегодня» числился
  // сорванным с первой минуты (решение Р-240). Сутки — московские: по
  // UTC вчерашний срок до трёх часов ночи ещё не считался прошедшим
  // (решение Р-256).
  const day = moscowToday(now);
  const horizon = new Date(day.getTime() + SOON_DAYS * 86_400_000);
  let overdue = 0;
  let planless = 0;

  for (const project of projects) {
    const current = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
    // Работа без плана — это почти вся перенесённая книга: этапов в ней
    // нет, одна строка на заказ. Прежде такие работы выпадали из графика и
    // из счёта просрочки, и сводка практики, ведущей учёт книгой, молчала
    // о главном. Теперь они стоят в графике своей строкой, а срок у них —
    // срок работы (решение Р-216).
    if (project.stages.length === 0) {
      planless += 1;
      counts.set('PLANLESS', (counts.get('PLANLESS') ?? 0) + 1);
      if (project.dueOn !== null && project.dueOn < day) overdue += 1;
      continue;
    }
    const key = current?.state ?? 'DONE';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (current?.dueOn != null && current.dueOn < day) overdue += 1;
    // Срок ближайших двух недель берётся у того же текущего этапа: работа
    // стоит на нём, и его срок — это и есть ближайшее обязательство.
    // Просроченное сюда не попадает — оно названо выше отдельно.
    if (current?.dueOn != null && current.dueOn >= day && current.dueOn <= horizon) {
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

  // При равном сроке — по коду: на сводке показываются первые пять, и
  // без второго ключа их набор менялся от прогона к прогону (решение Р-229).
  soon.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime() || a.code.localeCompare(b.code));

  // Порядок — ход работы, а не убывание числа: перечень читается как
  // путь от «не начат» до «на согласовании».
  const ORDER: readonly { key: string; label: string }[] = [
    { key: 'NOT_STARTED', label: 'Не начаты' },
    { key: 'IN_PROGRESS', label: 'В работе' },
    { key: 'AWAITING_CLIENT', label: 'Ждут клиента' },
    { key: 'IN_APPROVAL', label: 'На согласовании' },
    { key: 'DONE', label: 'Все этапы пройдены' },
    { key: 'PLANLESS', label: 'Без плана работ' },
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
  /** Те же кварталы, но предыдущие: без них число ни с чем не сравнить. */
  startedPrevQuarter: number;
  closedPrevQuarter: number;
}> {
  ensure(actor, 'PROJECT_VIEW');
  const scope = scopeProjects(actor) ?? {};
  const DAY = 24 * 60 * 60 * 1000;
  const quarterAgo = new Date(today().getTime() - 90 * DAY);
  const halfYearAgo = new Date(today().getTime() - 180 * DAY);

  const [
    orders,
    active,
    paused,
    completed,
    startedLastQuarter,
    closedLastQuarter,
    startedPrevQuarter,
    closedPrevQuarter,
  ] = await Promise.all([
    prisma.project.count({ where: scope }),
    prisma.project.count({ where: { ...scope, status: 'ACTIVE' } }),
    prisma.project.count({ where: { ...scope, status: 'PAUSED' } }),
    prisma.project.count({ where: { ...scope, status: 'COMPLETED' } }),
    prisma.project.count({ where: { ...scope, startedOn: { gte: quarterAgo } } }),
    prisma.project.count({ where: { ...scope, closedOn: { gte: quarterAgo } } }),
    prisma.project.count({
      where: { ...scope, startedOn: { gte: halfYearAgo, lt: quarterAgo } },
    }),
    prisma.project.count({
      where: { ...scope, closedOn: { gte: halfYearAgo, lt: quarterAgo } },
    }),
  ]);

  return {
    orders,
    active,
    paused,
    completed,
    startedLastQuarter,
    closedLastQuarter,
    startedPrevQuarter,
    closedPrevQuarter,
  };
}

/**
 * Деньги коротко для главной руководителя.
 *
 * Три величины и ни одной лишней: получено, к получению и просрочено по
 * траншам. Без третьей вторая ничего не говорит — завтрашний транш и
 * годовалый долг в ней стоят рядом и выглядят одинаково (решение Р-201).
 *
 * «Просрочено по траншам» — сумма платежей со сроком раньше сегодняшнего
 * дня. Это не «остаток по работам с прошедшим сроком» отчёта и аналитики:
 * там мерой служит срок работы, здесь — день платежа, и под одним словом
 * две величины читались как расхождение (решение Р-256).
 *
 * Считается сложениями по индексу `(status, plannedDate)`, а не разбором
 * всей сводки денег: на главной нужны итоги, а не строки.
 */
export async function moneyBrief(actor: Actor): Promise<{
  received: bigint;
  awaiting: bigint;
  overdue: bigint;
}> {
  ensure(actor, 'MARGIN_VIEW');
  // Просрочен транш со сроком до сегодняшнего дня: со сроком сегодня —
  // ещё нет. Прежде сравнение шло с текущим моментом, и транш становился
  // просроченным в три часа ночи по Москве в самый день срока, а экран
  // траншей его просроченным не показывал (решение Р-236). День —
  // московский (решение Р-256).
  const day = moscowToday(today());
  // Отменённая работа денег не ждёт: её неоплаченное — потеря, и ни в «к
  // получению», ни в просроченное оно не входит (решение Р-256).
  const expecting = { project: { status: { notIn: [...PAYMENT_CLOSED_STATUSES] } } };
  const [received, contracts, overdue] = await Promise.all([
    prisma.tranche.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
    // «К получению» — договор без полученного и списанного, той же функцией,
    // что экран финансов и отчёт: прежде здесь были только заведённые
    // незакрытые транши, и главная расходилась с отчётом на сумму договоров
    // без траншей (решение Р-244).
    prisma.contract.findMany({
      select: {
        totalAmount: true,
        project: { select: { status: true } },
        tranches: { select: { amount: true, status: true } },
      },
    }),
    prisma.tranche.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: ['PLANNED', 'INVOICED'] },
        plannedDate: { lt: day },
        contract: expecting,
      },
    }),
  ]);
  return {
    received: received._sum.amount ?? 0n,
    awaiting: contracts.reduce(
      (acc, c) => acc + receivableOf(c.project.status, c.totalAmount, c.tranches),
      0n,
    ),
    overdue: overdue._sum.amount ?? 0n,
  };
}
