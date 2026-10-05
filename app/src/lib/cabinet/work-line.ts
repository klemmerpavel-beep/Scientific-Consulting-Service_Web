/**
 * Первая строка письма о работе (улучшение УК-06, решение Р-362).
 *
 * Клиенту — название работы без кода: код с экранов снят (Р-189), и в
 * письме он клиенту ничего не говорит. Сотруднику — с кодом: у него много
 * работ с одинаковыми названиями. Модуль чистый: одна строка — одно
 * правило для всех писем.
 */
export function workLine(project: { readonly code: string; readonly title: string }, forClient: boolean): string {
  return forClient ? `Работа «${project.title}».` : `Работа ${project.code} — ${project.title}.`;
}
