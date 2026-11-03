/**
 * Согласия куратора: камера на созвоне знакомства и витрина кураторов на
 * сайте (П-6, п. 3.2 задания; П-12, решение Р-768).
 *
 * Обе отметки ставит и снимает сам куратор в «Настройках», блок «Мой
 * профиль», прочитав текст согласия; руководитель на «Учётных записях»
 * видит отметку и день. Текст согласия на камеру — константа ниже. Текст
 * согласия на распространение для витрины (ст. 10.1 152-ФЗ) вносит
 * руководитель в настройках практики, его согласует юрист; пока текста
 * нет, отметки витрины у куратора нет. При отметке хранится свёртка
 * текста: сменился текст — прежнее согласие дано на прежний текст и в
 * витрину не идёт до новой отметки (`showcaseConsentValid`).
 *
 * Модуль чистый: ни базы, ни часов. Чтение и запись — `admin.ts` и
 * `practice-settings.ts`.
 */

import { createHash } from 'node:crypto';

export type ConsentKind = 'camera' | 'showcase';

/** Текст согласия на камеру — один на всех кураторов, правится только кодом. */
export const CAMERA_CONSENT_TEXT =
  'Даю согласие на показ моего изображения клиенту по видеосвязи на созвоне знакомства. ' +
  'Созвон ведёт менеджер ProDisser, запись разговора не ведётся. ' +
  'Подпись в комнате видеосвязи — «Куратор»; имя, место работы и контакты на созвоне не называются, ' +
  'контактами с клиентом не обмениваются. ' +
  'Согласие можно отозвать здесь же в любой момент; без него камера на созвоне не включается.';

/** Предел текста согласия на витрину: юридический текст на страницу-полторы. */
export const SHOWCASE_TEXT_MAX = 4000;

/** Названия согласий — в «Настройках» куратора, на «Учётных записях» и в журнале. */
export const CONSENT_TITLE: Readonly<Record<ConsentKind, string>> = {
  camera: 'Камера на созвоне знакомства',
  showcase: 'Витрина кураторов на сайте',
};

/**
 * Текст согласия к хранению и свёртке: переводы строк — `\n`, без пробелов
 * по краям строк и всего текста. Правка одних пробелов текст не меняет.
 */
export function normalizeConsentText(raw: string): string {
  return raw
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/** Свёртка SHA-256 текста согласия, шестнадцатеричная. */
export function consentTextHash(text: string): string {
  return createHash('sha256').update(normalizeConsentText(text), 'utf8').digest('hex');
}

/** Короткая свёртка — в журнал и в подсказку: по ней текст находится в журнале. */
export function shortHash(hash: string | null): string | null {
  return hash === null ? null : hash.slice(0, 12);
}

/** Отметки согласий в профиле куратора. */
export interface ConsentMarks {
  readonly cameraConsentAt: Date | null;
  readonly showcaseConsentAt: Date | null;
  readonly showcaseConsentHash: string | null;
}

/** Согласие на витрину: нет, дано на действующий текст, дано на прежний. */
export type ShowcaseState = 'none' | 'valid' | 'stale';

export function showcaseState(marks: ConsentMarks | null, text: string): ShowcaseState {
  if (marks?.showcaseConsentAt == null) return 'none';
  const current = normalizeConsentText(text);
  return current !== '' && marks.showcaseConsentHash === consentTextHash(current) ? 'valid' : 'stale';
}

/**
 * Согласие на витрину действует: отмечено самим куратором на тот текст,
 * что стоит в настройках практики сейчас. Будущая выгрузка витрины берёт
 * только таких кураторов; пока выгрузки нет, проверка держит правило.
 */
export function showcaseConsentValid(marks: ConsentMarks | null, text: string): boolean {
  return showcaseState(marks, text) === 'valid';
}

/**
 * Показывать ли куратору отметку витрины: есть текст согласия — чтобы
 * отметить; нет текста, но отметка осталась — чтобы её можно было отозвать.
 */
export function showcaseOffered(marks: ConsentMarks | null, text: string): boolean {
  return normalizeConsentText(text) !== '' || marks?.showcaseConsentAt != null;
}

const MOSCOW_DAY = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

/** День отметки по Москве: «2 ноября 2026». */
export function consentDay(at: Date): string {
  return MOSCOW_DAY.format(at).replace(/\s*г\.$/u, '');
}

/** Строка состояния согласия у самого куратора. */
export function consentStatusForCurator(kind: ConsentKind, marks: ConsentMarks | null, showcaseText: string): string {
  if (kind === 'camera') {
    return marks?.cameraConsentAt == null
      ? 'Согласия нет: камера на созвоне знакомства не включается.'
      : `Согласие дано ${consentDay(marks.cameraConsentAt)}: камеру на созвоне знакомства можно включить.`;
  }
  const state = showcaseState(marks, showcaseText);
  if (state === 'none' || marks?.showcaseConsentAt == null) return 'Согласия нет: в витрину кураторов вы не попадаете.';
  return state === 'valid'
    ? `Согласие дано ${consentDay(marks.showcaseConsentAt)}.`
    : `Согласие дано ${consentDay(marks.showcaseConsentAt)} на прежний текст. Текст сменился: до новой отметки карточка в витрину не идёт.`;
}

/** Строка состояния согласия у руководителя на «Учётных записях»: только чтение. */
export function consentStatusForHead(kind: ConsentKind, marks: ConsentMarks | null, showcaseText: string): string {
  if (kind === 'camera') {
    return marks?.cameraConsentAt == null
      ? 'согласия нет'
      : `куратор отметил согласие ${consentDay(marks.cameraConsentAt)}`;
  }
  const state = showcaseState(marks, showcaseText);
  if (state === 'none' || marks?.showcaseConsentAt == null) {
    return normalizeConsentText(showcaseText) === ''
      ? 'согласия нет; текст согласия не внесён — куратору отметка не показывается'
      : 'согласия нет';
  }
  return state === 'valid'
    ? `куратор отметил согласие ${consentDay(marks.showcaseConsentAt)}`
    : `куратор отметил согласие ${consentDay(marks.showcaseConsentAt)} на прежний текст — в витрину не идёт до новой отметки`;
}
