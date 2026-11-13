/**
 * «Редактировать заказ» (запрос владельца 13.11.2026, решение Р-872).
 *
 * Карточка заказа правится одним экраном: название, тема, описание, вид
 * работы, срок, срок согласования и сумма договора. Права — те же, что у
 * карточки и денег работы: руководитель по любой, менеджер по своей
 * (`PROJECT_EDIT`, `PAYMENT_EDIT`, Р-870). Закрытая и перенесённая из книги
 * работа правится тоже: закрытость запрещает этапы, а не учёт (Р-293
 * в этой части заменяется).
 *
 * Писем клиенту из-за правки полей карточки нет. Исключение прежнее —
 * перенос срока действующей работы, заведённой в кабинете: клиент получает
 * причину (УМ-12, Р-391). У закрытой работы и у работы из книги срок —
 * учётная правка: без причины и без письма.
 */

import { prisma } from '../db.ts';
import { ensure, workClosed, type Actor } from './access.ts';
import { APPROVAL_DAYS_MAX, APPROVAL_DAYS_MIN } from './approval.ts';
import { record } from './audit.ts';
import { ORDER_FIELD_LABEL } from './code-labels.ts';
import { setOrderTotal } from './finance.ts';
import { announceWorkDueChange, dueChange, projectRef } from './projects.ts';

export interface OrderEditInput {
  readonly projectId: string;
  /**
   * Когда карточка была прочитана формой (`Project.updatedAt`): правка,
   * сделанная в другой вкладке или другим сотрудником, молча не
   * затирается (приём Р-360, Р-467). `null` — без сверки.
   */
  readonly updatedAt: string | null;
  readonly title: string;
  readonly topic?: string | null;
  readonly summary?: string | null;
  readonly serviceTypeId: string;
  readonly dueOn: Date | null;
  /** Причина переноса срока действующей работы из кабинета: её читает клиент. */
  readonly dueReason?: string | null;
  /** Срок согласования этапа, рабочих дней; не передан — не меняется. */
  readonly approvalDays?: number;
  /** Сумма договора в копейках; `null` — поле пустое, сумма не меняется. */
  readonly contractTotal?: bigint | null;
}

export { ORDER_FIELD_LABEL };

type OrderField = keyof typeof ORDER_FIELD_LABEL;

const text = (value: string | null | undefined): string | null => {
  const clean = (value ?? '').trim();
  return clean === '' ? null : clean;
};

const dayKey = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/**
 * Сохранить карточку заказа. Карточка, срок с письмом о переносе, сумма
 * договора и журнал — одна транзакция: отказ суммы (ниже полученного) не
 * оставляет карточку наполовину сохранённой.
 */
export async function editOrder(actor: Actor, input: OrderEditInput): Promise<{ changed: OrderField[] }> {
  const ref = await projectRef(input.projectId);
  if (ref === null) throw new Error('Проект не найден');
  ensure(actor, 'PROJECT_EDIT', ref);

  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (title.length === 0) throw new Error('Работа без названия не заводится');
  // Пределы — те же, что у карточки работы (Р-242, Р-279).
  if (title.length > 300) throw new Error('Название работы — не длиннее 300 знаков');
  const topic = text(input.topic);
  if ((topic ?? '').length > 500) throw new Error('Тема — не длиннее 500 знаков');
  const summary = text(input.summary);
  if ((summary ?? '').length > 2000) throw new Error('Описание — не длиннее 2000 знаков');
  if (
    input.approvalDays !== undefined &&
    (!Number.isInteger(input.approvalDays) ||
      input.approvalDays < APPROVAL_DAYS_MIN ||
      input.approvalDays > APPROVAL_DAYS_MAX)
  ) {
    throw new Error(
      `Срок согласования — от ${APPROVAL_DAYS_MIN} до ${APPROVAL_DAYS_MAX} рабочих дней: меньше пяти не допускает п. 7.2 оферты`,
    );
  }

  const before = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: {
      code: true,
      title: true,
      topic: true,
      summary: true,
      status: true,
      source: true,
      dueOn: true,
      approvalDays: true,
      updatedAt: true,
      serviceTypeId: true,
      serviceType: { select: { name: true } },
    },
  });
  if (input.updatedAt !== null && input.updatedAt !== before.updatedAt.toISOString()) {
    throw new Error('Заказ уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите');
  }

  // Вид работы — из справочника; снятый с действия вид остаётся у работы,
  // которая уже его носит, но новой не выбирается.
  const type =
    input.serviceTypeId === before.serviceTypeId
      ? { id: before.serviceTypeId, name: before.serviceType.name }
      : await prisma.serviceType.findFirst({ where: { id: input.serviceTypeId, isActive: true }, select: { id: true, name: true } });
  if (type === null) throw new Error('Выберите вид работы из справочника');

  // Срок, который уже был, у действующей работы из кабинета меняется с
  // причиной для клиента (УМ-12, Р-391). Закрытая работа и работа из книги
  // — учётная правка: причины и письма нет.
  const quiet = workClosed(before.status) || before.source === 'IMPORT';
  const shifted = before.dueOn !== null && dayKey(before.dueOn) !== dayKey(input.dueOn);
  const why = (input.dueReason ?? '').trim();
  if (shifted && !quiet) {
    if (why === '') {
      throw new Error('Срок работы переносится с причиной: её получит клиент — без неё перенос читается как срыв');
    }
    if (why.length > 1000) throw new Error('Причина переноса — не длиннее 1000 знаков');
  }

  const changed: OrderField[] = [];
  if (title !== before.title) changed.push('title');
  if (topic !== before.topic) changed.push('topic');
  if (summary !== before.summary) changed.push('summary');
  if (type.id !== before.serviceTypeId) changed.push('serviceType');
  if (dayKey(input.dueOn) !== dayKey(before.dueOn)) changed.push('dueOn');
  if (input.approvalDays !== undefined && input.approvalDays !== before.approvalDays) changed.push('approvalDays');

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.project.updateMany({
      where: { id: input.projectId, updatedAt: before.updatedAt },
      data: {
        title,
        topic,
        summary,
        serviceTypeId: type.id,
        dueOn: input.dueOn,
        ...(input.approvalDays === undefined ? {} : { approvalDays: input.approvalDays }),
      },
    });
    if (claimed.count === 0) {
      throw new Error('Заказ уже изменили в другой вкладке или другой сотрудник: обновите страницу и повторите');
    }
    if (shifted && !quiet) await announceWorkDueChange(tx, actor, input.projectId, before.dueOn, input.dueOn, why);
    if (input.contractTotal !== undefined && input.contractTotal !== null) {
      if (await setOrderTotal(tx, actor, ref, before.code, input.contractTotal)) changed.push('contract');
    }
    const cardChanged = changed.filter((field) => field !== 'contract');
    if (cardChanged.length > 0) {
      // В журнал — название и что изменилось; тексты темы и описания не
      // пишутся. Запись затирает обезличивание, как всю правку карточки
      // (Р-234).
      await record(
        actor,
        {
          action: 'PROJECT_EDITED',
          objectType: 'Project',
          objectId: input.projectId,
          projectId: input.projectId,
          payload: {
            title,
            fields: cardChanged,
            ...dueChange(before.dueOn, input.dueOn),
            ...(type.id === before.serviceTypeId ? {} : { serviceTypeFrom: before.serviceType.name, serviceTypeTo: type.name }),
            ...(input.approvalDays === undefined || input.approvalDays === before.approvalDays
              ? {}
              : { approvalDaysFrom: before.approvalDays, approvalDaysTo: input.approvalDays }),
          },
        },
        tx,
      );
    }
  });
  return { changed };
}
