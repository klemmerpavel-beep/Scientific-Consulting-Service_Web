import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { ClientChoiceNeeded, NEW_CLIENT, orderEmail, type NameCandidate } from './client-match.ts';
import { phoneKey } from './contacts.ts';
import { normalizeName } from './import/etl.ts';
import { openContract } from './import/apply.ts';
import { formatAmount } from './money.ts';
import { enqueue } from './outbox.ts';
import { nextProjectCode } from './projects.ts';
import { prisma } from '../db.ts';
import { openContractCheck } from './head-checks.ts';

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
 * Карточка клиента ищется по почте и телефону; совпадение только по ФИО
 * менеджер решает сам — выбирает найденную карточку или заводит новую:
 * прежде заказ однофамильца молча ложился в чужую карточку (требование
 * М-18, решение Р-308). Учётная запись клиенту не заводится и писем не
 * уходит — вход открывается кнопкой «Открыть клиенту вход».
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
  /**
   * Выбор при совпадении только по ФИО: идентификатор найденной карточки
   * или `NEW_CLIENT`. Без выбора такое совпадение — отказ
   * `ClientChoiceNeeded` (решение Р-308).
   */
  readonly clientChoice?: string | null;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const ALIVE = { mergedIntoId: null, erasedAt: null } as const;

/** Карточка по почте или телефону — сильные признаки, выбора не требуют. */
async function byContact(tx: Tx, email: string | null, phone: string | null): Promise<string | null> {
  if (email !== null) {
    const found = await tx.clientProfile.findFirst({
      where: { ...ALIVE, OR: [{ email: { equals: email, mode: 'insensitive' } }, { user: { email } }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (found !== null) return found.id;
  }
  const key = phoneKey(phone);
  if (key === null) return null;
  // Телефон хранится как ввели; сверка — по последним десяти цифрам.
  const phones = await tx.clientProfile.findMany({
    where: { ...ALIVE, phone: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true },
  });
  return phones.find((row) => phoneKey(row.phone) === key)?.id ?? null;
}

/**
 * Карточки практики, совпавшие с заказчиком только по ФИО, — для выбора на
 * экране «Новый заказ». Менеджер видит ФИО, маски контактов и число работ,
 * без ссылок на карточки (ОМ-5).
 */
export async function nameCandidates(actor: Actor, customer: string): Promise<NameCandidate[]> {
  ensure(actor, 'REQUEST_MODERATE');
  const normalized = normalizeName(customer.replace(/\s+/gu, ' ').trim());
  if (normalized.length === 0) return [];
  const rows = await prisma.clientProfile.findMany({
    where: { ...ALIVE, normalizedName: normalized },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      user: { select: { email: true } },
      _count: { select: { projects: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email ?? row.user?.email ?? null,
    phone: row.phone,
    works: row._count.projects,
  }));
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

  // Почта — по формату и не сотрудника: работа на адресе сотрудника не
  // видна ни ему, ни клиенту (требование М-18, решение Р-308).
  const emailRaw = input.email?.trim() || null;
  const email = emailRaw === null ? null : orderEmail(emailRaw);
  if (emailRaw !== null && email === null) {
    throw new OrderInputError('Почта заказчика записана с ошибкой: проверьте адрес.');
  }
  if (email !== null) {
    const owner = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (owner !== null && owner.role !== 'CLIENT') {
      throw new OrderInputError('Это адрес сотрудника практики: укажите почту заказчика.');
    }
  }
  const phone = input.phone?.trim() || null;

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
      throw new OrderInputError('Менеджером работы может быть только действующий менеджер или руководитель.');
    }

    // Сведённая в другую и стёртая по требованию карточки заказы не
    // принимают. Почта и телефон находят карточку сами; совпадение только
    // по ФИО — выбор менеджера (решение Р-308).
    let foundId = await byContact(tx, email, phone);
    if (foundId === null) {
      const namesakes = await tx.clientProfile.findMany({
        where: { ...ALIVE, normalizedName: normalized },
        select: { id: true },
      });
      const choice = input.clientChoice?.trim() || null;
      if (namesakes.length > 0 && choice !== NEW_CLIENT) {
        if (choice === null) throw new ClientChoiceNeeded();
        if (!namesakes.some((row) => row.id === choice)) {
          throw new OrderInputError('Выбранной карточки среди найденных нет: выберите снова.');
        }
        foundId = choice;
      }
    }
    const existing =
      foundId === null
        ? null
        : await tx.clientProfile.findUniqueOrThrow({
            where: { id: foundId },
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

  // Деньги ведёт руководитель (Р-149), но договор при ручном заказе
  // заводит и менеджер (В-9): руководитель узнаёт о нём сразу. Сумма — только
  // в письме; в Telegram уходит событие и код работы (Р-187).
  if (actor.role === 'MANAGER' && cost > 0n) {
    // Дело «Проверьте договор» — до проверки руководителем (РК-12, Р-338).
    await openContractCheck(prisma, created.projectId);
    const [me, heads] = await Promise.all([
      prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }),
      prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } }),
    ]);
    for (const head of heads) {
      await enqueue(prisma, {
        userId: head.id,
        projectId: created.projectId,
        eventKind: 'ORDER_WITH_CONTRACT',
        subject: `Заведён заказ с договором: ${created.code}, ${formatAmount(cost)}`,
        body:
          `Менеджер ${me?.fullName ?? ''} завёл заказ ${created.code} — ${title}.\n` +
          `Сумма договора: ${formatAmount(cost)}; оплачено при заведении: ${formatAmount(paid)}.\n` +
          'Менять суммы и оплаты дальше может только руководитель — на экране «Оплаты и документы» работы.',
        dedupKey: `order-contract:${created.projectId}:${head.id}`,
        path: `/cabinet/projects/${created.code}/payments`,
      });
    }
  }
  return created;
}
