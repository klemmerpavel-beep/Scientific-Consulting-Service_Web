/**
 * «Что подготовить» к началу работы — по виду сопровождения (улучшение
 * У-2 из квиза владельца 12.10.2026, решение Р-564).
 *
 * Перечень видит клиент на своей работе, пока первый этап не согласован:
 * что прислать, чтобы работа началась без переспросов. Пункт считается
 * приложенным, если у работы есть материал с его названием: «Приложить» у
 * пункта загружает файл под этим названием. Отдельного хранения нет —
 * признак выводится из материалов.
 *
 * Тексты — клиентским словарём (Р-277): «работа», «сопровождение»,
 * «куратор». Модуль чистый: проверяется без базы.
 */

import type { ServiceCode } from './service-checklists.ts';

export interface PrepareItem {
  /** Устойчивый ключ пункта: по нему строится идентификатор формы. */
  readonly key: string;
  /** Название пункта; под ним же ложится приложенный материал. */
  readonly title: string;
  readonly note: string;
}

export interface PrepareList {
  readonly code: ServiceCode;
  /** Вид сопровождения — для памятки и заголовка. */
  readonly title: string;
  readonly items: readonly PrepareItem[];
}

export const PREPARE_LISTS: readonly PrepareList[] = [
  {
    code: 'dissertation',
    title: 'Диссертационное исследование',
    items: [
      { key: 'passport', title: 'Паспорт научной специальности', note: 'Шифр и формула специальности: по ним сверяются новизна и положения на защиту.' },
      { key: 'council', title: 'Требования диссертационного совета', note: 'Требования к оформлению, к публикациям и сроки представления.' },
      { key: 'text', title: 'Текущий текст диссертации', note: 'В том виде, в каком он есть: черновик, отдельные главы.' },
      { key: 'publications', title: 'Список публикаций автора', note: 'С выходными данными; отметьте статьи из перечня ВАК и индексируемые.' },
      { key: 'supervisor', title: 'Замечания научного руководителя', note: 'Последние отзывы и правки, если они есть.' },
    ],
  },
  {
    code: 'postgrad',
    title: 'Сопровождение аспиранта',
    items: [
      { key: 'plan', title: 'Индивидуальный план аспиранта', note: 'С утверждённой темой и сроками аттестаций.' },
      { key: 'passport', title: 'Паспорт научной специальности', note: 'Шифр и формула специальности.' },
      { key: 'requirements', title: 'Требования кафедры к аттестации', note: 'Что и в каком виде нужно сдать к ближайшей аттестации.' },
      { key: 'text', title: 'Текущий текст работы', note: 'Черновик, главы, отчёт за прошлый период.' },
      { key: 'publications', title: 'Список публикаций автора', note: 'Вышедшие и принятые к печати.' },
    ],
  },
  {
    code: 'consulting',
    title: 'Научное консультирование',
    items: [
      { key: 'task', title: 'Описание задачи', note: 'Что нужно получить и к какому сроку; вопросы, на которые нужен ответ.' },
      { key: 'materials', title: 'Имеющиеся материалы по задаче', note: 'Тексты, данные, расчёты, переписка с рецензентами.' },
      { key: 'requirements', title: 'Требования к результату', note: 'Форма результата: заключение, расчёт, раздел текста.' },
    ],
  },
  {
    code: 'research',
    title: 'Научно-исследовательская работа',
    items: [
      { key: 'spec', title: 'Техническое задание', note: 'Цель, задачи, требования к результатам и к отчёту.' },
      { key: 'schedule', title: 'Календарный план', note: 'Этапы и сроки по договору или заданию.' },
      { key: 'report', title: 'Требования к отчёту', note: 'По умолчанию — ГОСТ 7.32-2017; если у организации свои требования, приложите их.' },
      { key: 'data', title: 'Имеющиеся результаты и данные', note: 'Результаты прошлых этапов, исходные данные, методики.' },
    ],
  },
  {
    code: 'article',
    title: 'Научная публикация',
    items: [
      { key: 'journal', title: 'Требования журнала к рукописи', note: 'Правила для авторов: объём, структура, оформление списка литературы.' },
      { key: 'text', title: 'Текст статьи или черновик', note: 'Или материалы, из которых статья готовится: глава, отчёт, тезисы.' },
      { key: 'sources', title: 'Список литературы', note: 'Источники, на которые вы опираетесь.' },
      { key: 'data', title: 'Данные и иллюстрации', note: 'Таблицы, рисунки, результаты расчётов.' },
    ],
  },
  {
    code: 'diploma',
    title: 'Выпускная квалификационная работа',
    items: [
      { key: 'guidelines', title: 'Методические указания кафедры', note: 'Требования к структуре, объёму и оформлению работы.' },
      { key: 'assignment', title: 'Задание на выпускную работу', note: 'С утверждённой темой и сроками.' },
      { key: 'text', title: 'Текущий текст работы', note: 'Черновик или готовые главы.' },
      { key: 'supervisor', title: 'Замечания научного руководителя', note: 'Последние отзывы и правки, если они есть.' },
    ],
  },
];

/** Перечень вида работы; вид вне справочника — `null`. */
export function prepareList(code: string): PrepareList | null {
  return PREPARE_LISTS.find((list) => list.code === code) ?? null;
}

/** Название без различий в регистре, «ё» и пробелах: так сравниваются материалы. */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();
}

/**
 * Какие пункты приложены: у работы есть неудалённый материал с названием
 * пункта. Возвращает ключи приложенных и счёт.
 */
export function prepareStatus(
  list: PrepareList,
  materials: Iterable<{ readonly title: string }>,
): { attached: ReadonlySet<string>; done: number; total: number } {
  const titles = new Set([...materials].map((material) => titleKey(material.title)));
  const attached = new Set(list.items.filter((item) => titles.has(titleKey(item.title))).map((item) => item.key));
  return { attached, done: attached.size, total: list.items.length };
}

/**
 * Перечень нужен, пока работа идёт и первый этап не согласован: дальше
 * исходные материалы уже в работе. Плана этапов нет — перечень нужен.
 */
export function prepareOpen(project: { status: string; stages: readonly { readonly state: string }[] }): boolean {
  if (project.status !== 'ACTIVE') return false;
  const first = project.stages[0];
  return first === undefined || first.state !== 'DONE';
}
