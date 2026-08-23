import nodemailer from 'nodemailer';
import type { Lead } from './lead-schema';

/**
 * Доставка заявки ответственному. Каналов два — Telegram и почта, — и они
 * дублируют друг друга намеренно: заявка уже сохранена в базе, доставка лишь
 * ускоряет ответ. Поэтому отказ канала никогда не роняет приём заявки; он
 * записывается в журнал доставок и виден в админ-панели.
 */

export type DeliveryResult = { channel: string; ok: boolean; error?: string };

const SOURCE_NAMES: Record<string, string> = {
  landing: 'Посадочная',
  postgrad: 'Аспирантам',
  students: 'Студентам',
  business: 'Бизнесу',
};

/** Строки заявки в порядке, удобном для чтения с телефона */
function fields(lead: Lead): [string, string][] {
  const rows: [string, string | undefined][] = [
    ['Страница', SOURCE_NAMES[lead.source] ?? lead.source],
    ['Имя', lead.name],
    [lead.contactKind === 'email' ? 'E-mail' : 'Телефон', lead.contact],
    ['Организация', lead.organization],
    ['Направление', lead.direction],
    ['Тема работы', lead.topic],
    ['Специальность', lead.speciality],
    ['Что нужно', lead.need],
    ['Срок', lead.deadline],
    ['Сообщение', lead.message],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1] && r[1].trim()));
}

/**
 * Значение, попадающее в заголовок письма. Перевод строки внутри такого
 * значения — приём подмены заголовков: за ним можно дописать свои Bcc или
 * Content-Type. Библиотека кодирует заголовки сама, но полагаться на это
 * в единственном месте, куда приходит чужой текст, не стоит.
 */
const header = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ Telegram

async function sendTelegram(lead: Lead, id: string): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { channel: 'telegram', ok: false, error: 'канал не настроен' };

  const body = [
    '<b>Новая заявка</b>',
    '',
    ...fields(lead).map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`),
    '',
    `<code>${escapeHtml(id)}</code>`,
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: body,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { channel: 'telegram', ok: false, error: `${res.status} ${await res.text()}`.slice(0, 500) };
    }
    return { channel: 'telegram', ok: true };
  } catch (e) {
    return { channel: 'telegram', ok: false, error: String(e).slice(0, 500) };
  }
}

// ---------------------------------------------------------------------- Почта

async function sendMail(lead: Lead, id: string): Promise<DeliveryResult> {
  const host = process.env.SMTP_HOST;
  const to = process.env.LEAD_MAIL_TO;
  if (!host || !to) return { channel: 'email', ok: false, error: 'канал не настроен' };

  const rows = fields(lead)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6B6178;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#16121C">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');

  const html =
    `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#16121C">` +
    `<p style="margin:0 0 16px;font-size:17px;font-weight:600">Новая заявка с сайта</p>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    `<p style="margin:20px 0 0;font:12px/1.5 ui-monospace,monospace;color:#6B6178">` +
    `Заявка ${escapeHtml(id)} · согласие ${escapeHtml(lead.consent ? 'да' : 'нет')}` +
    `</p></div>`;

  try {
    const transport = nodemailer.createTransport({
      host,
      // Без ограничения времени зависший SMTP держал бы открытым и запрос
      // заявителя: доставка идёт до ответа страницы. Срок тот же, что у
      // Telegram, — восемь секунд.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? to,
      to,
      replyTo: lead.contactKind === 'email' ? header(lead.contact) : undefined,
      subject: header(
        `Заявка · ${SOURCE_NAMES[lead.source] ?? lead.source}${lead.name ? ` · ${lead.name}` : ''}`,
      ),
      html,
    });
    return { channel: 'email', ok: true };
  } catch (e) {
    return { channel: 'email', ok: false, error: String(e).slice(0, 500) };
  }
}

// ------------------------------------------------------------------ Диспетчер

/** Оба канала параллельно; отказ одного не влияет на другой */
export async function deliver(lead: Lead, id: string): Promise<DeliveryResult[]> {
  return Promise.all([sendTelegram(lead, id), sendMail(lead, id)]);
}
