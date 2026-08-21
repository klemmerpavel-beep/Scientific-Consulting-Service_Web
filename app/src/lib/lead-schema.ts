import { z } from 'zod';

/**
 * Разбор и проверка заявки. Одна схема на клиент и на сервер: проверка на
 * клиенте — это удобство, проверка на сервере — это то, чему можно верить.
 *
 * Версия текста согласия хранится вместе с заявкой: через год после подачи
 * нужно уметь показать, с чем именно согласился заявитель.
 */
export const CONSENT_VERSION = '2026-08-21';

/** Страницы, с которых приходят заявки */
export const SOURCES = ['landing', 'postgrad', 'students', 'business'] as const;

const trimmed = (max: number) => z.string().trim().max(max);

/** Телефон: принимаем как пишут люди, храним как есть, сверяем по числу цифр */
const PHONE = /^[\d\s()+\-.]{10,24}$/;

export const leadSchema = z
  .object({
    source: z.enum(SOURCES),
    form: trimmed(32).default('request'),

    contactKind: z.enum(['email', 'phone']),
    contact: trimmed(160).min(1, 'Оставьте e-mail или телефон — иначе мы не сможем ответить'),

    name: trimmed(120).optional(),
    organization: trimmed(200).optional(),
    topic: trimmed(300).optional(),
    speciality: trimmed(120).optional(),
    need: trimmed(160).optional(),
    deadline: trimmed(120).optional(),
    direction: trimmed(160).optional(),
    message: trimmed(4000).optional(),

    consent: z.literal(true, {
      message: 'Без согласия на обработку персональных данных заявку принять нельзя',
    }),
    terms: z.boolean().default(false),
    marketing: z.boolean().default(false),

    // Ловушка для роботов: поле скрыто от людей и должно остаться пустым
    company_website: z.string().max(0).optional().default(''),
    // Время от открытия формы до отправки, мс
    elapsed: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.contactKind === 'email') {
      const ok = z.string().email().safeParse(v.contact).success;
      if (!ok) {
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
