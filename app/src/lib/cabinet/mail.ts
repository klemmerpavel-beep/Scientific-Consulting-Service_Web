import nodemailer from 'nodemailer';

import { header, hideSecrets } from '../notify.ts';

/**
 * Отправка письма участнику кабинета. От доставки заявок (`notify.ts`)
 * отличается адресатом: там письмо идёт ответственному на один известный
 * адрес, здесь — конкретному человеку, чей адрес является персональными
 * данными. Поэтому текст ошибки чистится от секретов перед любой записью,
 * а сам адрес в журнал не попадает.
 */

export interface MailResult {
  readonly ok: boolean;
  readonly error?: string;
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
    return { ok: false, error: hideSecrets(String(e)).slice(0, 500) };
  }
}
