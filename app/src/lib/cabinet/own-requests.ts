/**
 * Строка «Заявка № N на рассмотрении» над перечнем работ клиента
 * (аудит 15.11.2026, находка Ф-6; решение Р-914).
 *
 * Тексты и отбор состояний — здесь, без базы: их читают и запрос
 * (`queries.ts`), и экран, и проверка.
 */

import { leadNumberLabel } from './lead-labels.ts';

/** Состояния заявки, при которых клиент ещё ждёт ответа. */
export const OWN_REQUEST_OPEN = ['NEW', 'IN_PROGRESS', 'AWAITING_REPLY'] as const;

/** Больше пяти заявок разом не показывается: блок не вытесняет работы. */
export const OWN_REQUESTS_MAX = 5;

export type OwnRequest = {
  number: number;
  createdAt: Date;
  topic: string | null;
  status: string;
};

/**
 * Что сказать клиенту о заявке. Сотрудник назван «менеджером», без имени:
 * кто именно разбирает заявку, клиенту не показывается.
 */
export function ownRequestState(status: string): string {
  return status === 'AWAITING_REPLY'
    ? 'менеджер ждёт вашего ответа — проверьте почту'
    : 'на рассмотрении у менеджера';
}

/** «Заявка № 17 от 21 сентября 2026 — «Тема»: на рассмотрении у менеджера». */
export function ownRequestLine(request: OwnRequest, day: (date: Date) => string, clip: (text: string, max: number) => string): string {
  const topic = request.topic === null || request.topic.trim() === '' ? '' : ` — «${clip(request.topic.trim(), 80)}»`;
  return `Заявка ${leadNumberLabel(request.number)} от ${day(request.createdAt)}${topic}: ${ownRequestState(request.status)}.`;
}
