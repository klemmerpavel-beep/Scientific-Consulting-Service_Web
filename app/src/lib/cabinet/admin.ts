/**
 * Управление учётными записями и справочниками.
 *
 * Оба раздела ведёт руководитель. Роль назначается здесь и нигде больше:
 * она не приходит с формы входа, не выводится из адреса почты и не
 * меняется самим пользователем.
 */

import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { prisma } from '../db.ts';
import { normalizeEmail } from './token.ts';

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

  const { createRawToken, digest, loginLink } = await import('./token.ts');
  const token = createRawToken();
  const expiresAt = new Date(Date.now() + ACCESS_LINK_TTL_MS);
  await prisma.loginToken.create({
    data: {
      selector: token.selector,
      verifierHash: digest(token.verifier),
      userId: user.id,
      expiresAt,
      requestIp: ip ?? 'cabinet',
    },
  });

  await record(actor, {
    action: 'ACCESS_LINK_ISSUED',
    objectType: 'User',
    objectId: user.id,
    ip,
    payload: { expiresAt: expiresAt.toISOString() },
  });

  return { link: loginLink(token.value), expiresAt, fullName: user.fullName };
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

export interface CreateUserInput {
  readonly email: string;
  readonly fullName: string;
  readonly role: Role;
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  ensure(actor, 'USER_MANAGE');
  const email = normalizeEmail(input.email);
  if (email.length === 0) throw new Error('Адрес почты не указан');
  const fullName = input.fullName.trim();
  if (fullName.length === 0) throw new Error('Имя не указано');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) throw new Error('Учётная запись с таким адресом уже есть');

  const user = await prisma.user.create({
    data: { email, fullName, role: input.role },
    select: { id: true, email: true, role: true },
  });

  // Эксперту заводится профиль: без него матрица прав не выдаст доступ к
  // материалам, и причина отказа была бы неочевидна.
  if (input.role === 'EXPERT') {
    await prisma.expertProfile.create({
      data: { userId: user.id, degree: '', specialization: '' },
    });
  }

  await record(actor, {
    action: 'USER_CREATED',
    objectType: 'User',
    objectId: user.id,
    payload: { email: user.email, role: user.role },
  });
  return user;
}

/**
 * Сменить роль. Все сессии отзываются: роль хранится в сессии на время
 * запроса, и вкладка, открытая до понижения, иначе доработала бы старыми
 * правами.
 */
export async function setUserRole(actor: Actor, userId: string, role: Role) {
  ensure(actor, 'USER_MANAGE');
  if (userId === actor.id) throw new Error('Собственная роль не меняется: это оставило бы систему без руководителя');

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (before === null) throw new Error('Учётная запись не найдена');
  if (before.role === role) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
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

/** Отметить договор поручения с экспертом: без него доступ к материалам закрыт. */
export async function signExpertNda(actor: Actor, userId: string, signedOn: Date | null) {
  ensure(actor, 'USER_MANAGE');
  await prisma.expertProfile.update({
    where: { userId },
    data: { ndaSignedAt: signedOn },
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
    orderBy: { sortOrder: 'asc' },
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

  const type = await prisma.serviceType.upsert({
    where: { code },
    create: {
      code,
      name,
      basePrice: input.basePrice ?? null,
      sortOrder: input.sortOrder ?? 100,
      isActive: input.isActive ?? true,
    },
    update: {
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
}
