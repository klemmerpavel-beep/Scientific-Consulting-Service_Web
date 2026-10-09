import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { ClientChoiceNeeded, NEW_CLIENT, orderEmail, type NameCandidate } from './client-match.ts';
import { phoneKey } from './contacts.ts';
import { normalizeName } from './import/etl.ts';
import { openContract } from './import/apply.ts';
import { enqueue } from './outbox.ts';
import { managerAssignedLetter, nextProjectCode } from './projects.ts';
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

/**
 * Карточки, доступные заказу этого сотрудника. Менеджер видит клиентов
 * своих работ (Р-149): карточка, у которой есть работа другого менеджера,
 * ему не предлагается и заказа от него не принимает — иначе заказ на неё
 * открывал бы ему контакты чужого клиента. Такой заказ вносит
 * руководитель. Защитный минимум до решения МП-02 (решение Р-419).
 */
function reachable(actor: Actor) {
  return actor.role === 'MANAGER' ? { projects: { none: { managerId: { not: actor.id } } } } : {};
}

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
    where: { ...ALIVE, normalizedName: normalized, ...reachable(actor) },
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
  // Договор заводится только при стоимости: оплата без неё прежде молча
  // терялась — работа без договора, поступления нигде нет (решение Р-505;
  // то же правило у книги — Р-273, Р-504).
  if (paid > 0n && cost === 0n) {
    throw new OrderInputError('Оплата указана без стоимости: укажите стоимость работы.');
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
    if (foundId !== null && actor.role === 'MANAGER') {
      const open = await tx.clientProfile.count({ where: { id: foundId, ...reachable(actor) } });
      if (open === 0) {
        throw new OrderInputError(
          'Заказчик с этой почтой или телефоном — клиент другого менеджера: такой заказ вносит руководитель.',
        );
      }
    }
    if (foundId === null) {
      const namesakes = await tx.clientProfile.findMany({
        where: { ...ALIVE, normalizedName: normalized, ...reachable(actor) },
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
        // Заказ, заведённый завершённым, закрыт плановым сроком (РК-23, Р-355).
        closedOnPlanned: status === 'COMPLETED',
        firstClosedOn: status === 'COMPLETED' ? (input.dueOn ?? orderedOn) : null,
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

    // Журнал, дело руководителю и письма — в той же транзакции: сбой после
    // сохранённого заказа показывал ошибку с заполненной формой, и
    // повторная отправка заводила вторую работу с договором и оплатой
    // (решение Р-463).
    await record(
      actor,
      { action: 'ORDER_CREATED', objectType: 'Project', objectId: project.id, projectId: project.id, payload: { code } },
      tx,
    );

    // Деньги ведёт руководитель (Р-149), но договор при ручном заказе
    // заводит и менеджер (В-9): руководитель узнаёт о нём сразу. Суммы в
    // письме нет: она — в деле «Проверьте договор» на «Сводке» (требование
    // РК-13, решение Р-347; Р-308 дополняется).
    if (actor.role === 'MANAGER' && cost > 0n) {
      // Дело «Проверьте договор» — до проверки руководителем (РК-12, Р-338).
      await openContractCheck(tx, project.id);
      const [me, heads] = await Promise.all([
        tx.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }),
        tx.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } }),
      ]);
      for (const head of heads) {
        await enqueue(tx, {
          userId: head.id,
          projectId: project.id,
          eventKind: 'ORDER_WITH_CONTRACT',
          subject: `Заведён заказ с договором: ${code}`,
          body:
            `Менеджер ${me?.fullName ?? ''} завёл заказ ${code} — ${title}.\n` +
            'Договор и оплаты при заведении — на экране «Оплаты и документы» работы; дело «Проверьте договор» — на «Сводке».\n' +
            'Менять суммы и оплаты дальше может только руководитель.',
          dedupKey: `order-contract:${project.id}:${head.id}`,
          path: `/cabinet/projects/${code}/payments`,
        });
      }
    }

    // Руководитель завёл заказ на другого менеджера — тому письмо: прежде
    // работа появлялась у него молча (требование РК-08, решение Р-344).
    if (managerId !== actor.id) {
      const by = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true } });
      const letter = managerAssignedLetter(code, title, `Заказ завёл и передал вам ${by.fullName}`);
      await enqueue(tx, {
        userId: managerId,
        projectId: project.id,
        eventKind: 'CURATOR_ASSIGNED',
        subject: letter.subject,
        body: letter.body,
        dedupKey: `project:${project.id}:curator-assigned:${managerId}:manual`,
      });
    }
    return { code, projectId: project.id };
  });
  return created;
}
