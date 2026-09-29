import nodemailer from 'nodemailer';
import type { Lead } from './lead-schema';

/**
 * Доставка заявки ответственному. Каналов два — Telegram и почта, — и они
 * дублируют друг друга намеренно: заявка уже сохранена в базе, доставка лишь
 * ускоряет ответ. Поэтому отказ канала никогда не роняет приём заявки; он
 * записывается в журнал доставок и виден в админ-панели.
 */

type DeliveryResult = { channel: string; ok: boolean; error?: string };

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
    // В отзыве поле `name` — роль автора, а не имя (Р-110).
    [lead.form === 'review' ? 'Автор' : 'Имя', lead.name],
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
export const header = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/**
 * Текст ошибки уходит в журнал доставок и оттуда — в админ-панель. Сообщение
 * сетевого отказа умеет включать адрес запроса, а в адресе Telegram лежит
 * токен бота; сообщение SMTP умеет включать строку авторизации. Секреты в
 * базе и на экране оператора — это уже утечка, поэтому вырезаем их до записи.
 */
export function hideSecrets(text: string): string {
  let out = text;
  for (const secret of [
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.SMTP_PASSWORD,
    process.env.TELEGRAM_CHAT_ID,
  ]) {
    if (secret && secret.length >= 8) out = out.split(secret).join('***');
  }
  return out.replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, 'bot***');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ Telegram

/**
 * Сигнал о заявке — без её содержания.
 *
 * Серверы мессенджера за пределами России, и Политика прямо называет
 * использование мессенджеров трансграничной передачей, обязуясь не прибегать
 * к ней до подтверждения перечня сервисов и подачи уведомления. Имя, контакт
 * и тема работы туда уйти не могут.
 *
 * Уходит ровно столько, чтобы человек понял: пришла заявка, пора смотреть.
 * Страница и форма говорят, откуда она; время — когда; номер — что именно
 * открывать в кабинете. Ни одно из этих значений не относится к субъекту:
 * номер заявки не опознаёт человека без доступа к базе.
 *
 * Содержание заявки идёт на почту и лежит в кабинете — там, где ему место.
 */
export function telegramSignal(lead: Lead, id: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ?? '';
  const where = SOURCE_NAMES[lead.source] ?? lead.source;
  const at = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Moscow',
  }).format(new Date());
  return [
    '<b>Новая заявка</b>',
    '',
    `<b>Страница:</b> ${escapeHtml(where)}`,
    `<b>Форма:</b> ${escapeHtml(lead.form ?? 'request')}`,
    `<b>Время:</b> ${escapeHtml(at)} МСК`,
    '',
    // Ссылка ведёт в карточку этой заявки: ФИО и контакт на телефоне — в
    // одно нажатие, звонок — во второе. В мессенджер они сами не уходят:
    // серверы Telegram за рубежом, а Политика до уведомления Роскомнадзора
    // трансграничную передачу исключает (решения Р-187, Р-276).
    'Имя и контакт — в карточке заявки:',
    `${base}/cabinet/manage/leads/${encodeURIComponent(id)}`,
    '',
    `<code>${escapeHtml(id)}</code>`,
  ].join('\n');
}

async function sendTelegram(lead: Lead, id: string): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { channel: 'telegram', ok: false, error: 'канал не настроен' };

  const body = telegramSignal(lead, id);

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
      return { channel: 'telegram', ok: false, error: hideSecrets(`${res.status} ${await res.text()}`).slice(0, 500) };
    }
    return { channel: 'telegram', ok: true };
  } catch (e) {
    return { channel: 'telegram', ok: false, error: hideSecrets(String(e)).slice(0, 500) };
  }
}

// ---------------------------------------------------------------------- Почта

/** Отметки журнала согласий словами — для подписи письма */
const yesNo = (v: boolean | undefined) => (v ? 'да' : 'нет');

/**
 * Письмо о заявке: тема, HTML и текстовая версия.
 *
 * Текстовая версия обязательна: письмо только в HTML почтовые фильтры
 * штрафуют, и заявка рискует лечь в спам ящика, который её ждёт. Отзыв
 * называется отзывом — прежде он приходил с темой «Заявка», а роль автора
 * стояла в строке «Имя». Подпись несёт весь журнал отметок, а не одно
 * согласие: менеджеру до ответа нужно знать, принята ли оферта и можно ли
 * писать о рассылке. Ссылка ведёт на карточку заявки в кабинете.
 */
export function leadMail(lead: Lead, id: string): { subject: string; html: string; text: string } {
  const review = lead.form === 'review';
  const where = SOURCE_NAMES[lead.source] ?? lead.source;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ?? '';
  const link = `${base}/cabinet/manage/leads/${encodeURIComponent(id)}`;
  const marks = review
    ? [['публикация', yesNo(lead.publish)]]
    : [
        ['согласие', yesNo(lead.consent)],
        ['оферта', yesNo(lead.terms)],
        ['рассылка', yesNo(lead.marketing)],
      ];
  const footer = `${review ? 'Отзыв' : 'Заявка'} ${id} · ${marks.map(([k, v]) => `${k}: ${v}`).join(' · ')}`;
  const title = review ? 'Новый отзыв с сайта' : 'Новая заявка с сайта';

  const rows = fields(lead)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#5C6474;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#14161C">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');

  const html =
    `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#14161C">` +
    `<p style="margin:0 0 16px;font-size:17px;font-weight:600">${title}</p>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    (base ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="color:#14417A">Открыть в кабинете</a></p>` : '') +
    `<p style="margin:20px 0 0;font:12px/1.5 ui-monospace,monospace;color:#5C6474">${escapeHtml(footer)}</p></div>`;

  const text = [
    title,
    '',
    ...fields(lead).map(([k, v]) => `${k}: ${v}`),
    '',
    ...(base ? [`Открыть в кабинете: ${link}`, ''] : []),
    footer,
  ].join('\n');

  const subject = header(`${review ? 'Отзыв' : 'Заявка'} · ${where}${lead.name ? ` · ${lead.name}` : ''}`);
  return { subject, html, text };
}

async function sendMail(lead: Lead, id: string): Promise<DeliveryResult> {
  const host = process.env.SMTP_HOST;
  const to = process.env.LEAD_MAIL_TO;
  if (!host || !to) return { channel: 'email', ok: false, error: 'канал не настроен' };

  const { subject, html, text } = leadMail(lead, id);

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
      replyTo: lead.contactKind === 'email' && lead.contact ? header(lead.contact) : undefined,
      subject,
      html,
      text,
    });
    return { channel: 'email', ok: true };
  } catch (e) {
    return { channel: 'email', ok: false, error: hideSecrets(String(e)).slice(0, 500) };
  }
}

// ------------------------------------------------------------------ Диспетчер

/** Оба канала параллельно; отказ одного не влияет на другой */
export async function deliver(lead: Lead, id: string): Promise<DeliveryResult[]> {
  return Promise.all([sendTelegram(lead, id), sendMail(lead, id)]);
}
