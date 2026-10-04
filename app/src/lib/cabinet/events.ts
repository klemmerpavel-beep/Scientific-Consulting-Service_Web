/**
 * Названия событий очереди и тексты для мессенджера.
 *
 * Модуль намеренно не знает ни о базе, ни о сети: это чистые значения и
 * чистые функции. Так их проверяют без поднятой базы — а проверять их надо,
 * потому что именно здесь решается, что уходит за пределы сервера.
 */

import { openPath } from './next-path.ts';

export type EventKind =
  | 'STAGE_AWAITING_CLIENT'
  | 'VERSION_UPLOADED'
  | 'EXPERT_COMMENT_PUBLISHED'
  | 'STAGE_IN_APPROVAL'
  | 'DEADLINE_IN_3_DAYS'
  | 'DEADLINE_APPROVAL_SOON'
  | 'PAYMENT_STATUS_CHANGED'
  | 'REQUEST_CREATED'
  | 'PROJECT_OPENED'
  | 'LEAD_DECLINED'
  | 'MESSAGE_RECEIVED'
  | 'HELP_REQUESTED'
  | 'STAGE_APPROVED'
  | 'STAGE_RETURNED'
  | 'CLIENT_ACCESS_OPENED'
  | 'VERSION_REJECTED'
  | 'NDA_NEEDED'
  | 'PROJECT_STATUS_CHANGED'
  | 'CURATOR_CHANGED'
  | 'MODERATION_PENDING'
  | 'CLIENT_COMMENT'
  | 'CURATOR_ASSIGNED'
  | 'DEADLINE_MISSED'
  | 'WORK_ASSIGNED'
  | 'EXPERT_DECISION'
  | 'STAGE_DUE_CHANGED'
  | 'STAGE_REOPENED'
  | 'ORDER_WITH_CONTRACT'
  | 'LEAD_RECEIVED'
  | 'CURATOR_INVITED'
  | 'NDA_SIGNED'
  | 'STAGE_HANDED_OVER'
  | 'STAGE_HANDED_BACK'
  | 'CURATOR_TURN'
  | 'WORK_UNASSIGNED'
  | 'PAYOUT_ACCRUED'
  | 'PAYOUT_PAID'
  | 'NDA_WAITING';

/**
 * Причина, которую отправители возвращают при незаданных настройках канала.
 * Она отличается от настоящего отказа по существу: чинить нечего, пока
 * ящик или бот не заведены, и попытки такой строке не наращиваются —
 * иначе очередь перегорит до первой же настоящей отправки.
 */
export const CHANNEL_OFF = 'канал не настроен';

/**
 * Окончательный ли отказ Bot API (решение Р-252). 400 — чат не найден или
 * запрос негоден, 403 — бот заблокирован человеком или удалён из чата: ни
 * то ни другое через пять минут не пройдёт, и очередь закрывает строку
 * сразу. 401 и 404 сюда не входят — это отказ самого бота (неверный
 * токен), и строки должны дождаться починки настройки, а не перегореть
 * разом; 429 и 5xx — временные.
 */
export function telegramPermanent(status: number): boolean {
  return status === 400 || status === 403;
}

/**
 * Человеческие названия событий. Стоят здесь, а не на экране очереди: их
 * читает и экран, и сигнал в мессенджер, а два написания одного перечня
 * расходятся при первой же правке.
 */
export const EVENT_LABEL: Record<EventKind, string> = {
  STAGE_AWAITING_CLIENT: 'этап ждёт клиента',
  VERSION_UPLOADED: 'загружена версия',
  EXPERT_COMMENT_PUBLISHED: 'опубликовано замечание',
  STAGE_IN_APPROVAL: 'этап на согласовании',
  DEADLINE_IN_3_DAYS: 'приближается срок',
  DEADLINE_APPROVAL_SOON: 'подходит срок согласования',
  PAYMENT_STATUS_CHANGED: 'изменилась оплата',
  HELP_REQUESTED: 'менеджер просит помощи',
  REQUEST_CREATED: 'новая заявка',
  PROJECT_OPENED: 'работа заведена',
  LEAD_DECLINED: 'ответ на отклонённую заявку',
  MESSAGE_RECEIVED: 'новое сообщение',
  STAGE_APPROVED: 'этап согласован',
  STAGE_RETURNED: 'этап возвращён с замечаниями',
  CLIENT_ACCESS_OPENED: 'менеджер открыл вход клиенту',
  VERSION_REJECTED: 'версия не опубликована',
  NDA_NEEDED: 'нужен договор поручения',
  PROJECT_STATUS_CHANGED: 'изменилось состояние работы',
  CURATOR_CHANGED: 'у работы новый менеджер',
  MODERATION_PENDING: 'ждут публикации замечания или версии',
  CLIENT_COMMENT: 'клиент оставил замечание',
  CURATOR_ASSIGNED: 'вам передана работа',
  DEADLINE_MISSED: 'срок этапа сорван',
  WORK_ASSIGNED: 'вас назначили куратором работы',
  EXPERT_DECISION: 'решение менеджера по вашему материалу',
  STAGE_DUE_CHANGED: 'изменён срок этапа',
  STAGE_REOPENED: 'этап возвращён в работу',
  ORDER_WITH_CONTRACT: 'заведён заказ с договором',
  LEAD_RECEIVED: 'заявка получена',
  CURATOR_INVITED: 'вам открыт кабинет куратора',
  NDA_SIGNED: 'доступ к материалам открыт',
  STAGE_HANDED_OVER: 'куратор сдал этап',
  STAGE_HANDED_BACK: 'этап возвращён вам',
  CURATOR_TURN: 'ход за вами',
  WORK_UNASSIGNED: 'работа передана другому куратору',
  PAYOUT_ACCRUED: 'начислено вознаграждение',
  PAYOUT_PAID: 'вознаграждение выплачено',
  NDA_WAITING: 'куратор ждёт договор поручения',
};

/**
 * Текст для мессенджера — сигнал, а не содержание.
 *
 * Серверы Telegram за пределами России, и Политика называет использование
 * мессенджеров трансграничной передачей. Тема и тело уведомления содержат
 * название работы, название этапа и суммы; в мессенджер уходит только род
 * события и код работы — по ним человек открывает кабинет и читает там.
 *
 * Код работы вида PD-2026-001 субъекта не опознаёт: он бессмысленен без
 * доступа к базе, как и номер заявки в сигнале о новом обращении.
 */
export function eventLabel(eventKind: string): string {
  return EVENT_LABEL[eventKind as EventKind] ?? eventKind;
}

export function telegramNote(eventKind: string, projectCode: string | null, path: string | null = null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ?? '';
  const what = eventLabel(eventKind);
  const where = projectCode === null ? '' : ` · ${projectCode}`;
  // Ссылка ведёт на экран события через `/cabinet/open` — без адреса почты:
  // сигнал уходит за пределы России и содержания не несёт (Т-06, Р-309,
  // Р-187). Путь без кода работы ничего о человеке не говорит.
  const target = path === null ? '/cabinet' : openPath(path);
  return `ProDisser · ${what}${where}\n\n` + `Подробности в кабинете: ${base}${target}`;
}
