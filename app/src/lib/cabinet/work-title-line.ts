/**
 * Строка «название — тема» в письме клиенту о заведённой работе.
 *
 * Название работы при одобрении заявки подставлено из её темы, и менеджер
 * чаще всего его не меняет: письмо начиналось строкой «Тема — Тема.»
 * (аудит 15.11.2026, находка Ф-13, решение Р-897). Тема дописывается,
 * только когда она говорит что-то сверх названия.
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

/** Сравнение без регистра, крайних пробелов и точки в конце. */
function plain(text: string): string {
  return text.trim().replace(/[.\s]+$/u, '').replace(/\s+/gu, ' ').toLocaleLowerCase('ru');
}

export function workTitleLine(title: string, topic: string | null): string {
  if (topic === null || topic.trim() === '' || plain(topic) === plain(title)) return title;
  return `${title} — ${topic}`;
}
