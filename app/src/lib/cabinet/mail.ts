import nodemailer from 'nodemailer';

import { header, hideSecrets } from '../notify.ts';

/**
 * Отправка письма участнику кабинета. От доставки заявок (`notify.ts`)
 * отличается адресатом: там письмо идёт ответственному на один известный
 * адрес, здесь — конкретному человеку, чей адрес является персональными
 * данными. Поэтому текст ошибки чистится от секретов и от адресов почты
 * перед любой записью, а сам адрес в журнал не попадает.
 */

export interface MailResult {
  readonly ok: boolean;
  readonly error?: string;
  /**
   * Отказ окончательный: сервер ответил кодом 5xx — ящика нет, адрес
   * отвергнут, письмо не принято. Повтор через пять минут даст то же самое,
   * поэтому очередь такую строку сразу помечает неудачей (решение Р-252).
   */
  readonly permanent?: boolean;
  /**
   * Сервер не ответил вовсе: соединение не установилось, оборвалось или
   * истекло. Остальные письма того же прохода ждали бы те же восемь секунд
   * каждое, поэтому очередь откладывает их, не тратя попыток (Р-255).
   */
  readonly unreachable?: boolean;
}

/**
 * Текст ошибки без адресов почты.
 *
 * Почтовый сервер повторяет адрес получателя в отказе («550 5.1.1
 * <ivanov@mail.ru>: user unknown»), и прежде он оседал в `lastError`
 * очереди — а оттуда на экран очереди и в копии базы, отдельно от
 * карточки, которую затирает обезличивание (решение Р-252).
 */
export function hideAddresses(text: string): string {
  return text.replace(/[^\s<>()[\]"',;:@]+@[^\s<>()[\]"',;:@]+/gu, '<адрес>');
}

/**
 * Окончательный ли отказ SMTP. Nodemailer кладёт код ответа сервера в
 * `responseCode` ошибки (для отвергнутых получателей — код ответа на
 * RCPT TO); сетевые сбои и тайм-ауты кода не имеют и повторяются.
 */
/** Коды nodemailer, которыми он называет отказ связи, а не ответ сервера. */
const UNREACHABLE_CODES = new Set(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET']);

/** Почтовый сервер недоступен: ответа по существу письма не было (Р-255). */
export function smtpUnreachable(error: unknown): boolean {
  const e = error as { code?: unknown; responseCode?: unknown } | null;
  if (typeof e?.responseCode === 'number') return false;
  return typeof e?.code === 'string' && UNREACHABLE_CODES.has(e.code);
}

export function smtpPermanent(error: unknown): boolean {
  const code = (error as { responseCode?: unknown } | null)?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}

/**
 * Настроен ли канал почты.
 *
 * Состояние общее для всех: оно не зависит ни от адреса, ни от того, есть
 * ли такая учётная запись. Поэтому спрашивать его можно до поиска человека
 * в базе — и отвечать честно, ничего о нём не раскрывая.
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Общие настройки транспорта. Сроки те же, что у доставки заявок. */
function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
      : undefined,
  });
}

export async function sendMailTo(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  const t = transport();
  if (t === null) return { ok: false, error: 'канал не настроен' };
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? to,
      to: header(to),
      subject: header(subject),
      html,
      text,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: hideAddresses(hideSecrets(String(e))).slice(0, 500),
      permanent: smtpPermanent(e),
      unreachable: smtpUnreachable(e),
    };
  }
}
