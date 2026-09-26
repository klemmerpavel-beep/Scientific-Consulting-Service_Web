import { prisma } from '../db.ts';
import { can, ensure, scopePayouts, type Actor } from './access.ts';
import { record } from './audit.ts';
import { now as today } from './clock.ts';
import { enqueue } from './outbox.ts';
import { projectRef } from './projects.ts';
import {
  STATUS_LABEL,
  canChangeTrancheStatus,
  isTrancheStatus,
  outstandingOf,
  type TrancheStatus,
} from './money.ts';

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

/**
 * Можно ли писать деньги по работе (решение Р-244).
 *
 * По обезличенному клиенту новые денежные записи не заводятся: название
 * транша и комментарий начисления — свободный текст, и туда попадала бы
 * фамилия после исполнения требования субъекта (Р-234). У отменённой
 * работы не заводятся новые транши и начисления — оплату уже выставленных
 * траншей отметить можно (`fresh: false`).
 */
async function ensureMoneyWritable(projectId: string, fresh: boolean): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, client: { select: { erasedAt: true } } },
  });
  if (project === null) throw new Error('Проект не найден');
  if (project.client.erasedAt !== null) {
    throw new Error('Данные клиента удалены по его требованию: новые денежные записи по работе не заводятся');
  }
  if (fresh && project.status === 'CANCELLED') {
    throw new Error('Работа отменена: новые транши и начисления по ней не заводятся');
  }
}

/**
 * Дата поступления или выплаты — не в будущем по часам кабинета и не
 * раньше 2000 года. Опечатка «2062» уводила оплату в строку 2062 года
 * итогов и мимо отчёта за период (решение Р-244).
 */
function ensurePastDate(on: Date, what: string): void {
  const now = today();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (on.getTime() > end) throw new Error(`${what} не может быть позже сегодняшнего дня`);
  if (on.getUTCFullYear() < 2000) throw new Error(`${what} указана неверно`);
}

const money = (value: bigint) => value.toString();

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

  const before = await prisma.contract.findUnique({
    where: { projectId: input.projectId },
    include: { tranches: { select: { amount: true, status: true } } },
  });
  await ensureMoneyWritable(input.projectId, before === null);
  // Сумма договора не опускается ниже полученного: иначе остаток ушёл бы в
  // минус, а переплата выглядела бы долгом наоборот (решение Р-244).
  if (before !== null) {
    const received = before.tranches
      .filter((t) => t.status === 'PAID')
      .reduce((acc, t) => acc + t.amount, 0n);
    if (input.totalAmount < received) {
      throw new Error('Сумма договора меньше уже полученного по нему');
    }
  }
  const taken = await prisma.contract.findFirst({
    where: { number, projectId: { not: input.projectId } },
    select: { id: true },
  });
  if (taken !== null) throw new Error(`Договор с номером «${number}» уже заведён по другой работе`);

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

  // Правка договора — прежние номер и сумма рядом с новыми: иначе по
  // журналу не восстановить, с чего начиналось (решение Р-244).
  await record(actor, {
    action: 'CONTRACT_SAVED',
    objectType: 'Contract',
    objectId: contract.id,
    projectId: input.projectId,
    payload:
      before === null
        ? { number, total: money(input.totalAmount) }
        : {
            number,
            total: money(input.totalAmount),
            numberFrom: before.number,
            totalFrom: money(before.totalAmount),
          },
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
  if (title.length > 300) throw new Error('Назначение транша — не длиннее 300 знаков');
  await ensureMoneyWritable(contract.projectId, true);

  const tranche = await prisma.tranche.create({
    data: {
      contractId: input.contractId,
      title,
      amount: input.amount,
      plannedDate: input.plannedDate ?? null,
    },
  });
  // Заведение транша прежде не оставляло следа в журнале вовсе (Р-244).
  await record(actor, {
    action: 'TRANCHE_ADDED',
    objectType: 'Tranche',
    objectId: tranche.id,
    projectId: contract.projectId,
    payload: {
      amount: money(input.amount),
      plannedDate: input.plannedDate?.toISOString().slice(0, 10) ?? null,
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

  if (!isTrancheStatus(status)) throw new Error('Неизвестный статус транша');
  if (!canChangeTrancheStatus(tranche.status as TrancheStatus, status)) {
    throw new Error(
      `Транш «${STATUS_LABEL[tranche.status as TrancheStatus]}» в «${STATUS_LABEL[status]}» не переводится`,
    );
  }
  if (status === 'PAID' && (paidOn ?? null) === null) {
    throw new Error('Для оплаченного транша нужна дата поступления');
  }
  if (status === 'PAID') ensurePastDate(paidOn!, 'Дата поступления');
  await ensureMoneyWritable(tranche.contract.projectId, false);

  const updated = await prisma.$transaction(async (tx) => {
    // Перевод захватывает транш по прежнему статусу. Прежде «Отметить
    // оплату» и «Списать», пришедшие почти одновременно, проходили оба:
    // оплата стиралась в «списан» — ровно то, что запретил Р-224
    // (решение Р-244).
    const claimed = await tx.tranche.updateMany({
      where: { id: trancheId, status: tranche.status },
      data: { status, paidOn: status === 'PAID' ? paidOn : null },
    });
    if (claimed.count === 0) {
      throw new Error('Статус транша уже изменён другим действием: обновите страницу');
    }
    const row = await tx.tranche.findUniqueOrThrow({ where: { id: trancheId } });

    const project = await tx.project.findUnique({
      where: { id: tranche.contract.projectId },
      select: { code: true, title: true, client: { select: { userId: true } } },
    });
    const userId = project?.client.userId ?? null;
    // Списание — внутреннее решение практики, клиенту о нём не пишется
    // (решение Р-244).
    if (userId !== null && status !== 'WRITTEN_OFF') {
      await enqueue(tx, {
        userId,
        projectId: tranche.contract.projectId,
        eventKind: 'PAYMENT_STATUS_CHANGED',
        subject: `Статус платежа изменился: ${row.title}`,
        body:
          `Проект ${project?.code} — ${project?.title}.\n` +
          `Транш «${row.title}» переведён в состояние «${STATUS_LABEL[status]}».\n` +
          'Документы и состояние оплат видны в кабинете.',
        // Ключ по моменту перехода: счёт, отозванный и выставленный снова,
        // прежде не доходил — строка с тем же ключом уже была (Р-244).
        dedupKey: `tranche:${trancheId}:${status.toLowerCase()}:${row.updatedAt.getTime()}`,
      });
    }
    return row;
  });

  await record(actor, {
    action: 'TRANCHE_STATUS_CHANGED',
    objectType: 'Tranche',
    objectId: trancheId,
    projectId: tranche.contract.projectId,
    payload: {
      from: tranche.status,
      to: status,
      amount: money(tranche.amount),
      paidOn: status === 'PAID' ? paidOn!.toISOString().slice(0, 10) : null,
    },
  });
  return updated;
}

/**
 * Убрать транш, ошибочно заведённый: только плановый и без документов.
 * Прежде ошибку в сумме транша лечило только списание, и опечатка навсегда
 * оставалась в «Списано» (решение Р-244).
 */
export async function removeTranche(actor: Actor, trancheId: string) {
  const tranche = await prisma.tranche.findUniqueOrThrow({
    where: { id: trancheId },
    include: {
      contract: { select: { projectId: true } },
      documents: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  const ref = await projectRef(tranche.contract.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYMENT_EDIT', ref);
  if (tranche.documents.length > 0) {
    throw new Error('К траншу приложены документы: такой транш не удаляется');
  }
  const removed = await prisma.tranche.deleteMany({ where: { id: trancheId, status: 'PLANNED' } });
  if (removed.count === 0) {
    throw new Error('Удалить можно только плановый транш: выставленный отзывается, оплаченный остаётся');
  }
  await record(actor, {
    action: 'TRANCHE_REMOVED',
    objectType: 'Tranche',
    objectId: trancheId,
    projectId: tranche.contract.projectId,
    payload: { amount: money(tranche.amount) },
  });
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
  // Начисление без исполнителя уменьшало маржу, а видеть его было некому
  // (решение Р-244).
  const expertId = input.expertId ?? ref.expertId;
  if (expertId === null) throw new Error('Сначала назначьте исполнителя работы');
  const comment = input.comment?.trim() || null;
  if (comment !== null && comment.length > 500) throw new Error('Комментарий — не длиннее 500 знаков');
  await ensureMoneyWritable(input.projectId, true);

  const payout = await prisma.expertPayout.create({
    data: {
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      expertId,
      amount: input.amount,
      comment,
    },
  });
  await record(actor, {
    action: 'PAYOUT_ACCRUED',
    objectType: 'ExpertPayout',
    objectId: payout.id,
    projectId: input.projectId,
    payload: { amount: money(input.amount) },
  });
  return payout;
}

export async function markPayoutPaid(actor: Actor, payoutId: string, paidOn: Date) {
  const payout = await prisma.expertPayout.findUniqueOrThrow({ where: { id: payoutId } });
  const ref = await projectRef(payout.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PAYOUT_MANAGE', ref);
  ensurePastDate(paidOn, 'Дата выплаты');

  // Отметка захватывает начисление в состоянии «начислено». Прежде повторная
  // отметка переписывала дату выплаты, и расход переезжал в другой год
  // итогов задним числом (решение Р-244).
  const claimed = await prisma.expertPayout.updateMany({
    where: { id: payoutId, status: 'ACCRUED' },
    data: { status: 'PAID', paidOn },
  });
  if (claimed.count === 0) throw new Error('Начисление уже отмечено выплаченным');
  const updated = await prisma.expertPayout.findUniqueOrThrow({ where: { id: payoutId } });
  await record(actor, {
    action: 'PAYOUT_PAID',
    objectType: 'ExpertPayout',
    objectId: payoutId,
    projectId: payout.projectId,
    payload: { amount: money(payout.amount), paidOn: paidOn.toISOString().slice(0, 10) },
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

  // Маржа нигде не хранится: договор без списанного и без начислений.
  // Списанное — деньги, которых уже не ждут; прежде маржа их учитывала, и
  // работа в убытке показывалась прибыльной (решение Р-244).
  return {
    ...base,
    payoutsAccrued: accrued,
    payoutsPaid: paid,
    margin: contract.totalAmount - base.writtenOff - accrued,
  };
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
    // «К получению» — договор без полученного и списанного, той же
    // функцией, что главная и отчёт. Прежде здесь суммировались только
    // заведённые незакрытые транши: договор без траншей давал ноль, выпадал
    // из отбора «С остатком», и экран писал «все работы оплачены» при не
    // полученных деньгах (решение Р-244).
    const awaiting = outstandingOf(contract.totalAmount, contract.tranches);
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
      // Договор без списанного и без начислений (решение Р-244).
      margin: contract.totalAmount - lost - accrued,
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
        orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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
