/**
 * Управление учётными записями и справочниками.
 *
 * Оба раздела ведёт руководитель. Роль назначается здесь и нигде больше:
 * она не приходит с формы входа, не выводится из адреса почты и не
 * меняется самим пользователем.
 */

import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { moscowToday } from './clock.ts';
import { prisma } from '../db.ts';
import { normalizeEmail } from './token.ts';
import { enqueue } from './outbox.ts';

export type Role = 'CLIENT' | 'EXPERT' | 'MANAGER' | 'HEAD';
export type Status = 'ACTIVE' | 'SUSPENDED' | 'ERASED';

export const ROLE_LABEL: Record<Role, string> = {
  CLIENT: 'клиент',
  EXPERT: 'эксперт',
  MANAGER: 'менеджер',
  HEAD: 'руководитель',
};

export const STATUS_LABEL: Record<Status, string> = {
  ACTIVE: 'действует',
  SUSPENDED: 'приостановлена',
  ERASED: 'обезличена',
};

/** Сколько учётных записей показывается на одной странице. */
export const USER_PAGE_SIZE = 20;

export interface UserFilter {
  readonly role?: Role;
  readonly status?: 'ACTIVE' | 'SUSPENDED' | 'ERASED';
  readonly page?: number;
}

/**
 * Учётные записи постранично и с отбором.
 *
 * Прежде выбирались все без предела: пока в кабинете четыре человека,
 * это незаметно, а на штате в полсотни экран превращался в ленту,
 * которую нечем сузить (решение Р-183).
 */
/**
 * Сколько живёт ссылка входа, выданная руководителем из кабинета.
 *
 * Письмо ждёт ближайшей рассылки, и пятнадцати минут ему мало; здесь
 * ссылку передают в руки — мессенджером или голосом, — и два часа
 * покрывают этот разговор, не превращая ссылку в постоянный пароль
 * (решение Р-195).
 */
const ACCESS_LINK_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Выдать человеку ссылку входа, не отправляя письма.
 *
 * Пока почтовый канал практики не настроен, войти в кабинет может только
 * тот, кому ссылку выдали на сервере командой. Это делает открытие
 * кабинета клиенту делом системного администратора, а не куратора.
 * Руководитель выдаёт ссылку здесь и передаёт её тем каналом, которым уже
 * разговаривает с человеком.
 *
 * Ссылка возвращается ровно один раз: в базе лежит только свёртка
 * проверочной части, и восстановить её потом нельзя по построению. Выдача
 * пишется в журнал действий — это доступ к чужой учётной записи, и он
 * обязан быть виден.
 */
export async function issueAccessLink(
  actor: Actor,
  userId: string,
  ip?: string | null,
): Promise<{ link: string; expiresAt: Date; fullName: string }> {
  ensure(actor, 'USER_MANAGE');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, status: true },
  });
  if (user === null) throw new Error('Учётной записи нет');
  if (user.status !== 'ACTIVE') {
    throw new Error('Доступ приостановлен или запись обезличена: ссылка не выдаётся');
  }

  const { link, expiresAt } = await manualToken(user.id, actor.id, ip);

  await record(actor, {
    action: 'ACCESS_LINK_ISSUED',
    objectType: 'User',
    objectId: user.id,
    ip,
    payload: { expiresAt: expiresAt.toISOString() },
  });

  return { link, expiresAt, fullName: user.fullName };
}

/**
 * Разовая ссылка на два часа — общий помощник выдачи руководителем и
 * куратором (решение Р-285). Прежние непогашенные ссылки входа того же
 * человека гасятся: живой должна быть одна, последняя выданная — ссылка,
 * переданная не тому, перестаёт работать с выдачей новой.
 */
async function manualToken(
  userId: string,
  issuedById: string,
  ip?: string | null,
): Promise<{ link: string; expiresAt: Date }> {
  const { createRawToken, digest, loginLink } = await import('./token.ts');
  const now = new Date();
  await prisma.loginToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now }, purpose: 'LOGIN' },
    data: { expiresAt: now },
  });
  const token = createRawToken();
  const expiresAt = new Date(now.getTime() + ACCESS_LINK_TTL_MS);
  await prisma.loginToken.create({
    data: {
      selector: token.selector,
      verifierHash: digest(token.verifier),
      userId,
      expiresAt,
      requestIp: ip ?? 'cabinet',
      // Кто выдал: сессия по такой ссылке помечается (ОМ-3, Р-292).
      issuedById,
    },
  });
  return { link: loginLink(token.value), expiresAt };
}

/** Пределы выдачи куратором: на клиента и на сотрудника за сутки (Р-285). */
const CLIENT_LINKS_PER_DAY = 3;
const STAFF_LINKS_PER_DAY = 20;

/** Адрес почты, годный для учётной записи. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * «Открыть клиенту вход» — куратор работы или руководитель (требование
 * М-03, решение Р-285).
 *
 * Клиенты ручных заказов и перенесённой книги заказов учётной записи не
 * имели, и вход им не открывал никто: руководитель мог завести запись, но
 * не привязать её к карточке клиента, и клиент входил в пустой кабинет.
 * Здесь запись заводится по почте карточки и сразу привязывается к ней, а
 * ссылка на два часа возвращается один раз — тем же порядком, что у
 * руководителя (Р-195).
 *
 * Отказы с причиной: карточка обезличена или сведена; адреса нет или он
 * негоден; адрес принадлежит сотруднику; запись закрыта; адрес уже у
 * другой карточки клиента — их сводит руководитель.
 *
 * Согласие на обработку ПДн здесь не спрашивается: основание для
 * заказчика — договор (п. 5 ч. 1 ст. 6 152-ФЗ, так это и сказано в
 * Политике); новую заявку из кабинета клиент подаёт с отметками, как
 * прежде (Р-238). Решение ОМ-4 требует подтверждения юриста до первого
 * такого входа.
 */
export async function openClientAccess(
  actor: Actor,
  projectId: string,
  ip?: string | null,
): Promise<{ link: string; expiresAt: Date; fullName: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      clientId: true,
      managerId: true,
      expertId: true,
      client: {
        select: { id: true, fullName: true, email: true, userId: true, erasedAt: true, mergedIntoId: true },
      },
    },
  });
  if (project === null) throw new Error('Работа не найдена');
  ensure(actor, 'CLIENT_ACCESS_OPEN', project);
  const client = project.client;
  if (client.erasedAt !== null || client.mergedIntoId !== null) {
    throw new Error('Карточка клиента обезличена или сведена с другой: вход не открывается');
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const byActor = await prisma.auditEvent.count({
    where: { actorId: actor.id, action: 'ACCESS_LINK_ISSUED', occurredAt: { gte: dayAgo } },
  });
  if (actor.role !== 'HEAD' && byActor >= STAFF_LINKS_PER_DAY) {
    throw new Error(`За сутки выдано ${STAFF_LINKS_PER_DAY} ссылок: следующие — завтра или через руководителя`);
  }

  // Учётная запись: своя у карточки, найденная по адресу или новая.
  let userId: string;
  let created = false;
  if (client.userId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: client.userId },
      select: { role: true, status: true },
    });
    if (user === null || user.role !== 'CLIENT') throw new Error('Карточка привязана не к учётной записи клиента');
    if (user.status !== 'ACTIVE') throw new Error('Учётная запись клиента закрыта: вход не открывается');
    userId = client.userId;
  } else {
    const email = normalizeEmail(client.email ?? '');
    if (email === '' || !EMAIL_SHAPE.test(email)) {
      throw new Error('В карточке клиента нет адреса почты: впишите его, и вход можно будет открыть');
    }
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, status: true, clientProfile: { select: { id: true } } },
    });
    if (existing !== null) {
      if (existing.role !== 'CLIENT') {
        throw new Error('Этот адрес принадлежит сотруднику: вход клиенту на него не открывается');
      }
      if (existing.status !== 'ACTIVE') throw new Error('Учётная запись с этим адресом закрыта: вход не открывается');
      if (existing.clientProfile !== null && existing.clientProfile.id !== client.id) {
        throw new Error('Этот адрес уже у другой карточки клиента: карточки сводит руководитель');
      }
      userId = existing.id;
    } else {
      const user = await prisma.user.create({
        data: { email, fullName: client.fullName, role: 'CLIENT' },
        select: { id: true },
      });
      userId = user.id;
      created = true;
    }
    // Привязка — условием «карточка ещё без записи»: два одновременных
    // нажатия не привяжут карточку к двум записям.
    const linked = await prisma.clientProfile.updateMany({
      where: { id: client.id, userId: null },
      data: { userId },
    });
    if (linked.count === 0) throw new Error('Карточку только что привязали другим действием: обновите страницу');
  }

  const forClient = await prisma.auditEvent.count({
    where: { objectId: userId, action: 'ACCESS_LINK_ISSUED', occurredAt: { gte: dayAgo } },
  });
  if (forClient >= CLIENT_LINKS_PER_DAY) {
    throw new Error(
      `Клиенту сегодня уже выдано ${CLIENT_LINKS_PER_DAY} ссылки: дождитесь, пока он войдёт по последней`,
    );
  }

  const { link, expiresAt } = await manualToken(userId, actor.id, ip);

  if (created) {
    await record(actor, { action: 'USER_CREATED', objectType: 'User', objectId: userId, projectId: project.id, ip });
  }
  await record(actor, {
    action: 'ACCESS_LINK_ISSUED',
    objectType: 'User',
    objectId: userId,
    projectId: project.id,
    ip,
    payload: { expiresAt: expiresAt.toISOString(), via: 'project' },
  });

  // Выдача куратором — доступ к чужой учётной записи: руководитель о ней
  // узнаёт (решение ОМ-3).
  if (actor.role === 'MANAGER') {
    const [curator, heads] = await Promise.all([
      prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }),
      prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } }),
    ]);
    for (const head of heads) {
      await enqueue(prisma, {
        userId: head.id,
        projectId: project.id,
        eventKind: 'CLIENT_ACCESS_OPENED',
        subject: `Менеджер открыл вход клиенту: ${project.code}`,
        body:
          `${curator?.fullName ?? 'Менеджер'} выдал(а) ссылку входа клиенту работы ${project.code}` +
          `${created ? '; учётная запись заведена по почте карточки' : ''}.\n` +
          'Ссылка действует два часа и срабатывает один раз.',
        dedupKey: `access:${userId}:${expiresAt.getTime()}:${head.id}`,
      });
    }
  }

  return { link, expiresAt, fullName: client.fullName };
}

export async function listUsers(actor: Actor, filter: UserFilter = {}) {
  ensure(actor, 'USER_MANAGE');
  const where = {
    ...(filter.role === undefined ? {} : { role: filter.role }),
    ...(filter.status === undefined ? {} : { status: filter.status }),
  };
  const total = await prisma.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
  // Страница за пределами перечня — не ошибка: ссылку могли сохранить, а
  // отбор с тех пор сузить. Показывается последняя существующая.
  const page = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pages);
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    skip: (page - 1) * USER_PAGE_SIZE,
    take: USER_PAGE_SIZE,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      notifyEmail: true,
      notifyTelegram: true,
      telegramChatId: true,
      expertProfile: { select: { ndaSignedAt: true, specialization: true } },
      clientProfile: { select: { id: true } },
      _count: { select: { sessions: true } },
    },
  });
  return { rows, total, page, pages };
}

/**
 * Эксперты для договоров поручения — все, а не страница перечня.
 *
 * Список брался из текущей страницы перечня учётных записей (двадцать
 * строк, роли по алфавиту): когда клиентов больше двадцати, эксперты
 * уходили на вторую страницу, и на первой договор отметить было некому
 * (решение Р-225). Отбор по роли, а не по наличию профиля: запись без
 * профиля тоже должна быть видна, иначе её не исправить.
 */
export async function expertsForNda(actor: Actor) {
  ensure(actor, 'USER_MANAGE');
  return prisma.user.findMany({
    where: { role: 'EXPERT', status: { not: 'ERASED' } },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    select: { id: true, fullName: true, expertProfile: { select: { ndaSignedAt: true } } },
  });
}

/**
 * Сотрудники с регалиями: эксперты, кураторы и руководители — все, а не
 * страница перечня (требование Т-11, решение Р-297).
 */
export async function staffForRegalia(actor: Actor) {
  ensure(actor, 'USER_MANAGE');
  return prisma.user.findMany({
    where: { role: { in: ['EXPERT', 'MANAGER', 'HEAD'] }, status: { not: 'ERASED' } },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fullName: true,
      role: true,
      expertProfile: { select: { degree: true, specialization: true, specialtyCode: true } },
    },
  });
}

/**
 * Регалии сотрудника: учёная степень, научная специальность и её шифр.
 * Профиль — носитель регалий и у куратора с руководителем; права решает
 * роль, а не профиль. Пустые значения хранятся как `null` (Р-225).
 */
export async function saveRegalia(
  actor: Actor,
  userId: string,
  input: { readonly degree: string; readonly specialization: string; readonly specialtyCode: string },
) {
  ensure(actor, 'USER_MANAGE');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (user === null || user.status === 'ERASED') throw new Error('Учётная запись не найдена');
  if (user.role === 'CLIENT') throw new Error('Регалии ведутся только у сотрудников');
  const clean = (value: string, limit: number, what: string) => {
    const text = value.trim();
    if (text.length > limit) throw new Error(`${what} — не длиннее ${limit} знаков`);
    return text === '' ? null : text;
  };
  const data = {
    degree: clean(input.degree, 120, 'Учёная степень'),
    specialization: clean(input.specialization, 200, 'Научная специальность'),
    specialtyCode: clean(input.specialtyCode, 20, 'Шифр специальности'),
  };
  if (data.specialtyCode !== null && !/^\d+(\.\d+){1,3}$/u.test(data.specialtyCode)) {
    throw new Error('Шифр специальности — цифрами через точку, например «1.3.8»');
  }
  await prisma.expertProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await record(actor, {
    action: 'STAFF_REGALIA_SAVED',
    objectType: 'ExpertProfile',
    objectId: userId,
    payload: { degree: data.degree !== null, specialization: data.specialization !== null, code: data.specialtyCode },
  });
}

/** Кому можно выдать ссылку входа: все действующие записи, а не страница. */
export async function accessLinkPeople(actor: Actor) {
  ensure(actor, 'USER_MANAGE');
  return prisma.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { id: 'asc' }],
    select: { id: true, fullName: true, role: true, email: true },
  });
}

const ROLES: readonly Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];

/**
 * У сотрудника не осталось открытых работ, где он куратор или эксперт.
 *
 * Прежде приостановка или смена роли проходили молча: работа оставалась
 * за человеком, который больше не входит, — куратору не приходили
 * сообщения клиента, эксперт числился на работе, которую не откроет, а
 * менеджер, ставший экспертом, продолжал значиться куратором (решение
 * Р-242). Сначала работы передаются, затем меняется доступ.
 */
async function ensureNoOpenWorks(userId: string): Promise<void> {
  const open = await prisma.project.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED'] },
      OR: [{ managerId: userId }, { expertId: userId }],
    },
    orderBy: { code: 'asc' },
    select: { code: true },
    take: 6,
  });
  if (open.length === 0) return;
  const shown = open.slice(0, 5).map((project) => project.code).join(', ');
  throw new Error(
    `За человеком открытые работы: ${shown}${open.length > 5 ? ' и другие' : ''}. ` +
      'Сначала передайте их другому менеджеру или эксперту',
  );
}

export interface CreateUserInput {
  readonly email: string;
  readonly fullName: string;
  readonly role: Role;
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  ensure(actor, 'USER_MANAGE');
  const email = normalizeEmail(input.email);
  if (email.length === 0) throw new Error('Адрес почты не указан');
  // Запись с опечаткой в адресе не войдёт никогда: ссылка входа уйдёт в
  // никуда, а выглядеть это будет как поломка кабинета (решение Р-242).
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    throw new Error('Проверьте адрес почты: он должен выглядеть как имя@домен');
  }
  const fullName = input.fullName.trim();
  if (fullName.length === 0) throw new Error('Имя не указано');
  if (!ROLES.includes(input.role)) throw new Error('Неизвестная роль');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) throw new Error('Учётная запись с таким адресом уже есть');

  const user = await prisma.user.create({
    data: { email, fullName, role: input.role },
    select: { id: true, email: true, role: true },
  });

  // Эксперту заводится профиль: без него матрица прав не выдаст доступ к
  // материалам, и причина отказа была бы неочевидна.
  // Регалии не заводятся пустой строкой: реестр печатал «Имя · » и пустую
  // клетку специализации (решение Р-225).
  if (input.role === 'EXPERT') {
    await prisma.expertProfile.create({ data: { userId: user.id } });
  }

  // Адрес почты в журнал не пишется: запись ссылается на учётную запись
  // идентификатором, а адрес в ней переживал бы и смену адреса, и
  // обезличивание (решение Р-252).
  await record(actor, {
    action: 'USER_CREATED',
    objectType: 'User',
    objectId: user.id,
    payload: { role: user.role },
  });
  return user;
}

/**
 * Сменить роль. Все сессии отзываются: роль хранится в сессии на время
 * запроса, и вкладка, открытая до понижения, иначе доработала бы старыми
 * правами. Гасятся и выданные, но не погашенные ссылки входа — как при
 * приостановке: ссылка, выданная до смены роли, иначе открывала новую
 * сессию сразу после отзыва старых (решение Р-251).
 */
export async function setUserRole(actor: Actor, userId: string, role: Role) {
  ensure(actor, 'USER_MANAGE');
  if (userId === actor.id) throw new Error('Собственная роль не меняется: это оставило бы систему без руководителя');

  if (!ROLES.includes(role)) throw new Error('Неизвестная роль');
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (before === null) throw new Error('Учётная запись не найдена');
  if (before.role === role) return;
  const staff = (value: Role) => value === 'MANAGER' || value === 'HEAD';
  if ((staff(before.role) && !staff(role)) || (before.role === 'EXPERT' && role !== 'EXPERT')) {
    await ensureNoOpenWorks(userId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    // Профиль эксперта заводится и при смене роли, а не только при
    // создании записи: без него у эксперта нет даты договора поручения,
    // выборка прав не отдаёт ему ни одной работы, а экран договоров его не
    // показывал — исправить было нечем (решение Р-225).
    if (role === 'EXPERT') {
      await tx.expertProfile.upsert({ where: { userId }, create: { userId }, update: {} });
    }
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.loginToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  });

  await record(actor, {
    action: 'USER_ROLE_CHANGED',
    objectType: 'User',
    objectId: userId,
    payload: { from: before.role, to: role },
  });
}

/** Приостановить или вернуть доступ. Обезличенная запись не воскрешается. */
export async function setUserStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  ensure(actor, 'USER_MANAGE');
  if (userId === actor.id) throw new Error('Собственный доступ не приостанавливается');

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (before === null) throw new Error('Учётная запись не найдена');
  if (before.status === 'ERASED') {
    throw new Error('Запись обезличена по требованию субъекта и не восстанавливается');
  }
  if (status === 'SUSPENDED') await ensureNoOpenWorks(userId);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === 'SUSPENDED') {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.loginToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
  });

  await record(actor, {
    action: 'USER_STATUS_CHANGED',
    objectType: 'User',
    objectId: userId,
    payload: { from: before.status, to: status },
  });
}

// «Сегодня по Москве» живёт в часах кабинета рядом с `now()`; здесь —
// реэкспорт для прежних импортов (решение Р-257).
export { moscowToday };

/**
 * Отметить договор поручения с экспертом: без него доступ к материалам закрыт.
 *
 * Прежде отметка ложилась на любую запись и любой датой: договор
 * «подписывался» клиенту или менеджеру — профиль эксперта заводился у
 * человека, который экспертом не является, — и датой из будущего, которая
 * открывала доступ заранее и выглядела как опечатка (решение Р-251).
 */
export async function signExpertNda(actor: Actor, userId: string, signedOn: Date | null) {
  ensure(actor, 'USER_MANAGE');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user === null) throw new Error('Учётная запись не найдена');
  if (user.role !== 'EXPERT') throw new Error('Договор поручения отмечается только у эксперта');
  if (signedOn !== null && signedOn.getTime() > moscowToday().getTime()) {
    throw new Error('Дата договора не может быть позже сегодняшней');
  }
  // Профиля может не быть у записи, ставшей экспертом до решения Р-225:
  // договор заводит его сам, а не падает.
  await prisma.expertProfile.upsert({
    where: { userId },
    create: { userId, ndaSignedAt: signedOn },
    update: { ndaSignedAt: signedOn },
  });
  await record(actor, {
    action: 'EXPERT_NDA_UPDATED',
    objectType: 'ExpertProfile',
    objectId: userId,
    payload: { signedOn: signedOn?.toISOString() ?? null },
  });
}

// ─────────────────────────── Справочники ────────────────────────────────────

export async function listServiceTypes(actor: Actor) {
  ensure(actor, 'DIRECTORY_EDIT');
  return prisma.serviceType.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      basePrice: true,
      isActive: true,
      sortOrder: true,
      aliases: { select: { id: true, alias: true }, orderBy: { alias: 'asc' } },
      _count: { select: { projects: true } },
    },
  });
}

export interface ServiceTypeInput {
  readonly id?: string | null;
  readonly code: string;
  readonly name: string;
  readonly basePrice?: bigint | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export async function saveServiceType(actor: Actor, input: ServiceTypeInput) {
  ensure(actor, 'DIRECTORY_EDIT');
  const code = input.code.trim();
  const name = input.name.trim();
  if (code.length === 0 || name.length === 0) throw new Error('Код и название обязательны');
  if (!/^[a-z0-9_-]+$/u.test(code)) {
    throw new Error('Код — латиница в нижнем регистре, цифры, дефис и подчёркивание, без пробелов');
  }
  if (input.basePrice != null && input.basePrice < 0n) {
    throw new Error('Базовая цена не бывает отрицательной');
  }
  if (input.sortOrder !== undefined && (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)) {
    throw new Error('Порядок — целое число от нуля');
  }

  // Форма «Добавить позицию» заводит новую позицию. Прежде при совпадении
  // кода она молча переписывала название и цену существующей — и вместе с
  // ней подписи всех её работ, отчётов и аналитики (решение Р-242).
  const data = {
    name,
    basePrice: input.basePrice ?? null,
    sortOrder: input.sortOrder ?? 100,
    isActive: input.isActive ?? true,
  };
  const type =
    input.id == null
      ? await (async () => {
          const taken = await prisma.serviceType.findUnique({ where: { code }, select: { id: true } });
          if (taken !== null) throw new Error(`Позиция с кодом «${code}» уже есть`);
          return prisma.serviceType.create({ data: { code, ...data }, select: { id: true, code: true } });
        })()
      : await prisma.serviceType.update({
          where: { id: input.id },
          data: {
            code,
            name,
            basePrice: input.basePrice ?? null,
            sortOrder: input.sortOrder ?? undefined,
            isActive: input.isActive ?? undefined,
          },
          select: { id: true, code: true },
        });

  await record(actor, {
    action: 'SERVICE_TYPE_SAVED',
    objectType: 'ServiceType',
    objectId: type.id,
    payload: { code: type.code, name },
  });
  return type;
}

/**
 * Привязать историческое написание к позиции справочника. Написание
 * приводится к виду поиска тем же правилом, что и разбор книги заказов:
 * иначе псевдоним, заведённый с заглавной буквы, не сработал бы.
 */
export async function addAlias(actor: Actor, serviceTypeId: string, rawAlias: string) {
  ensure(actor, 'DIRECTORY_EDIT');
  const alias = rawAlias.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (alias.length === 0) throw new Error('Написание не указано');

  const saved = await prisma.serviceTypeAlias.upsert({
    where: { alias },
    create: { alias, serviceTypeId },
    update: { serviceTypeId },
    select: { id: true },
  });
  await record(actor, {
    action: 'SERVICE_TYPE_ALIAS_ADDED',
    objectType: 'ServiceTypeAlias',
    objectId: saved.id,
    payload: { alias, serviceTypeId },
  });
  return saved;
}

export async function removeAlias(actor: Actor, aliasId: string) {
  ensure(actor, 'DIRECTORY_EDIT');
  const alias = await prisma.serviceTypeAlias.delete({
    where: { id: aliasId },
    select: { alias: true },
  });
  await record(actor, {
    action: 'SERVICE_TYPE_ALIAS_REMOVED',
    objectType: 'ServiceTypeAlias',
    objectId: aliasId,
    payload: { alias: alias.alias },
  });
}

export async function listColorMap(actor: Actor) {
  ensure(actor, 'DIRECTORY_EDIT');
  return prisma.importColorMap.findMany({ orderBy: { argb: 'asc' } });
}

// ───────────────────────── Производственный календарь ──────────────────────

/**
 * Дни производственного календаря для срока согласования (требование Т-15,
 * решение Р-290): переносы выходных и рабочие субботы. Праздники ст. 112
 * ТК РФ модуль рабочих дней знает сам; запись календаря сильнее правила.
 */
export async function listCalendarDays(actor: Actor) {
  ensure(actor, 'DIRECTORY_EDIT');
  return prisma.calendarDay.findMany({ orderBy: { day: 'asc' } });
}

export async function saveCalendarDay(
  actor: Actor,
  input: { readonly day: Date | null; readonly workday: boolean; readonly note?: string | null },
) {
  ensure(actor, 'DIRECTORY_EDIT');
  if (input.day === null || Number.isNaN(input.day.getTime())) throw new Error('Укажите день');
  const note = (input.note ?? '').trim();
  if (note.length > 200) throw new Error('Примечание — не длиннее 200 знаков');
  const day = new Date(`${input.day.toISOString().slice(0, 10)}T00:00:00Z`);
  await prisma.calendarDay.upsert({
    where: { day },
    create: { day, workday: input.workday, note: note || null },
    update: { workday: input.workday, note: note || null },
  });
  await record(actor, {
    action: 'CALENDAR_DAY_SAVED',
    objectType: 'CalendarDay',
    objectId: day.toISOString().slice(0, 10),
    payload: { workday: input.workday },
  });
}

export async function removeCalendarDay(actor: Actor, rawDay: string) {
  ensure(actor, 'DIRECTORY_EDIT');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(rawDay)) throw new Error('День не найден');
  const removed = await prisma.calendarDay.deleteMany({ where: { day: new Date(`${rawDay}T00:00:00Z`) } });
  if (removed.count === 0) throw new Error('День уже снят: обновите страницу');
  await record(actor, {
    action: 'CALENDAR_DAY_REMOVED',
    objectType: 'CalendarDay',
    objectId: rawDay,
  });
}

// ─────────────────────────── Шаблоны этапов ─────────────────────────────────

/**
 * Шаблон этапов по типу сопровождения.
 *
 * Применяется при одобрении заявки и копирует строки в этапы проекта:
 * правка шаблона задним числом живые проекты не переписывает. Иначе
 * изменение методики меняло бы план работ у тех, кто уже в работе.
 */
export async function listStageTemplates(actor: Actor) {
  ensure(actor, 'DIRECTORY_EDIT');
  return prisma.stageTemplate.findMany({
    orderBy: [{ serviceTypeId: 'asc' }, { position: 'asc' }],
    include: { serviceType: { select: { id: true, code: true, name: true } } },
  });
}

export interface StageTemplateInput {
  readonly serviceTypeId: string;
  readonly title: string;
  readonly position: number;
  readonly durationDays?: number | null;
}

export async function saveStageTemplateItem(actor: Actor, input: StageTemplateInput) {
  ensure(actor, 'DIRECTORY_EDIT');
  const title = input.title.trim();
  if (title.length === 0) throw new Error('Название этапа не указано');
  if (!Number.isInteger(input.position) || input.position < 1) {
    throw new Error('Порядковый номер этапа — целое число, начиная с единицы');
  }
  // «10,5» и «-3» ложились в шаблон как есть, а срок этапа от них
  // получался дробным или раньше начала (решение Р-242).
  if (
    input.durationDays != null &&
    (!Number.isInteger(input.durationDays) || input.durationDays < 0)
  ) {
    throw new Error('Длительность — целое число дней от нуля');
  }

  const item = await prisma.stageTemplate.upsert({
    where: {
      serviceTypeId_position: { serviceTypeId: input.serviceTypeId, position: input.position },
    },
    create: {
      serviceTypeId: input.serviceTypeId,
      title,
      position: input.position,
      durationDays: input.durationDays ?? null,
    },
    update: { title, durationDays: input.durationDays ?? null },
    select: { id: true },
  });

  await record(actor, {
    action: 'STAGE_TEMPLATE_SAVED',
    objectType: 'StageTemplate',
    objectId: item.id,
    payload: { serviceTypeId: input.serviceTypeId, position: input.position, title },
  });
  return item;
}

export async function removeStageTemplateItem(actor: Actor, id: string) {
  ensure(actor, 'DIRECTORY_EDIT');
  const item = await prisma.stageTemplate.delete({ where: { id }, select: { title: true } });
  await record(actor, {
    action: 'STAGE_TEMPLATE_REMOVED',
    objectType: 'StageTemplate',
    objectId: id,
    payload: { title: item.title },
  });
}

/**
 * Настройки уведомлений текущего человека.
 *
 * Своя учётная запись — единственное, что здесь читается, и выборка
 * ограничена ею по построению. Прежде экран настроек читал это своим
 * запросом к базе (решение Р-185).
 */
export async function ownChannels(actor: Actor) {
  return prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      email: true,
      notifyEmail: true,
      notifyTelegram: true,
      telegramChatId: true,
      consentAcceptedAt: true,
    },
  });
}

/**
 * Каналы уведомлений: выбор за получателем, а не за системой.
 *
 * Правка ограничена своей учётной записью по построению — чужой
 * идентификатор сюда не передаётся вовсе (решение Р-185).
 */
export async function saveOwnChannels(
  actor: Actor,
  channels: { email: boolean; telegram: boolean },
): Promise<void> {
  await prisma.user.update({
    where: { id: actor.id },
    data: { notifyEmail: channels.email, notifyTelegram: channels.telegram },
  });
  // Отключённый канал — ответ на вопрос «почему не пришло письмо»; прежде
  // следа не оставалось (решение Р-242).
  await record(actor, {
    action: 'NOTIFY_CHANNELS_SAVED',
    objectType: 'User',
    objectId: actor.id,
    payload: { email: channels.email, telegram: channels.telegram },
  });
}
