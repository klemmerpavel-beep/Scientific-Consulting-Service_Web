/**
 * Сверка заказчика при ручном заказе (требование М-18, решение Р-308).
 *
 * Прежде «Новый заказ» искал карточку только по ФИО и молча дописывал
 * найденную: заказ однофамильца ложился в чужую карточку. Теперь карточка
 * ищется по почте и телефону, а совпадение только по ФИО менеджер решает
 * сам. О найденных карточках он видит ФИО, маску почты и телефона и число
 * работ — без ссылок на карточки (ОМ-5): чужие клиенты менеджеру не видны.
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

import { draftFits } from './flash-value.ts';

/** Почта в виде для записи и сверки; `null` — не похоже на адрес. */
export function orderEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ? value : null;
}

/** Маска почты: первая буква имени и домена, зона — целиком. */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const zone = dot < 0 ? '' : domain.slice(dot);
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${zone}`;
}

/** Маска телефона: видны только две последние цифры. */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 4) return null;
  return `*** ***-**-${digits.slice(-2)}`;
}

/** Карточка, найденная только по ФИО, — как её видит менеджер. */
export interface NameCandidate {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly works: number;
}

/** Строка выбора: ФИО, маски контактов, число работ. */
export function candidateLine(candidate: NameCandidate): string {
  const parts = [
    candidate.fullName,
    maskEmail(candidate.email),
    maskPhone(candidate.phone),
    `работ: ${candidate.works}`,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/** Значение выбора «новая карточка». */
export const NEW_CLIENT = 'new';

/** Отказ, после которого менеджер выбирает карточку заказчика. */
export class ClientChoiceNeeded extends Error {
  constructor() {
    super('Заказчик с таким ФИО уже есть в практике: выберите его карточку или заведите новую.');
  }
}

/**
 * Поля «Нового заказа», которые уступают место признаку выбора карточки, —
 * по убыванию обычной длины, с подписями формы.
 */
const YIELDING: readonly (readonly [string, string])[] = [
  ['summary', 'Суть задачи'],
  ['topic', 'Описание работы'],
  ['university', 'Вуз или организация'],
  ['speciality', 'Направление или специальность'],
];

/**
 * Черновик «Нового заказа» после отказа. Выбор карточки открывается
 * признаком в черновике, а черновик больше cookie не сохраняется вовсе:
 * при длинной сути задачи экран не показывал списка карточек, и форма
 * отказывала раз за разом (решение Р-645). Поэтому при выборе длинные поля
 * по одному уступают место признаку, а причина называет их — менеджер
 * вставит их снова.
 */
export function orderRetryDraft(
  fields: Readonly<Record<string, string>>,
  choiceNeeded: boolean,
): { readonly draft: Readonly<Record<string, string>>; readonly note: string | null } {
  if (!choiceNeeded) return { draft: fields, note: null };
  const draft: Record<string, string> = { ...fields, clientChoiceNeeded: '1' };
  const dropped: string[] = [];
  for (const [name, label] of YIELDING) {
    if (draftFits(draft)) break;
    if (!draft[name]) continue;
    delete draft[name];
    dropped.push(`«${label}»`);
  }
  if (dropped.length === 0) return { draft, note: null };
  if (dropped.length === 1) {
    return { draft, note: `Поле ${dropped[0]} не сохранено — вставьте его снова после выбора карточки.` };
  }
  const list = `${dropped.slice(0, -1).join(', ')} и ${dropped[dropped.length - 1]}`;
  return { draft, note: `Поля ${list} не сохранены — вставьте их снова после выбора карточки.` };
}
