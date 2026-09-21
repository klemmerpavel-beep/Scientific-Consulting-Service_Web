import { prisma } from '../db.ts';
import { can, ensure, scopePayouts, type Actor } from './access.ts';
import { record } from './audit.ts';
import { enqueue } from './outbox.ts';
import { projectRef } from './projects.ts';
import { STATUS_LABEL, type TrancheStatus } from './money.ts';

export { formatAmount, parseAmount, STATUS_LABEL, type TrancheStatus } from './money.ts';

/**
 * Финансовый контур: договор, транши, начисления эксперту, маржа.
 *
 * Механики предоплаченного баланса нет — она сместила бы отношения с
 * «сопровождение по договору» на «счёт с деньгами». Оплата отражается
 * траншами по договору со статусом и закрывающими документами.
 *
 * Деньги считаются в копейках целыми числами. Тип с плавающей точкой к
 * деньгам не применяется: 0.1 + 0.2 в нём не равно 0.3, и расхождение
 * всплывает на сверке, а не на сложении.
 */

export interface ContractInput {
  readonly projectId: string;
  readonly number: string;
  readonly signedOn?: Date | null;
  readonly totalAmount: bigint;
}

/** Завести или изменить договор. Один проект — один договор. */
export async function saveContract(actor: Actor, input: ContractInput) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYMENT_EDIT', ref);

  if (input.totalAmount <= 0n) throw new Error('Сумма договора должна быть больше нуля');
  const number = input.number.trim();
  if (number.length === 0) throw new Error('Номер договора не указан');

  const contract = await prisma.contract.upsert({
    where: { projectId: input.projectId },
    create: {
      projectId: input.projectId,
      number,
      signedOn: input.signedOn ?? null,
      totalAmount: input.totalAmount,
    },
    update: { number, signedOn: input.signedOn ?? null, totalAmount: input.totalAmount },
  });

  await record(actor, {
    action: 'CONTRACT_SAVED',
    objectType: 'Contract',
    objectId: contract.id,
    projectId: input.projectId,
    payload: { number, total: input.totalAmount.toString() },
  });
  return contract;
}

export interface TrancheInput {
  readonly contractId: string;
  readonly title: string;
  readonly amount: bigint;
  readonly plannedDate?: Date | null;
}

/**
 * Добавить транш. Сумма всех траншей сверяется с суммой договора: превышение
 * не запрещается жёстко, потому что в жизни встречается доплата по
 * дополнительному соглашению, но возвращается вызывающему, чтобы тот показал
 * предупреждение, а не молча принял расхождение.
 */
export async function addTranche(actor: Actor, input: TrancheInput) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: input.contractId },
    include: { tranches: true },
  });
  const ref = await projectRef(contract.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYMENT_EDIT', ref);

  if (input.amount <= 0n) throw new Error('Сумма транша должна быть больше нуля');
  const title = input.title.trim();
  if (title.length === 0) throw new Error('Назначение транша не указано');

  const tranche = await prisma.tranche.create({
    data: {
      contractId: input.contractId,
      title,
      amount: input.amount,
      plannedDate: input.plannedDate ?? null,
    },
  });

  const planned = contract.tranches.reduce((sum, t) => sum + t.amount, 0n) + input.amount;
  return { tranche, exceedsContract: planned > contract.totalAmount };
}

/**
 * Изменить статус транша. Оплата и дата платежа связаны жёстко: «оплачен» без
 * даты не отличить от «вероятно, оплачен», а дата без статуса не попадёт
 * в расчёт полученного.
 */
export async function setTrancheStatus(
  actor: Actor,
  trancheId: string,
  status: TrancheStatus,
  paidOn?: Date | null,
) {
  const tranche = await prisma.tranche.findUniqueOrThrow({
    where: { id: trancheId },
    include: { contract: { select: { projectId: true } } },
  });
  const ref = await projectRef(tranche.contract.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYMENT_EDIT', ref);

  if (status === 'PAID' && (paidOn ?? null) === null) {
    throw new Error('Для оплаченного транша нужна дата поступления');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.tranche.update({
      where: { id: trancheId },
      data: { status, paidOn: status === 'PAID' ? paidOn : null },
    });

    const project = await tx.project.findUnique({
      where: { id: tranche.contract.projectId },
      select: { code: true, title: true, client: { select: { userId: true } } },
    });
    const userId = project?.client.userId ?? null;
    if (userId !== null) {
      await enqueue(tx, {
        userId,
        projectId: tranche.contract.projectId,
        eventKind: 'PAYMENT_STATUS_CHANGED',
        subject: `Статус платежа изменился: ${row.title}`,
        body:
          `Проект ${project?.code} — ${project?.title}.\n` +
          `Транш «${row.title}» переведён в состояние «${STATUS_LABEL[status]}».\n` +
          'Документы и состояние оплат видны в кабинете.',
        dedupKey: `tranche:${trancheId}:${status.toLowerCase()}`,
      });
    }
    return row;
  });

  await record(actor, {
    action: 'TRANCHE_STATUS_CHANGED',
    objectType: 'Tranche',
    objectId: trancheId,
    projectId: tranche.contract.projectId,
    payload: { from: tranche.status, to: status },
  });
  return updated;
}

/** Начисление эксперту. Сумма вводится вручную: ставки по типам работ нет. */
export async function addPayout(
  actor: Actor,
  input: {
    projectId: string;
    stageId?: string | null;
    expertId?: string | null;
    amount: bigint;
    comment?: string | null;
  },
) {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYOUT_MANAGE', ref);
  if (input.amount <= 0n) throw new Error('Сумма начисления должна быть больше нуля');

  const payout = await prisma.expertPayout.create({
    data: {
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      expertId: input.expertId ?? ref.expertId,
      amount: input.amount,
      comment: input.comment ?? null,
    },
  });
  await record(actor, {
    action: 'PAYOUT_ACCRUED',
    objectType: 'ExpertPayout',
    objectId: payout.id,
    projectId: input.projectId,
  });
  return payout;
}

export async function markPayoutPaid(actor: Actor, payoutId: string, paidOn: Date) {
  const payout = await prisma.expertPayout.findUniqueOrThrow({ where: { id: payoutId } });
  const ref = await projectRef(payout.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYOUT_MANAGE', ref);

  const updated = await prisma.expertPayout.update({
    where: { id: payoutId },
    data: { status: 'PAID', paidOn },
  });
  await record(actor, {
    action: 'PAYOUT_PAID',
    objectType: 'ExpertPayout',
    objectId: payoutId,
    projectId: payout.projectId,
  });
  return updated;
}

export interface ProjectMoney {
  readonly contractTotal: bigint;
  readonly received: bigint;
  readonly awaiting: bigint;
  readonly writtenOff: bigint;
  /** Заполняется только для роли, допущенной к экономике. */
  readonly payoutsAccrued?: bigint;
  readonly payoutsPaid?: bigint;
  readonly margin?: bigint;
}

/**
 * Деньги по проекту. Состав ответа зависит от роли: клиенту и менеджеру
 * возвращается движение по договору, экономика — только руководителю.
 * Ограничение здесь полевое, а не экранное: свойств `margin` и
 * `payoutsAccrued` в объекте просто нет.
 */
export async function projectMoney(actor: Actor, projectId: string): Promise<ProjectMoney | null> {
  const ref = await projectRef(projectId);
  if (ref === null) return null;
  if (!can(actor, 'CONTRACT_VIEW', ref)) return null;

  const contract = await prisma.contract.findUnique({
    where: { projectId },
    include: { tranches: true },
  });
  if (contract === null) return null;

  const sum = (status: TrancheStatus) =>
    contract.tranches
      .filter((t) => t.status === status)
      .reduce((acc, t) => acc + t.amount, 0n);

  const base: ProjectMoney = {
    contractTotal: contract.totalAmount,
    received: sum('PAID'),
    awaiting: sum('PLANNED') + sum('INVOICED'),
    writtenOff: sum('WRITTEN_OFF'),
  };

  if (!can(actor, 'MARGIN_VIEW', ref)) return base;

  const payouts = await prisma.expertPayout.findMany({ where: { projectId } });
  const accrued = payouts.reduce((acc, p) => acc + p.amount, 0n);
  const paid = payouts
    .filter((p) => p.status === 'PAID')
    .reduce((acc, p) => acc + p.amount, 0n);

  // Маржа нигде не хранится. У исторических строк без исполнителя начислений
  // нет, и маржа сама собой равна сумме договора — отдельной ветви не нужно.
  return { ...base, payoutsAccrued: accrued, payoutsPaid: paid, margin: contract.totalAmount - accrued };
}

/** Сводка по практике для руководителя. */
export async function financeSummary(actor: Actor) {
  ensure(actor, 'MARGIN_VIEW');
  const [contracts, payouts] = await Promise.all([
    prisma.contract.findMany({
      // Порядок задан явно. Без него строки шли физическим порядком в
      // таблице, и он менялся при всякой правке записи: два наполнения
      // подряд давали разный снимок экрана денег, хотя код не менялся
      // (решение Р-190).
      orderBy: { project: { code: 'asc' } },
      include: {
        tranches: true,
        project: { select: { code: true, title: true, status: true, client: { select: { fullName: true } } } },
      },
    }),
    prisma.expertPayout.groupBy({ by: ['projectId'], _sum: { amount: true } }),
  ]);

  const payoutByProject = new Map(payouts.map((p) => [p.projectId, p._sum.amount ?? 0n]));

  const rows = contracts.map((contract) => {
    const received = contract.tranches
      .filter((t) => t.status === 'PAID')
      .reduce((acc, t) => acc + t.amount, 0n);
    const awaiting = contract.tranches
      .filter((t) => t.status === 'PLANNED' || t.status === 'INVOICED')
      .reduce((acc, t) => acc + t.amount, 0n);
    const lost = contract.tranches
      .filter((t) => t.status === 'WRITTEN_OFF')
      .reduce((acc, t) => acc + t.amount, 0n);
    const accrued = payoutByProject.get(contract.projectId) ?? 0n;
    return {
      projectId: contract.projectId,
      code: contract.project.code,
      title: contract.project.title,
      client: contract.project.client.fullName,
      status: contract.project.status,
      contracted: contract.totalAmount,
      received,
      awaiting,
      lost,
      accrued,
      margin: contract.totalAmount - accrued,
    };
  });

  const total = (pick: (row: (typeof rows)[number]) => bigint) =>
    rows.reduce((acc, row) => acc + pick(row), 0n);

  return {
    rows,
    totals: {
      contracted: total((r) => r.contracted),
      received: total((r) => r.received),
      awaiting: total((r) => r.awaiting),
      lost: total((r) => r.lost),
      margin: total((r) => r.margin),
    },
  };
}

/** Собственные начисления эксперта. Маржу он не видит — только своё. */
export async function ownPayouts(actor: Actor) {
  ensure(actor, 'PAYOUT_VIEW_OWN');
  const scope = scopePayouts(actor);
  if (scope === null) return { rows: [], accrued: 0n, paid: 0n };
  const rows = await prisma.expertPayout.findMany({
    where: scope,
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { code: true, title: true } }, stage: { select: { title: true } } },
  });
  return {
    rows,
    accrued: rows.reduce((acc, r) => acc + r.amount, 0n),
    paid: rows.filter((r) => r.status === 'PAID').reduce((acc, r) => acc + r.amount, 0n),
  };
}

/**
 * Договор работы со всеми траншами и приложенными документами.
 *
 * Прежде экран оплат читал это своим запросом к базе, рядом с доменным
 * `projectMoney` по тому же предмету: одно и то же читалось двумя путями,
 * и условие доступа стояло на экране, а не в выборке (решение Р-185).
 */
export async function projectContract(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return null;
  ensure(actor, 'CONTRACT_VIEW', ref);

  return prisma.contract.findUnique({
    where: { projectId },
    include: {
      tranches: {
        orderBy: { plannedDate: 'asc' },
        include: {
          documents: {
            where: { deletedAt: null },
            include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
          },
        },
      },
      documents: {
        where: { deletedAt: null },
        include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
      },
    },
  });
}

/**
 * Начисления экспертам по работе.
 *
 * Закрыто правом на маржу: суммы вознаграждения — предмет руководителя
 * (решение Р-140). Прежде условие стояло на экране (решение Р-185).
 */
export async function projectPayouts(actor: Actor, projectId: string) {
  const ref = await projectRef(projectId);
  if (ref === null) return [];
  ensure(actor, 'MARGIN_VIEW', ref);

  return prisma.expertPayout.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { expert: { select: { fullName: true } } },
  });
}
