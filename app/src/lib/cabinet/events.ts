/**
 * Названия событий очереди и тексты для мессенджера.
 *
 * Модуль намеренно не знает ни о базе, ни о сети: это чистые значения и
 * чистые функции. Так их проверяют без поднятой базы — а проверять их надо,
 * потому что именно здесь решается, что уходит за пределы сервера.
 */

export type EventKind =
  | 'STAGE_AWAITING_CLIENT'
  | 'VERSION_UPLOADED'
  | 'EXPERT_COMMENT_PUBLISHED'
  | 'STAGE_IN_APPROVAL'
  | 'DEADLINE_IN_3_DAYS'
  | 'PAYMENT_STATUS_CHANGED'
  | 'REQUEST_CREATED'
  | 'PROJECT_OPENED';

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
  PAYMENT_STATUS_CHANGED: 'изменилась оплата',
  REQUEST_CREATED: 'новая заявка',
  PROJECT_OPENED: 'работа заведена',
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

export function telegramNote(eventKind: string, projectCode: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ?? '';
  const what = eventLabel(eventKind);
  const where = projectCode === null ? '' : ` · ${projectCode}`;
  return (
    `ProDisser · ${what}${where}\n\n` +
    `Подробности в кабинете: ${base.length === 0 ? '/cabinet' : `${base}/cabinet`}`
  );
}
