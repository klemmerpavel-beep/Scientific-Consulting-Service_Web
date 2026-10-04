import { prisma } from '../db.ts';
import { can, ensure, scopePayouts, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { enqueue } from './outbox.ts';
import { payoutLetter } from './curator-letters.ts';
import { projectRef } from './projects.ts';
import { siteUrl } from '../site-url.ts';

/**
 * Строка письма о платеже со ссылкой на экран оплат этой работы, а не на
 * кабинет вообще (решение Р-280). Без адреса сайта — прежняя фраза.
 */
export function paymentsLine(code: string | null): string {
  const base = siteUrl();
  return base === null || code === null
    ? 'Документы и состояние оплат видны в кабинете.'
    : `Документы и состояние оплат: ${base}/cabinet/projects/${code}/payments`;
}
import {
  STATUS_LABEL,
  canChangeTrancheStatus,
  expectsPayment,
  isTrancheStatus,
  receivableOf,
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
 *
 * «Сегодня» — московское: по UTC-суткам оплата, отмеченная сегодняшним
 * числом между полуночью и тремя часами ночи, отклонялась как будущая
 * (решение Р-257).
 */
function ensurePastDate(on: Date, what: string): void {
  if (on.getTime() > moscowToday().getTime()) {
    throw new Error(`${what} не может быть позже сегодняшнего дня`);
  }
  if (on.getUTCFullYear() < 2000) throw new Error(`${what} указана неверно`);
}

const money = (value: bigint) => value.toString();

/** Состояния траншей, видимые тому, кто оплаты не ведёт (решение Р-251). */
export const CLIENT_TRANCHE_STATUSES = ['PLANNED', 'INVOICED', 'PAID'] as const;

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
  /** Этап, за который транш (РК-12, Р-338); `null` — по работе в целом. */
  readonly stageId?: string | null;
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
  const stageId = input.stageId || null;
  if (stageId !== null) {
    const stage = await prisma.stage.findUnique({ where: { id: stageId }, select: { projectId: true } });
    if (stage === null || stage.projectId !== contract.projectId) throw new Error('Этап не из этой работы');
  }

  const tranche = await prisma.tranche.create({
    data: {
      contractId: input.contractId,
      title,
      amount: input.amount,
      plannedDate: input.plannedDate ?? null,
      stageId,
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

  // Сторнированный транш денег не несёт и в сверку с договором не входит.
  const planned =
    contract.tranches
      .filter((t) => t.status !== 'REVERSED')
      .reduce((sum, t) => sum + t.amount, 0n) + input.amount;
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
  reason?: string | null,
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
  // Сторно — только с причиной: через год по журналу должно быть видно,
  // почему поступление снято — ошибка отметки или возврат клиенту
  // (решение Р-249).
  const note = (reason ?? '').trim();
  if (status === 'REVERSED' && note.length === 0) {
    throw new Error('Сторно без причины не принимается: укажите, ошибка ли это отметки или возврат');
  }
  if (note.length > 500) throw new Error('Причина — не длиннее 500 знаков');
  await ensureMoneyWritable(tranche.contract.projectId, false);

  const updated = await prisma.$transaction(async (tx) => {
    // Перевод захватывает транш по прежнему статусу. Прежде «Отметить
    // оплату» и «Списать», пришедшие почти одновременно, проходили оба:
    // оплата стиралась в «списан» — ровно то, что запретил Р-224
    // (решение Р-244).
    const claimed = await tx.tranche.updateMany({
      where: { id: trancheId, status: tranche.status },
      // Сторно сохраняет дату снятого поступления: она — часть истории.
      data: {
        status,
        paidOn: status === 'PAID' ? paidOn : status === 'REVERSED' ? tranche.paidOn : null,
      },
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
    // Сторно — исправление учёта, о нём клиенту тоже не пишется (Р-249).
    if (userId !== null && status !== 'WRITTEN_OFF' && status !== 'REVERSED') {
      await enqueue(tx, {
        userId,
        projectId: tranche.contract.projectId,
        eventKind: 'PAYMENT_STATUS_CHANGED',
        subject: `Статус платежа изменился: ${row.title}`,
        body:
          `Проект ${project?.code} — ${project?.title}.\n` +
          `Транш «${row.title}» переведён в состояние «${STATUS_LABEL[status]}».\n` +
          paymentsLine(project?.code ?? null),
        // Ключ по моменту перехода: счёт, отозванный и выставленный снова,
        // прежде не доходил — строка с тем же ключом уже была (Р-244).
        dedupKey: `tranche:${trancheId}:${status.toLowerCase()}:${row.updatedAt.getTime()}`,
        path: project === null ? null : `/cabinet/projects/${project.code}/payments`,
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
      ...(status === 'REVERSED' ? { reason: note } : {}),
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
  if (expertId === null) throw new Error('Сначала назначьте куратора работы');
  const comment = input.comment?.trim() || null;
  if (comment !== null && comment.length > 500) throw new Error('Комментарий — не длиннее 500 знаков');
  await ensureMoneyWritable(input.projectId, true);
  // Этап начисления — из этой же работы (требование РК-11, решение Р-339).
  if (input.stageId) {
    const stage = await prisma.stage.findUnique({ where: { id: input.stageId }, select: { projectId: true } });
    if (stage === null || stage.projectId !== input.projectId) throw new Error('Этап не из этой работы');
  }

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
  await notifyPayout(payout.id, false);
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
  await notifyPayout(payoutId, true);
  return updated;
}

/**
 * Куратору — о начислении и выплате, без суммы (требование Э-09, решение
 * Р-328). Событие нейтральное: уходит и без договора поручения, тогда без
 * названия работы и этапа (Р-237).
 */
async function notifyPayout(payoutId: string, paid: boolean): Promise<void> {
  const payout = await prisma.expertPayout.findUniqueOrThrow({
    where: { id: payoutId },
    select: {
      expert: { select: { id: true, role: true, expertProfile: { select: { ndaSignedAt: true } } } },
      project: { select: { id: true, code: true, title: true } },
      stage: { select: { title: true } },
    },
  });
  if (payout.expert === null || payout.expert.role !== 'EXPERT') return;
  const letter = payoutLetter(
    { code: payout.project.code, title: payout.project.title, stage: payout.stage?.title ?? null },
    paid,
    (payout.expert.expertProfile?.ndaSignedAt ?? null) !== null,
  );
  await enqueue(prisma, {
    userId: payout.expert.id,
    projectId: payout.project.id,
    eventKind: paid ? 'PAYOUT_PAID' : 'PAYOUT_ACCRUED',
    subject: letter.subject,
    body: letter.body,
    dedupKey: `payout:${payoutId}:${paid ? 'paid' : 'accrued'}`,
    path: '/cabinet/payout',
  });
}

export interface ProjectMoney {
  readonly contractTotal: bigint;
  readonly received: bigint;
  /** Остаток по договору — та же величина, что «к получению» на сводках (Р-254). */
  readonly awaiting: bigint;
  /** Из остатка — заведено траншами «ожидается» и «выставлен». */
  readonly scheduled: bigint;
  /**
   * Работа отменена: остаток не ждут, он учтён в потерях, и `awaiting`
   * равен нулю (решение Р-257).
   */
  readonly cancelled: boolean;
  /** День отмены работы; `null` — не отменена или дата не записана. */
  readonly cancelledOn: Date | null;
  /**
   * Корректировка суммы = договор − получено − осталось оплатить (требование
   * Т-19, О-4, решение Р-315). Это не «списано»: величина сводит арифметику
   * экрана и при обрезке остатка нулём, и у отменённой работы. Меньше нуля —
   * оплачено сверх суммы договора (ОМ-30).
   */
  readonly adjustment: bigint;
  /** Только тому, кто ведёт оплаты: списание — внутреннее решение (Р-251). */
  readonly writtenOff?: bigint;
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
    include: { tranches: true, project: { select: { status: true, closedOn: true } } },
  });
  if (contract === null) return null;

  const sum = (status: TrancheStatus) =>
    contract.tranches
      .filter((t) => t.status === status)
      .reduce((acc, t) => acc + t.amount, 0n);

  // Итоги того, кто оплаты не ведёт, складываются только из видимых ему
  // траншей: полученное и ожидаемое. Списанное в объект не попадает вовсе
  // — ни числом, ни нулём (решение Р-251).
  //
  // Остаток — по договору, как «к получению» на сводке финансов и главной
  // (Р-244): прежде экран работы складывал только заведённые транши, и при
  // договоре на 180 000 с одним оплаченным траншем на 60 000 показывал
  // «ожидается 0 ₽», а сводка по той же работе — 120 000. Клиент читал это
  // как «платить больше нечего» (решение Р-254). Списанное из остатка
  // вычитается и клиенту: прощённое он платить не должен.
  //
  // У отменённой работы остатка к оплате нет: его не ждут, он учтён в
  // потерях, и сводки его к получению не считают (решение Р-257).
  const received = sum('PAID');
  const awaiting = receivableOf(contract.project.status, contract.totalAmount, contract.tranches);
  const cancelled = !expectsPayment(contract.project.status);
  const visible: ProjectMoney = {
    contractTotal: contract.totalAmount,
    received,
    awaiting,
    scheduled: sum('PLANNED') + sum('INVOICED'),
    cancelled,
    cancelledOn: cancelled ? contract.project.closedOn : null,
    adjustment: contract.totalAmount - received - awaiting,
  };
  if (!can(actor, 'PAYMENT_EDIT', ref)) return visible;

  const base = { ...visible, writtenOff: sum('WRITTEN_OFF') };
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
        project: {
          select: {
            code: true,
            title: true,
            status: true,
            client: { select: { fullName: true } },
            // Кто ведёт работу — в «Деньгах по работам» (РК-03, Р-341).
            manager: { select: { id: true, fullName: true } },
            expert: { select: { id: true, fullName: true } },
          },
        },
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
    // полученных деньгах (решение Р-244). У отменённой работы — ноль: её
    // неоплаченное — потеря, а не деньги к получению (решение Р-257).
    const awaiting = receivableOf(contract.project.status, contract.totalAmount, contract.tranches);
    const lost = contract.tranches
      .filter((t) => t.status === 'WRITTEN_OFF')
      .reduce((acc, t) => acc + t.amount, 0n);
    const accrued = payoutByProject.get(contract.projectId) ?? 0n;
    return {
      projectId: contract.projectId,
      code: contract.project.code,
      title: contract.project.title,
      client: contract.project.client.fullName,
      manager: contract.project.manager,
      expert: contract.project.expert,
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

  // Начисления по работам без договора. Строки сводки строятся от
  // договоров, и такие начисления прежде не вычитались из маржи вовсе:
  // эксперту заплачено, а итог практики этого не знал (решение Р-257).
  const contracted = new Set(contracts.map((contract) => contract.projectId));
  const accruedWithoutContract = payouts
    .filter((payout) => !contracted.has(payout.projectId))
    .reduce((acc, payout) => acc + (payout._sum.amount ?? 0n), 0n);

  return {
    rows,
    totals: {
      contracted: total((r) => r.contracted),
      received: total((r) => r.received),
      awaiting: total((r) => r.awaiting),
      lost: total((r) => r.lost),
      accruedWithoutContract,
      margin: total((r) => r.margin) - accruedWithoutContract,
    },
  };
}

export interface CuratorPayoutRow {
  readonly expertId: string;
  readonly fullName: string;
  readonly accrued: bigint;
  readonly paid: bigint;
  /** К выплате — сумма невыплаченных начислений. */
  readonly toPay: bigint;
  readonly works: number;
}

/**
 * «Деньги → Вознаграждение кураторов» (требование РК-11, решение Р-339):
 * по каждому куратору — начислено, выплачено, к выплате. Определения те
 * же, что у `projectMoney.payoutsAccrued`: начислено — все начисления,
 * выплачено — со статусом «выплачено». Только руководителю.
 */
export async function payoutsByCurator(actor: Actor): Promise<CuratorPayoutRow[]> {
  ensure(actor, 'PAYOUT_MANAGE');
  const rows = await prisma.expertPayout.groupBy({
    by: ['expertId', 'status'],
    where: { expertId: { not: null } },
    _sum: { amount: true },
  });
  const works = await prisma.expertPayout.groupBy({
    by: ['expertId', 'projectId'],
    where: { expertId: { not: null } },
  });
  const ids = [...new Set(rows.map((row) => row.expertId!))];
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  return people
    .map((person) => {
      const mine = rows.filter((row) => row.expertId === person.id);
      const accrued = mine.reduce((acc, row) => acc + (row._sum.amount ?? 0n), 0n);
      const paid = mine.filter((row) => row.status === 'PAID').reduce((acc, row) => acc + (row._sum.amount ?? 0n), 0n);
      return {
        expertId: person.id,
        fullName: person.fullName,
        accrued,
        paid,
        toPay: accrued - paid,
        works: works.filter((row) => row.expertId === person.id).length,
      };
    })
    .sort((a, b) => (b.toPay > a.toPay ? 1 : b.toPay < a.toPay ? -1 : a.fullName.localeCompare(b.fullName)));
}

/** Начисления одного куратора по работам — раскрытие строки свода (РК-11). */
export async function curatorPayoutLines(actor: Actor, expertId: string) {
  ensure(actor, 'PAYOUT_MANAGE');
  return prisma.expertPayout.findMany({
    where: { expertId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      amount: true,
      status: true,
      paidOn: true,
      comment: true,
      createdAt: true,
      project: { select: { code: true, title: true } },
      stage: { select: { title: true } },
    },
  });
}

/**
 * Собственные начисления эксперта. Маржу он не видит — только своё.
 *
 * Эксперт без договора поручения получает суммы, состояние и даты, но не
 * работу, этап и комментарий: код и название работы, названия этапов и
 * пояснение к начислению — сведения о клиенте, а до договора выборка работ
 * не отдаёт ему ни одной (решение Р-251). Прежде этот экран был единственным
 * местом, где они всё же доходили.
 */
export async function ownPayouts(actor: Actor) {
  ensure(actor, 'PAYOUT_VIEW_OWN');
  const scope = scopePayouts(actor);
  if (scope === null) return { rows: [], accrued: 0n, paid: 0n };
  const closed = actor.role === 'EXPERT' && actor.expertNdaSignedAt === null;
  const found = await prisma.expertPayout.findMany({
    where: scope,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { project: { select: { code: true, title: true, expertId: true } }, stage: { select: { title: true } } },
  });
  // Работа, переданная другому куратору, остаётся в истории начислений, но
  // ссылкой на неё не служит: карточка куратору закрыта, и ссылка вела в
  // «не найдено» (требование Э-13, решение Р-332). Чей теперь куратор —
  // не отдаётся, только признак.
  const rows = found.map(({ project, ...row }) => {
    const handedOff = actor.role === 'EXPERT' && project.expertId !== actor.id;
    return closed
      ? { ...row, projectId: null, stageId: null, project: null, stage: null, comment: null, handedOff }
      : { ...row, project: { code: project.code, title: project.title }, handedOff };
  });
  return {
    rows,
    accrued: rows.reduce((acc, r) => acc + r.amount, 0n),
    paid: rows.filter((r) => r.status === 'PAID').reduce((acc, r) => acc + r.amount, 0n),
  };
}

/**
 * Своё вознаграждение куратора по одной работе — строка «Ваша работа» на
 * карточке (требование Э-13, решение Р-332). `null` — начислений нет.
 */
export async function ownPayoutTotals(
  actor: Actor,
  projectId: string,
): Promise<{ accrued: bigint; paid: bigint } | null> {
  if (actor.role !== 'EXPERT' || !can(actor, 'PAYOUT_VIEW_OWN')) return null;
  const rows = await prisma.expertPayout.findMany({
    where: { expertId: actor.id, projectId },
    select: { amount: true, status: true },
  });
  if (rows.length === 0) return null;
  return {
    accrued: rows.reduce((acc, row) => acc + row.amount, 0n),
    paid: rows.filter((row) => row.status === 'PAID').reduce((acc, row) => acc + row.amount, 0n),
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
  // Списанные и сторнированные транши — внутренний учёт практики: о них
  // клиенту не пишется (Р-244, Р-249), и на экране оплат их тоже нет у
  // того, кто оплаты не ведёт (решение Р-251).
  const mayEdit = can(actor, 'PAYMENT_EDIT', ref);

  return prisma.contract.findUnique({
    where: { projectId },
    include: {
      tranches: {
        where: mayEdit ? {} : { status: { in: [...CLIENT_TRANCHE_STATUSES] } },
        orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: {
          // Этап транша (РК-12, Р-338).
          stage: { select: { title: true, position: true } },
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
 * Строки истории работы о документах оплат (требование Т-19, решение Р-315):
 * «Приложен счёт к траншу «…»», «Приложен акт к траншу «…»», «Приложен
 * договор». Сопоставление — по документам видимых смотрящему траншей;
 * события о документах скрытых траншей (списанных и сторнированных у того,
 * кто оплаты не ведёт) из истории убираются. Без права на оплаты — ничего
 * не меняется.
 */
export async function paymentDocumentLines(
  actor: Actor,
  projectId: string,
): Promise<{ lines: Map<string, string>; hidden: Set<string> }> {
  const lines = new Map<string, string>();
  const ref = await projectRef(projectId);
  if (ref === null || !can(actor, 'CONTRACT_VIEW', ref)) return { lines, hidden: new Set() };
  const contract = await projectContract(actor, projectId);
  const what = (kind: string): string =>
    kind === 'INVOICE' ? 'счёт' : kind === 'ACT' ? 'акт' : kind === 'CONTRACT' ? 'договор' : 'документ';
  for (const tranche of contract?.tranches ?? []) {
    for (const document of tranche.documents) {
      lines.set(document.id, `Приложен ${what(document.kind)} к траншу «${tranche.title}»`);
    }
  }
  for (const document of contract?.documents ?? []) {
    if (document.trancheId === null && !lines.has(document.id)) lines.set(document.id, `Приложен ${what(document.kind)}`);
  }
  // Документы оплат — материалы при договоре или транше.
  const all = await prisma.material.findMany({
    where: { projectId, OR: [{ contractId: { not: null } }, { trancheId: { not: null } }] },
    select: { id: true },
  });
  return { lines, hidden: new Set(all.map((row) => row.id).filter((id) => !lines.has(id))) };
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
