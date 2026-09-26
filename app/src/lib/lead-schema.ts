import { z } from 'zod';

/**
 * Разбор и проверка заявки. Одна схема на клиент и на сервер: проверка на
 * клиенте — это удобство, проверка на сервере — это то, чему можно верить.
 *
 * Версия текста согласия хранится вместе с заявкой: через год после подачи
 * нужно уметь показать, с чем именно согласился заявитель.
 */
export const CONSENT_VERSION = '2026-08-21';

/**
 * Сообщение об ограничении частоты. Живёт рядом со схемой, потому что его
 * показывают оба конца: сервер отдаёт его в ответе 429, клиент подставляет,
 * если тело ответа не прочиталось. Две редакции одного текста в двух файлах
 * расходились при первой же правке.
 */
export const RATE_LIMIT_MESSAGE =
  'Слишком много попыток подряд. Подождите несколько минут и отправьте снова.';

/** Страницы, с которых приходят заявки */
const SOURCES = ['landing', 'postgrad', 'students', 'business'] as const;

/**
 * Строковое поле с пределом длины. Сообщение о превышении — по-русски:
 * прежде заявитель читал английское «Too big: expected string to have
 * <=4000 characters» под полем «Сообщение» (решение Р-241).
 */
const trimmed = (max: number) =>
  z.string().trim().max(max, `Не длиннее ${max} ${plural(max)}`);

function plural(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'знаков';
  if (n % 10 === 1) return 'знака';
  return 'знаков';
}

/**
 * Адрес почты: имя, «@», домен с точкой. Проверка встроенной в zod
 * отвергала кириллические домены — «мария@почта.рф» получал «проверьте
 * адрес», хотя адрес рабочий (решение Р-241). Доставку проверяет письмо,
 * а не выражение: здесь отсекаются только явные опечатки.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export function looksLikeEmail(value: string): boolean {
  if (!EMAIL.test(value)) return false;
  const domain = value.slice(value.lastIndexOf('@') + 1);
  const top = domain.slice(domain.lastIndexOf('.') + 1);
  return top.length >= 2 && !/^\d+$/u.test(top);
}

/** Телефон: принимаем как пишут люди, храним как есть, сверяем по числу цифр */
const PHONE = /^[\d\s()+\-.]{10,24}$/;

export const leadSchema = z
  .object({
    source: z.enum(SOURCES),
    form: trimmed(32).default('request'),

    contactKind: z.enum(['email', 'phone']),
    // Пустым остаётся только у отзыва: там контакт не спрашивают вовсе.
    // Для заявки пустое значение отклоняется ниже, в superRefine.
    contact: trimmed(160),

    name: trimmed(120).optional(),
    organization: trimmed(200).optional(),
    topic: trimmed(300).optional(),
    speciality: trimmed(120).optional(),
    need: trimmed(160).optional(),
    deadline: trimmed(120).optional(),
    direction: trimmed(160).optional(),
    message: trimmed(4000).optional(),

    // Отметка согласия обязательна везде, кроме формы отзыва: та не
    // собирает ни имени, ни контакта, то есть персональных данных в ней
    // нет и согласие по ст. 9 152-ФЗ не требуется. Проверка — в superRefine.
    consent: z.boolean().default(false),
    terms: z.boolean().default(false),
    marketing: z.boolean().default(false),

    // Разрешение автора отзыва на публикацию его текста. Спросить его позже
    // не у кого: форма отзыва не собирает ни имени, ни контакта (Р-110).
    // Необязательное: отзыв без разрешения принимается и остаётся внутренним.
    publish: z.boolean().default(false),

    // Ловушка для роботов: поле скрыто от людей и должно остаться пустым.
    // Схема его НЕ отклоняет, и это намеренно. Отказ здесь ломал две вещи:
    // робот получал 422 с именем поля и узнавал, на чём попался, а живой
    // заявитель с автозаполнением, подставившим сюда адрес организации,
    // упирался в неустранимую ошибку на поле, которого не видит. Заполненную
    // ловушку разбирает looksAutomated: заявка сохраняется и помечается
    // спамом, как и описано ниже.
    // Значение не проверяется ни по длине, ни по типу: любое непустое —
    // признак робота, а не ошибка заявителя. Прежде строка длиннее 200
    // знаков давала 422 с именем поля ловушки (решение Р-241).
    company_website: z.preprocess(
      (value) => (value === undefined || value === null ? '' : String(value).trim().slice(0, 200)),
      z.string(),
    ),
    // Время от открытия формы до отправки, мс
    elapsed: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    // Отзыв — особая форма: в ней только роль автора и текст. Контакта и
    // отметки согласия в ней нет намеренно (решение Р-110), поэтому
    // требовать их нельзя; взамен обязателен сам текст отзыва.
    if (v.form === 'review') {
      if (!v.message) {
        ctx.addIssue({ code: 'custom', path: ['message'], message: 'Напишите отзыв — без текста отправлять нечего' });
      }
      return;
    }
    if (v.consent !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['consent'],
        message: 'Без согласия на обработку персональных данных заявку принять нельзя',
      });
      return;
    }
    if (!v.contact) {
      ctx.addIssue({
        code: 'custom',
        path: ['contact'],
        message: 'Оставьте e-mail или телефон — иначе мы не сможем ответить',
      });
      return;
    }
    if (v.contactKind === 'email') {
      if (!looksLikeEmail(v.contact)) {
        ctx.addIssue({
          code: 'custom',
          path: ['contact'],
          message: 'Проверьте адрес: он должен выглядеть как имя@домен',
        });
      }
      return;
    }
    const digits = v.contact.replace(/\D/g, '');
    if (!PHONE.test(v.contact) || digits.length < 10 || digits.length > 15) {
      ctx.addIssue({
        code: 'custom',
        path: ['contact'],
        message: 'Проверьте номер: нужно от 10 до 15 цифр',
      });
    }
  });

export type Lead = z.infer<typeof leadSchema>;

/**
 * Заявка в том виде, в каком её сохраняют и рассылают. Одна запись на оба
 * пути: прежде отзыв писался в базу без контакта, а в Telegram и почту
 * уходил исходный — с контактом, если его подставил робот или правка
 * формы (решение Р-241). Поле `name` в отзыве — роль автора, а не имя,
 * и остаётся; контакта отзыв не собирает (Р-110).
 */
export function forIntake(lead: Lead): Lead {
  if (lead.form !== 'review') return lead;
  return { ...lead, contact: '' };
}

/** Человеческие названия полей для сводки ошибок */
export const FIELD_LABELS: Record<string, string> = {
  contact: 'Контакт',
  name: 'Имя',
  organization: 'Организация',
  topic: 'Тема работы',
  speciality: 'Специальность',
  need: 'Что нужно',
  deadline: 'Срок',
  direction: 'Направление',
  message: 'Сообщение',
  consent: 'Согласие на обработку персональных данных',
};

/**
 * Признаки робота. Не отклоняем молча: помечаем заявку и всё равно сохраняем —
 * ложное срабатывание не должно стоить живого клиента.
 */
export function looksAutomated(v: Lead): string | null {
  if (v.company_website) return 'заполнено скрытое поле';
  if (typeof v.elapsed === 'number' && v.elapsed < 1200) return 'форма отправлена быстрее человека';
  return null;
}
