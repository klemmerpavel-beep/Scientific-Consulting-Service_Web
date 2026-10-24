/**
 * «Что сделать сейчас» на экране этапа — по фактическому состоянию и ходу
 * (решение Р-723; экран начинается с ответа «что сделать» — Р-199,
 * подсказка по фактическому состоянию — Р-254, Р-710).
 *
 * Прежде подсказка сотрудникам практики выбиралась по одному состоянию
 * этапа: этап, сданный куратором, этап, возвращённый клиентом, и этап,
 * сданный без материала и просроченный на полтора года, получали один
 * совет — «Работа идёт. Следите за сроком». Менеджер узнавал порядок шагов
 * из отказа: перевод на согласование до публикации версии отказывает
 * (Р-294). Теперь выбор учитывает сдачу куратором, возврат клиентом,
 * наличие материала, версии на публикации и просрочку; слова — как у дел
 * «Сегодня» и «Сводки».
 *
 * Куратор читал первой строкой «Задание» — описание этапа, написанное
 * клиенту, — и готовил материал к этапу, где ход не за ним. Теперь первая
 * строка — чей ход с его стороны (`turnLabel`, Р-288, Р-329), у
 * приостановленной и закрытой работы — `curatorWorkLine` (Р-527); когда
 * ход не за ним — «Сейчас от вас ничего не требуется».
 *
 * Модуль чистый: проверяется встроенным `node --test` без базы.
 */

import { curatorWorkLine, turnLabel, type StageStateKey } from './stage-state.ts';

/** Что делать сотрудникам практики в этом состоянии этапа. */
export const STAFF_TODO: Record<StageStateKey, string> = {
  NOT_STARTED:
    'Этап не начат: назначьте куратора на работе и переведите этап в работу, когда он приступил.',
  IN_PROGRESS:
    'Работа идёт. Следите за сроком: если куратор не успевает, перенесите срок сейчас, а не в день сдачи.',
  AWAITING_CLIENT:
    'Ждём материалы от клиента. Если молчит дольше недели — напишите в переписке: причина остановки ему видна, но напоминание работает лучше.',
  IN_APPROVAL:
    'Клиент смотрит материалы. Замечания куратора на модерации опубликуйте: до этого клиент их не видит.',
  DONE: 'Этап закрыт. Проверьте, что следующий начат и у него есть срок.',
};

/**
 * Подсказка закрытого последнего этапа: следующего нет, и совет проверить
 * его расходился с экраном работы — «Все этапы завершены» (решение Р-710).
 */
export const DONE_LAST =
  'Все этапы закрыты: проверьте оплату и завершите работу в «Управлении работой».';

/**
 * Подсказка согласования без замечаний на модерации. Прежде «опубликуйте
 * замечания» стояло на этапе всегда, и после публикации куратор искал на
 * экране то, чего уже нет (решение Р-254).
 */
export const IN_APPROVAL_CLEAR =
  'Клиент смотрит материалы. Если он молчит дольше недели — напомните в переписке; согласовать этап за него можно кнопкой ниже.';

/** Куратор сдал этап с материалом, версия ждёт публикации (Э-05, Р-325, Р-294). */
export const HANDED_TO_PUBLISH =
  'Куратор сдал этап: проверьте версию, опубликуйте её клиенту и переведите на согласование — или верните куратору.';

/** Куратор сдал этап с материалом, публиковать нечего. */
export const HANDED_PUBLISHED =
  'Куратор сдал этап: проверьте версию и переведите на согласование — или верните куратору.';

/** Куратор сдал этап, а материала у этапа нет: на согласование такой не уходит (Р-254). */
export const HANDED_EMPTY =
  'Куратор сдал этап без материала: приложите материал или верните куратору с причиной.';

/** Клиент вернул этап, отметки нет (М-04, Р-283; дело «Сегодня» — те же слова). */
export const RETURNED =
  'Клиент вернул этап с замечаниями: передайте их куратору и отметьте «Замечания приняты в работу».';

/** Этап в работе после срока: «следите за сроком» уже поздно. */
export const IN_PROGRESS_LATE = 'Работа идёт.';

/** Куратору, когда ход не за ним. */
export const NOTHING_NOW = 'Сейчас от вас ничего не требуется.';

/** Число с согласованным словом: 1 день, 2 дня, 5 дней. */
function word(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** Что известно об этапе для подсказки сотрудникам практики. */
export interface StaffStageFacts {
  readonly state: StageStateKey;
  /** Куратор сдал этап менеджеру, решения ещё нет (Э-05, Р-325). */
  readonly handedOver: boolean;
  /** Материалов у этапа. */
  readonly materials: number;
  /** Версий куратора, ждущих публикации клиенту (Р-294). */
  readonly pendingVersions: number;
  /** Замечаний на модерации. */
  readonly pendingComments: number;
  /** Клиент вернул этап с замечаниями, отметки «приняты в работу» нет (Р-283). */
  readonly returnedUnacked: boolean;
  /** У закрытого этапа есть следующий (Р-710). */
  readonly hasNext: boolean;
  /** Сколько дней прошло со срока этапа; до срока — `null`. */
  readonly lateDays: number | null;
}

/**
 * Подсказка сотрудникам практики и ссылка-заготовка при ней: `remind` —
 * напомнить клиенту о материалах, `approve` — о согласовании (УМ-09, Р-377).
 */
export function staffStageTodo(facts: StaffStageFacts): { readonly text: string; readonly draft: 'remind' | 'approve' | null } {
  const late = facts.state !== 'DONE' && facts.lateDays !== null && facts.lateDays > 0 ? facts.lateDays : null;
  let lead: string;
  let draft: 'remind' | 'approve' | null = null;
  switch (facts.state) {
    case 'IN_PROGRESS':
      if (facts.handedOver) {
        lead = facts.materials === 0 ? HANDED_EMPTY : facts.pendingVersions > 0 ? HANDED_TO_PUBLISH : HANDED_PUBLISHED;
      } else if (facts.returnedUnacked) {
        lead = RETURNED;
      } else {
        lead = late === null ? STAFF_TODO.IN_PROGRESS : IN_PROGRESS_LATE;
      }
      break;
    case 'AWAITING_CLIENT':
      lead = STAFF_TODO.AWAITING_CLIENT;
      draft = 'remind';
      break;
    case 'IN_APPROVAL':
      // Версия на публикации названа строкой фактов со ссылкой на неё.
      if (facts.pendingComments > 0) lead = STAFF_TODO.IN_APPROVAL;
      else {
        lead = IN_APPROVAL_CLEAR;
        draft = 'approve';
      }
      break;
    case 'DONE':
      lead = facts.hasNext ? STAFF_TODO.DONE : DONE_LAST;
      break;
    default:
      lead = STAFF_TODO[facts.state];
  }
  const text =
    late === null
      ? lead
      : `${lead} Срок этапа прошёл ${late} ${word(late, 'день', 'дня', 'дней')} назад: перенесите срок.`;
  return { text, draft };
}

/** Строка фактов: сколько версий ждут публикации — «1 версия ждёт публикации». */
export function pendingVersionsLine(count: number): string {
  return `${count} ${word(count, 'версия ждёт', 'версии ждут', 'версий ждут')} публикации`;
}

/**
 * Первая строка «Что сделать сейчас» у куратора: чей ход с его стороны.
 * `idle` — ход не за ним: этап не запущен, сдан, ждёт клиента, на
 * согласовании, закрыт, или работа приостановлена либо закрыта.
 */
export function curatorStageLine(input: {
  readonly state: StageStateKey;
  readonly projectStatus: string;
  readonly hasExpert: boolean;
  readonly handedOverAt: Date | null;
}): { readonly text: string; readonly idle: boolean } {
  const work = curatorWorkLine(input.projectStatus);
  if (work !== null) return { text: `${work} ${NOTHING_NOW}`, idle: true };
  const turn = `${turnLabel(input.state, 'expert', input.hasExpert, input.handedOverAt)}.`;
  const idle = !(input.state === 'IN_PROGRESS' && input.handedOverAt === null);
  return { text: idle ? `${turn} ${NOTHING_NOW}` : turn, idle };
}
