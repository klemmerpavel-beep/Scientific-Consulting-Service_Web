/**
 * Скорость ответа на заявку (п. 2.8 задания «Предпродажа, профиль куратора
 * и ход этапа», решение Р-766).
 *
 * Публичное обещание — ответ в течение рабочего дня (сайт, письмо «Заявка
 * получена», Р-312); срок реакции руководителя — в рабочих днях (Р-337).
 * Внутренняя цель строже: первый ответ за `leadFirstResponseHours` рабочих
 * часов (по умолчанию 2; 10:00–19:00 МСК по производственному календарю —
 * одно рабочее время с сайтом и рекламой, П-18, Р-774). Первый ответ —
 * первая смена состояния заявки менеджером из «Новой»
 * (`Lead.firstResponseAt`).
 *
 * «Аналитика» показывает медиану за 90 дней (окно Р-342, границы Р-448):
 * заявка → первый ответ. Остальные отрезки задания — одобрение → созвон,
 * созвон → Задание, Задание → согласование — появятся с созвоном
 * знакомства и Заданием: данных для них в кабинете пока нет.
 *
 * Модуль чистый: заявки, календарь, цель и день приходят параметрами.
 */

import { moscowToday } from '../clock.ts';
import { workMinutesBetween, type CalendarOverrides } from '../workdays.ts';
import { median, periodBounds, type Conclusion } from './metrics.ts';

/** Окно медианы — 90 московских дней по сегодняшний (Р-342, Р-448). */
export const RESPONSE_WINDOW_DAYS = 90;

/** Заявка для расчёта: без спама и отзывов (как в «Заявках» аналитики, Р-351). */
export interface ResponseRow {
  readonly createdAt: Date;
  /** Первый ответ; `null` — ответа ещё не было. */
  readonly firstResponseAt?: Date | null;
  /** Заявка «Новая» без первого ответа — ждёт его сейчас. */
  readonly waiting?: boolean;
}

export interface ResponseSpeed {
  /** Окно: московские дни прихода заявки, оба включительно. */
  readonly from: Date;
  readonly to: Date;
  /** Цель в рабочих часах. */
  readonly targetHours: number;
  /**
   * С какого числа ответов вывод о медиане — «подтверждено числами»: общий
   * порог «уверенно» практики из «Справочников» (РК-16, Р-349; решение
   * владельца к Р-766). Меньше — «вероятно»: одна-две заявки с долгим
   * ответом сдвигают медиану.
   */
  readonly sureFrom: number;
  /** Заявок окна с первым ответом. */
  readonly answered: number;
  /** Медиана рабочих минут до первого ответа; `null` — ответов нет. */
  readonly medianMinutes: number | null;
  /** Ответов не дольше цели. */
  readonly withinTarget: number;
  /** Заявок окна, ждущих первого ответа сейчас. */
  readonly waiting: number;
}

/**
 * Медиана «заявка → первый ответ» в рабочих минутах за 90 дней по дню
 * прихода заявки. Заявка, пришедшая вечером или в выходной, ждёт с начала
 * следующего рабочего дня: ночь в счёт не идёт.
 */
export function responseSpeed(
  rows: readonly ResponseRow[],
  controlDate: Date,
  targetHours: number,
  calendar: CalendarOverrides,
  sureFrom: number,
): ResponseSpeed {
  const { from, to } = periodBounds(moscowToday(controlDate), RESPONSE_WINDOW_DAYS);
  const minutes: number[] = [];
  let waiting = 0;
  for (const row of rows) {
    const day = moscowToday(row.createdAt).getTime();
    if (day < from.getTime() || day > to.getTime()) continue;
    if (row.firstResponseAt !== undefined && row.firstResponseAt !== null) {
      minutes.push(workMinutesBetween(row.createdAt, row.firstResponseAt, calendar));
    } else if (row.waiting === true) {
      waiting += 1;
    }
  }
  return {
    from,
    to,
    targetHours,
    sureFrom,
    answered: minutes.length,
    medianMinutes: minutes.length === 0 ? null : Math.round(median(minutes)),
    withinTarget: minutes.filter((value) => value <= targetHours * 60).length,
    waiting,
  };
}

/** Рабочее время словами: «45 мин», «2 ч», «1 ч 30 мин». */
export function workTime(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} мин`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Склонение по числу: модуль расчётов не знает разметки. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Экран действия вывода — очередь новых заявок (Р-751). */
export const RESPONSE_NEXT = { href: '/cabinet/manage/leads?status=NEW', label: '«Заявки»: новые' } as const;

/**
 * Вывод по правилу Р-194 — действие, срок, уверенность, — когда медиана
 * первого ответа за 90 дней дольше цели, то есть в цель уложилось меньше
 * половины ответов. Оценки эффекта нет: деньги от быстрого ответа из
 * своих чисел честно не выводятся. Медиана в цели — вывода нет: делать
 * нечего, число стоит в таблице «Скорость ответа». Уверенность —
 * «подтверждено числами» с порога «уверенно» практики (`sureFrom`).
 */
export function responseConclusion(speed: ResponseSpeed): Conclusion | null {
  if (speed.medianMinutes === null || speed.medianMinutes <= speed.targetHours * 60) return null;
  const n = speed.answered;
  return {
    area: 'Заявки',
    title: 'Сократить время первого ответа на заявку',
    text:
      `Медиана первого ответа за 90 дней — ${workTime(speed.medianMinutes)} рабочего времени ` +
      `по ${n} ${plural(n, 'заявке', 'заявкам', 'заявкам')} при цели ${speed.targetHours} ч. ` +
      `Не дольше цели ответили на ${speed.withinTarget} из ${n}.` +
      (speed.waiting === 0 ? '' : ` Ждут первого ответа сейчас: ${speed.waiting}.`),
    action:
      'Отвечать на новую заявку по делу «Заявка ждёт ответа» на «Сегодня» и сразу отмечать её ' +
      'состояние. Если менеджер занят консультациями, договориться, кто смотрит очередь заявок ' +
      'в первой и во второй половине дня.',
    confidence: n >= speed.sureFrom ? 'sure' : 'likely',
    term: 'две недели',
    effect: null,
    next: RESPONSE_NEXT,
  };
}
