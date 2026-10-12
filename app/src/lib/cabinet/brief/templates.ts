/**
 * Шаблоны документов, из которых кабинет заполняет карточку (задание
 * владельца 12.10.2026, решение Р-557).
 *
 * Шаблоны собираются из перечня полей `BRIEF_FIELDS` при каждой выдаче, а
 * не лежат готовыми файлами: подпись поля одна для шаблона и разборщика, и
 * правка перечня меняет оба. Проверка читает каждый шаблон тем же
 * разборщиком и сверяет, что все поля узнаются.
 *
 * Разделы «Исходных данных» — как в образцах владельца: шапка, тема, цель,
 * задачи, актуальность, план-содержание, источники; у статьи — журнал,
 * структура и ожидаемые результаты. Вместо готового введения — «Тезисы к
 * введению» (решение владельца 12.10.2026): правило «сервис не пишет за
 * клиента». Пояснения стоят в начале документа, до первой метки: строка
 * подсказки под меткой стала бы её значением.
 */

import { xlsx } from '../../disk/xlsx.ts';
import { docx, type DocBlock } from '../docx.ts';
import { briefField, type BriefFieldKey } from './fields.ts';

export interface BriefTemplate {
  readonly key: string;
  readonly title: string;
  /** Имя файла для человека и запасное латиницей (RFC 8187). */
  readonly file: string;
  readonly ascii: string;
  readonly type: string;
  readonly note: string;
  /** Поля, которые разборщик обязан узнать в этом шаблоне. */
  readonly fields: readonly BriefFieldKey[];
  build(): Buffer;
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ORDER_FIELDS: readonly BriefFieldKey[] = [
  'customer',
  'email',
  'phone',
  'serviceType',
  'title',
  'topic',
  'goal',
  'supervisor',
  'university',
  'direction',
  'orderedOn',
  'deadline',
];

const label = (key: BriefFieldKey) => briefField(key).label;

const ORDER_NOTE =
  'Заполните правый столбец. Строки не переставляйте и не удаляйте: кабинет узнаёт поля по подписи слева. Даты — в виде ДД.ММ.ГГГГ. Стоимость в анкете не указывается: её обсуждает менеджер.';

const WORK_NOTE = [
  'Заполните шапку и разделы после двоеточий; текст раздела — с новой строки. Подписи разделов не меняйте: кабинет узнаёт их по ним.',
  'Несколько вариантов темы — строка «Вариант 1.», «Вариант 2.» перед темой, целью и задачами каждого варианта; шапка общая.',
  'Вместо готового введения — тезисы для согласования: актуальность, новизна, значимость.',
];

function workBlocks(title: string, header: readonly BriefFieldKey[], sections: readonly string[]): DocBlock[] {
  return [
    { kind: 'title', text: title },
    ...WORK_NOTE.map((text) => ({ kind: 'paragraph' as const, text, muted: true })),
    { kind: 'table', rows: header.map((key) => [label(key), '']) },
    ...sections.flatMap((text) => [
      { kind: 'paragraph' as const, text: `${text}:` },
      { kind: 'paragraph' as const, text: '' },
    ]),
  ];
}

export const BRIEF_TEMPLATES: readonly BriefTemplate[] = [
  {
    key: 'anketa-docx',
    title: 'Анкета для заявки',
    file: 'Анкета для заявки.docx',
    ascii: 'anketa-dlya-zayavki.docx',
    type: DOCX,
    note: 'Заполняется при обращении; из неё кабинет заполняет форму нового заказа или заявки.',
    fields: ORDER_FIELDS,
    build: () =>
      docx('Анкета для заявки', [
        { kind: 'title', text: 'Анкета для заявки' },
        { kind: 'paragraph', text: ORDER_NOTE, muted: true },
        { kind: 'table', rows: ORDER_FIELDS.map((key) => [label(key), '']) },
      ]),
  },
  {
    key: 'anketa-xlsx',
    title: 'Анкета для заявки (Excel)',
    file: 'Анкета для заявки.xlsx',
    ascii: 'anketa-dlya-zayavki.xlsx',
    type: XLSX,
    note: 'Та же анкета книгой Excel: подписи — в первой колонке, значения — во второй.',
    fields: ORDER_FIELDS,
    build: () => xlsx({ title: 'Анкета для заявки', head: ['Поле', 'Значение'], rows: ORDER_FIELDS.map((key) => [label(key), '']) }),
  },
  {
    key: 'iskhodnye-rabota',
    title: 'Исходные данные работы',
    file: 'Исходные данные работы.docx',
    ascii: 'iskhodnye-dannye-raboty.docx',
    type: DOCX,
    note: 'Тема, цель, задачи и план работы — на утверждение клиенту; из документа кабинет обновляет карточку работы.',
    fields: ['customer', 'supervisor', 'university', 'institute', 'chair', 'direction', 'group', 'topic', 'goal', 'tasks', 'relevance', 'theses', 'plan', 'sources'],
    build: () =>
      docx(
        'Исходные данные работы',
        workBlocks(
          'Исходные данные работы',
          ['customer', 'supervisor', 'university', 'institute', 'chair', 'direction', 'group'],
          [label('topic'), label('goal'), label('tasks'), label('relevance'), label('theses'), label('plan'), label('sources')],
        ),
      ),
  },
  {
    key: 'iskhodnye-statya',
    title: 'Исходные данные статьи',
    file: 'Исходные данные статьи.docx',
    ascii: 'iskhodnye-dannye-stati.docx',
    type: DOCX,
    note: 'Тема, цель, задачи, журнал и структура статьи — на утверждение клиенту.',
    fields: ['customer', 'supervisor', 'university', 'direction', 'topic', 'goal', 'tasks', 'journal', 'theses', 'plan', 'results', 'sources'],
    build: () =>
      docx(
        'Исходные данные статьи',
        workBlocks(
          'Исходные данные статьи',
          ['customer', 'supervisor', 'university', 'direction'],
          ['Тема статьи', 'Цель статьи', 'Задачи статьи', label('journal'), label('theses'), 'Структура статьи', label('results'), 'Список литературы'],
        ),
      ),
  },
];

export function briefTemplate(key: string): BriefTemplate | null {
  return BRIEF_TEMPLATES.find((template) => template.key === key) ?? null;
}
