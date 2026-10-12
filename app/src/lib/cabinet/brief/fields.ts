/**
 * Поля документов «Анкета для заявки» и «Исходные данные работы» (задание
 * владельца 12.10.2026, решение Р-557).
 *
 * Один перечень для разборщика и шаблонов: шаблон собирается из подписей,
 * разборщик узнаёт строки по ним же — шаблон и разбор не расходятся
 * (проверка читает шаблоны тем же разборщиком).
 *
 * Синонимы взяты из образцов владельца: метки в живых документах пишутся
 * по-разному — «Тема работы:», «Темы работы:», «1. Тема статьи …» без
 * разделителя, «Университет –», «НАПРАВЛЕНИЕ -». Порядок синонимов важен:
 * длинный проверяется раньше короткого («ФИО руководителя» раньше «ФИО»).
 */

export type BriefFieldKey =
  | 'customer'
  | 'email'
  | 'phone'
  | 'supervisor'
  | 'university'
  | 'institute'
  | 'chair'
  | 'group'
  | 'direction'
  | 'serviceType'
  | 'title'
  | 'topic'
  | 'goal'
  | 'tasks'
  | 'deadline'
  | 'orderedOn'
  | 'journal'
  | 'relevance'
  | 'theses'
  | 'plan'
  | 'introduction'
  | 'results'
  | 'sources';

/**
 * Вид поля: строка значения («Метка: значение») или раздел — строки до
 * следующей известной метки (задачи, план, источники).
 */
export type BriefFieldKind = 'line' | 'section';

export interface BriefField {
  readonly key: BriefFieldKey;
  /** Подпись в шаблоне — она же первый синоним. */
  readonly label: string;
  readonly synonyms: readonly string[];
  readonly kind: BriefFieldKind;
  /** Предел длины значения в знаках; длиннее — не переносится, а называется. */
  readonly limit: number;
}

const field = (
  key: BriefFieldKey,
  label: string,
  synonyms: readonly string[],
  kind: BriefFieldKind = 'line',
  limit = 300,
): BriefField => ({ key, label, synonyms: [label.toLowerCase(), ...synonyms], kind, limit });

/**
 * Порядок перечня — порядок проверки синонимов: метка, начинающаяся с
 * другой метки, стоит раньше неё.
 */
export const BRIEF_FIELDS: readonly BriefField[] = [
  field('supervisor', 'ФИО научного руководителя', ['фио руководителя', 'научный руководитель', 'руководитель']),
  // Клиенту говорим «работа» и «заявка», а не «заказ» (Р-277): подпись
  // шаблона — «ФИО автора», прежнее написание узнаётся синонимом.
  field('customer', 'ФИО автора', ['фио заказчика', 'фио автора работы', 'фио']),
  field('email', 'Почта', ['электронная почта', 'e-mail', 'email']),
  field('phone', 'Телефон', ['контактный телефон']),
  field('university', 'Вуз или организация', ['университет', 'вуз', 'организация']),
  field('institute', 'Институт', ['факультет']),
  field('chair', 'Кафедра', []),
  field('group', 'Группа', []),
  field('direction', 'Направление или научная специальность', ['направление подготовки', 'направление', 'научная специальность', 'специальность', 'шифр']),
  field('serviceType', 'Вид работы', ['тип работы']),
  field('title', 'Название работы', []),
  field('topic', 'Тема', ['темы работы', 'тема работы', 'тема статьи', 'тема исследования'], 'line', 500),
  field('goal', 'Цель работы', ['цель статьи', 'цель исследования', 'цель'], 'line', 1000),
  field('tasks', 'Задачи', ['задачи исследования', 'задачи работы', 'задачи статьи'], 'section', 1600),
  field('deadline', 'Срок', ['дедлайн', 'срок сдачи', 'срок защиты']),
  field('orderedOn', 'Дата обращения', ['дата заказа']),
  field('journal', 'Журнал и его требования', ['журнал', 'целевой журнал'], 'line', 500),
  field('relevance', 'Актуальность', ['актуальность работы', 'актуальность темы'], 'section', 4000),
  field('theses', 'Тезисы к введению', ['тезисы введения'], 'section', 4000),
  field('plan', 'План-содержание', ['план-содержание работы', 'план работы', 'содержание', 'структура статьи'], 'section', 6000),
  field('introduction', 'Введение', [], 'section', 20000),
  field('results', 'Ожидаемые результаты', ['примерные результаты', 'результаты'], 'section', 6000),
  field(
    'sources',
    'Список источников',
    ['список использованных источников', 'список источников литературы', 'список литературы'],
    'section',
    20000,
  ),
];

export function briefField(key: BriefFieldKey): BriefField {
  return BRIEF_FIELDS.find((item) => item.key === key)!;
}

/** Поля анкеты заказа — то, что пишется в форму «Нового заказа» и «Новой заявки». */
export const ORDER_FORM_FIELDS: readonly BriefFieldKey[] = [
  'customer',
  'email',
  'phone',
  'supervisor',
  'university',
  'direction',
  'serviceType',
  'title',
  'topic',
  'goal',
  'orderedOn',
  'deadline',
];

/** Поля «Исходных данных работы», переносимые в карточку работы. */
export const WORK_CARD_FIELDS: readonly BriefFieldKey[] = [
  'customer',
  'supervisor',
  'university',
  'institute',
  'chair',
  'group',
  'direction',
  'topic',
  'goal',
  'tasks',
  'journal',
];
