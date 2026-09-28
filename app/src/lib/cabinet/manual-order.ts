import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { normalizeName } from './import/etl.ts';
import { openContract } from './import/apply.ts';
import { nextProjectCode } from './projects.ts';
import { prisma } from '../db.ts';

/**
 * Заказ, заведённый руководителем или менеджером вручную.
 *
 * Прежде работа появлялась в кабинете двумя путями: одобрением заявки с
 * сайта и переносом книги заказов. Заказ, пришедший звонком или письмом,
 * заводить было негде — его вписывали в книгу и ждали переноса (решение
 * Р-269). Экран «Новый заказ» просит те же сведения, что строка книги:
 * заказчик, вид и название работы, тема, дата заказа, срок, стоимость и
 * оплата, состояние.
 *
 * Карточка клиента ищется по ФИО так же, как при переносе книги: второй
 * заказ того же человека ложится в его карточку. Учётная запись клиенту
 * не заводится и писем не уходит — вход ему открывается отдельно, на экране
 * «Учётные записи», когда это нужно.
 */
export interface ManualOrderInput {
  readonly customer: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly serviceTypeId: string;
  readonly title: string;
  readonly topic?: string | null;
  readonly orderedOn?: Date | null;
  readonly dueOn?: Date | null;
  /** В копейках. */
  readonly cost?: bigint | null;
  readonly paid?: bigint | null;
  readonly status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  /** Куратор. Менеджер ведёт свои заказы: для него это всегда он сам. */
  readonly managerId?: string | null;
}

export class OrderInputError extends Error {}

export async function createManualOrder(
  actor: Actor,
  input: ManualOrderInput,
): Promise<{ code: string; projectId: string }> {
  ensure(actor, 'REQUEST_MODERATE');

  const customer = input.customer.replace(/\s+/gu, ' ').trim();
  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (customer.length < 2) throw new OrderInputError('Укажите заказчика — фамилию, имя и отчество.');
  if (title.length < 2) throw new OrderInputError('Укажите название работы.');
  const cost = input.cost ?? 0n;
  const paid = input.paid ?? 0n;
  if (cost < 0n || paid < 0n) throw new OrderInputError('Суммы не бывают отрицательными.');
  if (paid > cost && cost > 0n) {
    throw new OrderInputError('Оплачено больше стоимости: проверьте суммы.');
  }

  const managerId = actor.role === 'HEAD' ? (input.managerId || actor.id) : actor.id;
  const status = input.status ?? 'ACTIVE';
  const orderedOn = input.orderedOn ?? moscowToday();
  const normalized = normalizeName(customer);

  const created = await prisma.$transaction(async (tx) => {
    const [type, manager] = await Promise.all([
      tx.serviceType.findUnique({ where: { id: input.serviceTypeId }, select: { id: true } }),
      tx.user.findUnique({ where: { id: managerId }, select: { role: true, status: true } }),
    ]);
    if (type === null) throw new OrderInputError('Выберите вид работы из справочника.');
    if (manager === null || manager.status !== 'ACTIVE' || (manager.role !== 'MANAGER' && manager.role !== 'HEAD')) {
      throw new OrderInputError('Куратором может быть только действующий менеджер или руководитель.');
    }

    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;
    const existing = await tx.clientProfile.findFirst({
      // Сведённая в другую и стёртая по требованию карточки заказы не принимают.
      where: { normalizedName: normalized, mergedIntoId: null, erasedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, phone: true },
    });
    let clientId: string;
    if (existing === null) {
      const client = await tx.clientProfile.create({
        data: { fullName: customer, normalizedName: normalized, email, phone },
        select: { id: true },
      });
      clientId = client.id;
    } else {
      clientId = existing.id;
      // Пустые контакты карточки дополняются, заполненные не затираются.
      const patch = {
        ...(existing.email === null && email !== null ? { email } : {}),
        ...(existing.phone === null && phone !== null ? { phone } : {}),
      };
      if (Object.keys(patch).length > 0) {
        await tx.clientProfile.update({ where: { id: clientId }, data: patch });
      }
    }

    const code = await nextProjectCode(tx as never, orderedOn.getUTCFullYear());
    const project = await tx.project.create({
      data: {
        code,
        clientId,
        serviceTypeId: type.id,
        title,
        topic: input.topic?.trim() || null,
        managerId,
        status,
        source: 'WEB',
        startedOn: orderedOn,
        dueOn: input.dueOn ?? null,
        closedOn: status === 'COMPLETED' ? (input.dueOn ?? orderedOn) : null,
      },
      select: { id: true },
    });

    if (cost > 0n) {
      await openContract(tx, {
        projectId: project.id,
        code,
        orderDate: orderedOn,
        deadline: input.dueOn ?? null,
        rowCost: cost,
        rowPaid: paid,
        paidTitle: 'Поступление при заведении заказа',
      });
    }

    await tx.projectEvent.create({
      data: { projectId: project.id, actorId: actor.id, kind: 'PROJECT_CREATED', payload: { code, manual: true } },
    });
    return { code, projectId: project.id };
  });

  await record(actor, {
    action: 'ORDER_CREATED',
    objectType: 'Project',
    objectId: created.projectId,
    projectId: created.projectId,
    payload: { code: created.code },
  });
  return created;
}
