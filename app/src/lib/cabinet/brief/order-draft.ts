/**
 * Документ → черновик формы «Нового заказа» (решение Р-560).
 *
 * Разбор заполняет ту же форму, что менеджер заполняет руками: заказ
 * создаёт прежняя кнопка, и все проверки ручного заказа — дубли по ФИО,
 * клиент другого менеджера (Р-308, Р-419) — работают как есть. Деньги из
 * документа не берутся: стоимость обсуждает менеджер.
 *
 * Модуль чистый: справочник видов передаётся параметром.
 */

import { moscowToday } from '../clock.ts';
import { parseDeadline } from '../import/etl.ts';
import { guessServiceCode, type ParsedBrief } from './parse.ts';

export interface OrderDraft {
  readonly values: Readonly<Record<string, string>>;
  /** Что разбор не смог перенести или угадал — для «Проверьте вручную». */
  readonly notes: readonly string[];
}

/** Пределы полей формы — как у карточки работы (`editProject`). */
const TOPIC_LIMIT = 500;
const SUMMARY_LIMIT = 2000;

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();
}

/**
 * Дата документа → день; не читается — `null` и заметка. Догадки разбора
 * (восстановленный год, последний день месяца) идут в «Проверьте вручную»:
 * ручной заказ прошедший срок принимает намеренно, и поймать ошибку может
 * только черновик (решение Р-673).
 */
function readDate(raw: string | undefined, label: string, notes: string[], orderDate: Date | null): Date | null {
  if (raw === undefined) return null;
  const { date, issues } = parseDeadline(raw, orderDate);
  // Четыре–шесть цифр разбор книги читает как порядковый день Excel: номер
  // из ячейки таблицы (45000 — 2023 год) проходит, а «2027» из документа
  // стало бы 1905 годом.
  if (date === null || date.getUTCFullYear() < 2000) {
    notes.push(`«${label}»: дата «${raw}» не прочитана — укажите вручную.`);
    return null;
  }
  for (const issue of issues) notes.push(`«${label}»: ${issue.note}, проверьте.`);
  return date;
}

const isoDay = (date: Date | null): string => (date === null ? '' : date.toISOString().slice(0, 10));

/**
 * Суть задачи из документа: цель, задачи, научный руководитель, журнал — в
 * пределах поля; не влезшее называется, а не обрезается. Общая для нового
 * заказа и карточки работы (Р-561).
 */
export function composeSummary(fields: ParsedBrief['fields']): { text: string; omitted: string[] } {
  const parts = [
    fields.goal === undefined ? null : `Цель: ${fields.goal}`,
    fields.tasks === undefined ? null : `Задачи:\n${fields.tasks}`,
    fields.supervisor === undefined ? null : `Научный руководитель: ${fields.supervisor}`,
    fields.journal === undefined ? null : `Журнал: ${fields.journal}`,
  ].filter((part): part is string => part !== null);
  const kept: string[] = [];
  const omitted: string[] = [];
  for (const part of parts) {
    if ([...kept, part].join('\n').length > SUMMARY_LIMIT) omitted.push(part.split(':')[0]!);
    else kept.push(part);
  }
  return { text: kept.join('\n'), omitted };
}

/** Вуз, институт, кафедра и группа — одной строкой для карточки клиента. */
export function universityLine(fields: ParsedBrief['fields']): string {
  return [fields.university, fields.institute, fields.chair, fields.group === undefined ? undefined : `группа ${fields.group}`]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
    .slice(0, 300);
}

export function orderDraftFromBrief(
  brief: Pick<ParsedBrief, 'fields' | 'article' | 'manual'>,
  types: readonly { readonly id: string; readonly code: string; readonly name: string }[],
  today: Date = moscowToday(),
): OrderDraft {
  const { fields } = brief;
  const notes: string[] = [...brief.manual];

  // Вид работы: по названию или коду справочника, иначе — подсказка по
  // тексту документа (шифр направления, «статья»).
  let type = null as (typeof types)[number] | null;
  if (fields.serviceType !== undefined) {
    const wanted = normalize(fields.serviceType);
    type = types.find((item) => normalize(item.name) === wanted || item.code === wanted) ?? null;
    if (type === null) type = types.find((item) => normalize(item.name).includes(wanted) || wanted.includes(normalize(item.name))) ?? null;
  }
  if (type === null) {
    const guess = guessServiceCode(brief);
    type = guess === null ? null : (types.find((item) => item.code === guess) ?? null);
    if (type !== null) notes.push(`Вид работы определён по тексту документа: «${type.name}» — проверьте.`);
    else notes.push('Вид работы не распознан — выберите вручную.');
  }

  const summary = composeSummary(fields);
  for (const part of summary.omitted) notes.push(`В «Суть задачи» не поместилось: «${part}» — перенесите вручную.`);

  const topic = fields.topic ?? '';
  if (topic.length > TOPIC_LIMIT) notes.push('Тема длиннее 500 знаков — сократите вручную.');

  // Срок читается от даты обращения, а её нет — от сегодняшнего дня, как
  // ручной заказ без даты. Сама дата обращения на следующий год не
  // переносится: она в прошлом (Р-673).
  const orderedOn = readDate(fields.orderedOn, 'Дата заказа', notes, null);
  const dueOn = readDate(fields.deadline, 'Срок', notes, orderedOn ?? today);

  return {
    values: {
      customer: fields.customer ?? '',
      email: fields.email ?? '',
      phone: fields.phone ?? '',
      serviceTypeId: type?.id ?? '',
      title: fields.title ?? type?.name ?? '',
      topic: topic.length > TOPIC_LIMIT ? '' : topic,
      summary: summary.text,
      university: universityLine(fields),
      speciality: (fields.direction ?? '').slice(0, 300),
      orderedOn: isoDay(orderedOn),
      dueOn: isoDay(dueOn),
    },
    notes,
  };
}
