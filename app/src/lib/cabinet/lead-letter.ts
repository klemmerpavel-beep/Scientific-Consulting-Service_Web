/**
 * Письмо заявителю, которому отказали (решение Р-217).
 *
 * Модуль намеренно не знает ни о базе, ни о сети — как и `events.ts`: здесь
 * решается, что уходит человеку за пределы сервера, и проверять это надо
 * без поднятой базы.
 */

import { siteUrl } from '../site-url.ts';

/**
 * Текст письма об отказе. Отдельной функцией — его проверяют без базы.
 *
 * Письмо отвечает на обращение, а не утешает: называет тему, говорит
 * «взяться не можем», приводит причину словами менеджера и оставляет
 * дверь открытой. Ссылки входа нет — кабинета у человека нет.
 */
export function declineLetter(
  name: string | null,
  topic: string | null,
  reason: string,
): { subject: string; body: string } {
  const base = siteUrl();
  const greeting = name === null || name.trim().length === 0 ? 'Здравствуйте.' : `Здравствуйте, ${name.trim()}.`;
  const about = topic === null || topic.trim().length === 0 ? '' : ` по теме «${topic.trim()}»`;
  return {
    subject: 'Ответ на заявку ProDisser',
    body:
      `${greeting}\n` +
      `Спасибо за обращение${about}. Взяться за эту работу мы не можем.\n` +
      `Причина: ${reason}\n` +
      (base === null
        ? 'Если обстоятельства изменятся, оставьте новую заявку на сайте ProDisser.'
        : `Если обстоятельства изменятся, оставьте новую заявку на сайте: ${base}.`),
  };
}

/** Адрес почты из заявки; `null`, если человек оставил телефон. */
export function leadAddress(lead: { contactKind: string; contact: string }): string | null {
  const contact = lead.contact.trim();
  return lead.contactKind === 'email' && /^[^\s@]+@[^\s@]+$/u.test(contact) ? contact : null;
}
