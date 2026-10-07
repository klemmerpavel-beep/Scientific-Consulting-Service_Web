import type { Prisma } from '../../generated/prisma/client.js';
import { workLine } from './work-line.ts';
import { prisma } from '../db.ts';
import { ensure, scopeLeads, type Actor } from './access.ts';
import { record } from './audit.ts';
import { CHANNEL_OFF, telegramNote, telegramPermanent, type EventKind } from './events.ts';
import { leadAddress, receivedLetter } from './lead-letter.ts';
import { defaultPath, openLink, safeNext } from './next-path.ts';
import { siteUrl } from '../site-url.ts';
import { mailConfigured, sendMailTo } from './mail.ts';
import { escapeHtml } from './token.ts';
import { formatDay } from './approval-text.ts';
import { DAILY_MAIL_HOUR, moscowToday, now as clockNow } from './clock.ts';
import { LEASE_MS, leaseRunningOut } from './outbox-lease.ts';

/**
 * Очередь исходящих уведомлений.
 *
 * Событие бизнес-логики не отправляет письмо, а кладёт строку в очередь — и
 * делает это в той же транзакции, что и само изменение. Отсюда три свойства,
 * ради которых очередь и заведена: недоступный SMTP не откатывает перевод
 * этапа; уведомление не теряется при падении процесса; недоставленное видно
 * руководителю, а не растворяется в журнале.
 *
 * Отправку выполняет отдельный маршрут, вызываемый по расписанию.
 */

export type { EventKind } from './events.ts';
export { CHANNEL_OFF, EVENT_LABEL, eventLabel, telegramNote } from './events.ts';

export interface OutboxItem {
  readonly userId: string;
  readonly projectId?: string | null;
  readonly eventKind: EventKind;
  readonly subject: string;
  readonly body: string;
  /**
   * Ключ дедупликации, например `stage:<id>:awaiting_client:2026-09-15`.
   * Повторная постановка того же события проходит без ошибки и без дубля:
   * напоминание о сроке не должно приходить дважды за день.
   */
  readonly dedupKey: string;
  /**
   * Экран события: на него ведут кнопка «Открыть кабинет» в письме и ссылка
   * сигнала Telegram (требование Т-06, решение Р-309). Без пути — экран
   * работы, если работа известна, иначе кабинет.
   */
  readonly path?: string | null;
  /**
   * Только этот канал: сигнал о сбое идёт тем каналом, который работает
   * (требование РК-02, решение Р-334).
   */
  readonly only?: 'EMAIL' | 'TELEGRAM';
}

/** Клиент Prisma или транзакция — уведомление ставится вместе с изменением. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Поставить уведомление во все каналы, включённые получателем. Роль здесь не
 * проверяется: адресата определяет вызывающий сценарий, который уже прошёл
 * через модуль прав.
 */
/**
 * Уведомить куратора работы о действии другого человека (решение Р-282).
 *
 * О собственном действии куратору не пишется: согласовав этап за клиента,
 * он и так знает об этом. Ключ повтора содержит адресата: у одного
 * события бывает несколько адресатов, и ключ без адресата отбросил бы
 * второго.
 */
export async function notifyCurator(
  db: Db,
  input: {
    readonly projectId: string;
    /** Автор действия; `null` — система (автозакрытие этапа, Р-290). */
    readonly actorId: string | null;
    readonly eventKind: EventKind;
    readonly subject: string;
    readonly body: string;
    readonly key: string;
    /** Экран события (Т-06, Р-309). */
    readonly path?: string | null;
  },
): Promise<number> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { managerId: true },
  });
  if (project === null || project.managerId === input.actorId) return 0;
  return enqueue(db, {
    userId: project.managerId,
    projectId: input.projectId,
    eventKind: input.eventKind,
    subject: input.subject,
    body: input.body,
    dedupKey: `${input.key}:${project.managerId}`,
    path: input.path ?? null,
  });
}

/**
 * Уведомить куратора работы — роль `EXPERT` (требование Э-09, решение
 * Р-328). О собственном действии куратору не пишется. Письмо называет
 * работу и этап, поэтому уходит только куратору с договором поручения
 * (Р-237); нейтральные события — назначение, снятие с работы,
 * вознаграждение — ставятся напрямую своим текстом. Текст собирается от
 * кода и названия работы, чтобы вызывающему не читать их отдельно.
 */
export async function notifyExpert(
  db: Db,
  input: {
    readonly projectId: string;
    /** Автор действия; `null` — система (автозакрытие этапа, Р-290). */
    readonly actorId: string | null;
    readonly eventKind: EventKind;
    readonly letter: (work: { readonly code: string; readonly title: string }) => {
      readonly subject: string;
      readonly body: string;
    };
    readonly key: string;
    /** Экран события (Т-06, Р-309). */
    readonly path?: string | null;
  },
): Promise<number> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      code: true,
      title: true,
      expertId: true,
      expert: { select: { role: true, expertProfile: { select: { ndaSignedAt: true } } } },
    },
  });
  if (project === null || project.expertId === null || project.expertId === input.actorId) return 0;
  if (project.expert?.role !== 'EXPERT' || (project.expert.expertProfile?.ndaSignedAt ?? null) === null) return 0;
  const letter = input.letter(project);
  return enqueue(db, {
    userId: project.expertId,
    projectId: input.projectId,
    eventKind: input.eventKind,
    subject: letter.subject,
    body: letter.body,
    dedupKey: `${input.key}:${project.expertId}`,
    path: input.path ?? null,
  });
}

/** Возвращает число поставленных строк: повтор по ключу не считается. */
/**
 * Письма куратору, которые в сводку не откладываются (УЭ-01, Р-398).
 * Поручение руководителя и напоминание о его сроке — тоже: «завтра срок»,
 * отложенное до 09:00 следующего дня, приходило в день срока, а поручение
 * со сроком «сегодня» — назавтра, после срока (решение Р-437).
 */
export const DIGEST_EXEMPT: ReadonlySet<string> = new Set([
  'CURATOR_INVITED',
  'NDA_SIGNED',
  'CURATOR_DIGEST',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_DUE',
]);

/**
 * Ближайшие 09:00 по Москве — время сводки куратора (улучшение УЭ-01,
 * решение Р-398). Москва — UTC+3 без перевода часов.
 */
export function nextDigestAt(at: Date): Date {
  const today = moscowToday(at).getTime() + (DAILY_MAIL_HOUR - 3) * 3_600_000;
  return new Date(at.getTime() < today ? today : today + 86_400_000);
}

/**
 * Сводка куратору: отложенные письма о работах — одним письмом в 09:00 по
 * Москве (улучшение УЭ-01, решение Р-398). Отложенные строки получают
 * состояние «вошло в сводку». Повторный прогон второй сводки не ставит:
 * вошедшие строки больше не ждут отправки.
 *
 * Отметка строк и сама сводка — одна транзакция, а ключ сводки — по дню и
 * первой вошедшей строке (решение Р-436). Прежде ключ был один на день:
 * строка, ставшая к отправке после утренней сводки (повтор неудачной,
 * отложенная до включения сводки), помечалась «вошло в сводку», а сводка
 * с тем же ключом не ставилась — письмо пропадало. Если сводку поставить
 * нельзя, отметка откатывается и строки уходят обычным порядком.
 */
/** Сводку не поставить: отметка строк откатывается (решение Р-436). */
class DigestSkipped extends Error {}

export async function enqueueCuratorDigest(at: Date = clockNow()): Promise<number> {
  const curators = await prisma.user.findMany({
    where: { role: 'EXPERT', status: 'ACTIVE', dailyDigest: true },
    select: { id: true },
  });
  let queued = 0;
  for (const curator of curators) {
    const rows = await prisma.notificationOutbox.findMany({
      where: {
        userId: curator.id,
        channel: 'EMAIL',
        state: 'PENDING',
        // Приглашение, доступ и сама сводка в сводку не входят.
        eventKind: { notIn: [...DIGEST_EXEMPT] },
        scheduledAt: { lte: at },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, subject: true },
    });
    if (rows.length === 0) continue;
    queued += await prisma
      .$transaction(async (tx) => {
        const claimed = await tx.notificationOutbox.updateMany({
          where: { id: { in: rows.map((row) => row.id) }, state: 'PENDING' },
          data: { state: 'MERGED', lastError: 'вошло в сводку куратора', scheduledAt: at },
        });
        if (claimed.count !== rows.length) throw new DigestSkipped();
        const put = await enqueue(tx, {
          userId: curator.id,
          eventKind: 'CURATOR_DIGEST',
          subject: `Сводка по вашим работам: ${rows.length} ${rows.length % 10 === 1 && rows.length % 100 !== 11 ? 'событие' : [2, 3, 4].includes(rows.length % 10) && ![12, 13, 14].includes(rows.length % 100) ? 'события' : 'событий'}`,
          body: `${rows.map((row) => `— ${row.subject}`).join('\n')}\nПодробности — в личном кабинете.`,
          dedupKey: `curator-digest:${moscowToday(at).toISOString().slice(0, 10)}:${curator.id}:${rows[0]!.id}`,
          only: 'EMAIL',
          path: '/cabinet/projects',
        });
        if (put === 0) throw new DigestSkipped();
        return put;
      })
      .catch((error: unknown) => {
        if (error instanceof DigestSkipped) return 0;
        throw error;
      });
  }
  return queued;
}

export async function enqueue(db: Db, item: OutboxItem): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: item.userId },
    select: {
      status: true,
      role: true,
      dailyDigest: true,
      notifyEmail: true,
      notifyTelegram: true,
      telegramChatId: true,
      notifyRules: { select: { eventKind: true, channel: true, enabled: true } },
    },
  });
  if (user === null || user.status !== 'ACTIVE') return 0;
  // Куратор со сводкой: письмо о работе ждёт утренней сводки (улучшение
  // УЭ-01, решение Р-398); приглашение, доступ и сама сводка — сразу.
  const held = user.role === 'EXPERT' && user.dailyDigest && !DIGEST_EXEMPT.has(item.eventKind);

  // Общие переключатели решают, каким каналом человек вообще согласен
  // получать уведомления. Правила решают, какие события каким каналом —
  // и только среди разрешённых каналов: правило не может включить канал,
  // выключенный целиком (решение Р-198).
  const allowed: ('EMAIL' | 'TELEGRAM')[] = [];
  if (user.notifyEmail) allowed.push('EMAIL');
  if (user.notifyTelegram && user.telegramChatId !== null) allowed.push('TELEGRAM');

  const channels = allowed.filter((channel) => item.only === undefined || channel === item.only).filter((channel) => {
    // Точное правило сильнее общего; когда правил нет вовсе, канал
    // работает — иначе включение разбора по событиям молча обрубило бы
    // все уведомления.
    const exact = user.notifyRules.find(
      (rule) => rule.eventKind === item.eventKind && rule.channel === channel,
    );
    if (exact !== undefined) return exact.enabled;
    const every = user.notifyRules.find(
      (rule) => rule.eventKind === '*' && rule.channel === channel,
    );
    return every === undefined ? true : every.enabled;
  });

  let created = 0;
  for (const channel of channels) {
    const { count } = await db.notificationOutbox.createMany({
      // Ключ уникален, поэтому повторная постановка молча пропускается:
      // это и есть идемпотентность, ради которой ключ заведён.
      data: {
        userId: item.userId,
        projectId: item.projectId ?? null,
        channel,
        eventKind: item.eventKind,
        subject: item.subject,
        body: item.body,
        dedupKey: `${item.dedupKey}:${channel.toLowerCase()}`,
        path: safeNext(item.path) ?? null,
        ...(held && channel === 'EMAIL' ? { scheduledAt: nextDigestAt(new Date()) } : {}),
      },
      skipDuplicates: true,
    });
    created += count;
  }
  return created;
}

/**
 * Письмо заявителю, у которого нет кабинета.
 *
 * Заявка с сайта учётной записи не заводит, а отказ её и не заведёт: у
 * человека, которому ответили «нет», кабинета не будет никогда. Прежде
 * причина отказа записывалась в заявку и дальше не шла — ни письма, ни
 * экрана, где заявитель мог бы её прочесть (решение Р-217).
 *
 * Канал один — почта, и только если человек оставил почту: Telegram
 * привязывается к учётной записи, а телефон отвечает звонком. Правила
 * уведомлений не спрашиваются — их нет у того, у кого нет записи, а
 * ответ на собственное обращение не рассылка, от которой отписываются.
 * Адрес в строку не копируется: рассылка читает его из заявки, и
 * обезличенная заявка письма уже не отправит.
 *
 * Возвращает, поставлено ли письмо.
 */
export async function enqueueToLead(
  db: Db,
  item: Omit<OutboxItem, 'userId'> & { readonly leadId: string },
): Promise<boolean> {
  const lead = await db.lead.findUnique({
    where: { id: item.leadId },
    select: { contactKind: true, contact: true },
  });
  if (lead === null || leadAddress(lead) === null) return false;
  await db.notificationOutbox.createMany({
    data: {
      leadId: item.leadId,
      projectId: item.projectId ?? null,
      channel: 'EMAIL',
      eventKind: item.eventKind,
      subject: item.subject,
      body: item.body,
      dedupKey: `${item.dedupKey}:email`,
    },
    skipDuplicates: true,
  });
  return true;
}

/**
 * Письмо «Заявка получена» заявителю (требование Т-05, решение Р-312).
 *
 * Ставится заявке с почтой, которая не машинная и не отзыв. Адрес в заявке
 * с сайта не подтверждён: без потолка форма стала бы рассыльщиком на чужие
 * ящики, поэтому на один адрес — не больше одного такого письма в сутки.
 * Возвращает, поставлено ли письмо.
 */
/** Писем «Заявка получена» в час на всех заявителей (решение Р-428). */
export const LEAD_RECEIVED_PER_HOUR = 30;

export async function enqueueLeadReceived(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, form: true, status: true, contactKind: true, contact: true },
  });
  if (lead === null || lead.status === 'SPAM' || lead.form === 'review') return false;
  const address = leadAddress(lead);
  if (address === null) return false;
  // Потолок — на ящик, а не на строку адреса: «ivanova+1@…» и
  // «ivanova+2@…» приходят в один ящик. И общий потолок в час: форма не
  // должна становиться рассыльщиком и по множеству разных адресов
  // (решение Р-428).
  const at = address.lastIndexOf('@');
  const local = address.slice(0, at).split('+')[0]!;
  const domain = address.slice(at);
  const [recent, hourly] = await Promise.all([
    prisma.notificationOutbox.count({
      where: {
        eventKind: 'LEAD_RECEIVED',
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        lead: {
          OR: [
            { contact: { equals: `${local}${domain}`, mode: 'insensitive' } },
            { contact: { startsWith: `${local}+`, endsWith: domain, mode: 'insensitive' } },
          ],
        },
      },
    }),
    prisma.notificationOutbox.count({
      where: { eventKind: 'LEAD_RECEIVED', createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
  ]);
  if (recent > 0 || hourly >= LEAD_RECEIVED_PER_HOUR) return false;
  const { subject, body } = receivedLetter();
  return enqueueToLead(prisma, { leadId: lead.id, eventKind: 'LEAD_RECEIVED', subject, body, dedupKey: `lead:${lead.id}:received` });
}

/** Сколько раз пробуем доставить, прежде чем признать отправку неудачной. */
const MAX_ATTEMPTS = 5;


/** Адреса нет: заявка обезличена либо оставлен телефон. */
const NO_ADDRESS = 'адрес заявителя недоступен';
/** Получатель закрыт или отключил канал после постановки (решение Р-246). */
const RECIPIENT_OFF = 'получатель отключил канал или доступ закрыт';
/** Привязка Telegram снята получателем — отказ на его стороне, не сбой канала. */
const TG_UNBOUND = 'привязка Telegram снята';

/** Причина, с которой закрывается устаревшая строка. */
export const EXPIRED_NOTE = 'устарело до отправки';

/**
 * Сколько строка остаётся годной к отправке.
 *
 * Напоминание о сроке — сутки: «срок через три дня», дождавшееся настройки
 * почты или долгого обрыва связи, после срока вводило бы в заблуждение.
 * Прежде это правило знал только повтор отказавшей строки (решение Р-246);
 * очередь же, накопленная до настройки почты, разошлась бы целиком. Прочие
 * уведомления сроком не ограничены: письмо об отказе по заявке или о новом
 * сообщении остаётся верным и через неделю (решение Р-278).
 */
export function lifetimeMs(eventKind: string): number | null {
  // «Заявка получена» обещает ответ в течение рабочего дня: письмо, не
  // ушедшее за сутки, это обещание уже нарушает (Т-05, Р-312).
  return eventKind.startsWith('DEADLINE_') || eventKind === 'LEAD_RECEIVED' ? 24 * 60 * 60 * 1000 : null;
}

/** Устарела ли строка к моменту `at`. */
export function isExpired(row: { eventKind: string; createdAt: Date }, at: Date): boolean {
  const lifetime = lifetimeMs(row.eventKind);
  return lifetime !== null && at.getTime() - row.createdAt.getTime() > lifetime;
}

/** Через сколько проверить строку, ждущую настройки канала. */
const CHANNEL_OFF_DELAY_MS = 60 * 60 * 1000;

export interface DispatchReport {
  readonly taken: number;
  readonly sent: number;
  readonly failed: number;
}

/** Исход одной отправки: почтой или в Telegram. */
interface SendResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Повторять бессмысленно: адресат отвергнут окончательно (Р-252). */
  readonly permanent?: boolean;
  /** Сервер канала не ответил: соединение не установилось или истекло (Р-255). */
  readonly unreachable?: boolean;
}

/** Через сколько вернуть строку, отложенную из-за недоступного канала. */
const UNREACHABLE_DELAY_MS = 5 * 60 * 1000;

async function sendTelegram(chatId: string, text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: CHANNEL_OFF };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status}`, permanent: telegramPermanent(res.status) };
    }
    return { ok: true };
  } catch (e) {
    // Исключение fetch — это отказ связи или истёкшее ожидание: ответа
    // Telegram не было вовсе (Р-255).
    return { ok: false, error: String(e).slice(0, 300), unreachable: true };
  }
}

/** Ответ бота в чат: исход привязки (решение Р-246). Отказ канала не роняет маршрут. */
export async function telegramSay(chatId: string, text: string): Promise<void> {
  const result = await sendTelegram(chatId, text);
  if (!result.ok && result.error !== CHANNEL_OFF) {
    console.error('[telegram] ответ в чат не ушёл', result.error);
  }
}

/** Строка под письмом: участнику — о кабинете, заявителю — об обращении. */
const FOOTER_MEMBER = 'Письмо отправлено личным кабинетом ProDisser. Ход работы виден в кабинете.';
const FOOTER_APPLICANT = 'Письмо отправлено ProDisser в ответ на вашу заявку.';

export function renderLetter(subject: string, body: string, footer: string, open: string | null = null): string {
  const paragraphs = body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 14px">${escapeHtml(line)}</p>`)
    .join('');
  // Кнопка ведёт на экран события через `/cabinet/open`: с сессией — сразу,
  // без неё — на форму входа с готовым адресом (требование Т-06, Р-309).
  // Это не ссылка входа: ссылка входа в письме о событии запрещена (Р-162).
  const button =
    open === null
      ? ''
      : `<p style="margin:6px 0 18px"><a href="${escapeHtml(open)}" ` +
        `style="display:inline-block;padding:12px 22px;border-radius:999px;background:#14417A;` +
        `color:#FFFFFF;text-decoration:none;font-weight:600">Открыть кабинет</a></p>`;
  return (
    `<div style="font:15px/1.6 'Helvetica Neue',Arial,sans-serif;color:#14161C">` +
    `<p style="margin:0 0 16px;font-size:17px;font-weight:600">${escapeHtml(subject)}</p>` +
    paragraphs +
    button +
    `<p style="margin:20px 0 0;color:#5C6474;font-size:13px">${escapeHtml(footer)}</p></div>`
  );
}

/** Срок, на который прогон рассылки захватывает строку очереди. */

/**
 * Разослать накопившееся. Берём небольшими порциями: маршрут вызывается раз
 * в минуту, и длинная очередь разойдётся за несколько вызовов, не удерживая
 * запрос на минуты.
 */
export async function dispatch(limit = 20): Promise<DispatchReport> {
  // Строки захватываются до отправки: срок следующей попытки сдвигается на
  // время аренды одним запросом с `FOR UPDATE SKIP LOCKED`. Прежде порция
  // выбиралась простым чтением, и прогон, наложившийся на медленный
  // предыдущий (расписание раз в минуту, curl сдаётся через 30 секунд, а
  // маршрут продолжает работать), брал те же строки — письмо уходило
  // дважды (решение Р-235). Любой исход отправки ниже переписывает срок
  // или состояние, так что аренда держит строку только на время прогона;
  // если прогон оборвался, строка вернётся в очередь по истечении аренды.
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "NotificationOutbox" SET "scheduledAt" = ${leaseUntil}
    WHERE "id" IN (
      SELECT "id" FROM "NotificationOutbox"
      WHERE "state" = 'PENDING' AND "scheduledAt" <= ${now}
      ORDER BY "scheduledAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  const pending = await prisma.notificationOutbox.findMany({
    where: { id: { in: claimed.map((row) => row.id) } },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          email: true,
          telegramChatId: true,
          status: true,
          notifyEmail: true,
          notifyTelegram: true,
        },
      },
      lead: { select: { contactKind: true, contact: true } },
      project: { select: { code: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  // Каналы, сервер которых в этом проходе не ответил. Прежде при лежащей
  // почте проход ждал восемь секунд на каждое из двадцати писем — почти три
  // минуты, а расписание раз в минуту запускало следующие поверх. Теперь
  // после первого обрыва остальные строки канала откладываются без
  // попытки: пропавшая связь — не повод расходовать их лимит (решение Р-255).
  const down = new Set<string>();

  for (const [index, item] of pending.entries()) {
    if (leaseRunningOut(now.getTime(), Date.now())) {
      // Остаток порции — обратно в очередь, пока аренда ещё наша.
      await prisma.notificationOutbox.updateMany({
        where: { id: { in: pending.slice(index).map((row) => row.id) }, state: 'PENDING', scheduledAt: leaseUntil },
        data: { scheduledAt: new Date() },
      });
      break;
    }
    if (isExpired(item, now)) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { state: 'EXPIRED', lastError: EXPIRED_NOTE, scheduledAt: now },
      });
      continue;
    }

    if (down.has(item.channel)) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { scheduledAt: new Date(Date.now() + UNREACHABLE_DELAY_MS) },
      });
      continue;
    }

    // Адресат перепроверяется в момент отправки: приостановленный после
    // постановки или отключивший канал больше писем не получает. Прежде
    // очередь отправляла всё, что в ней лежало (решение Р-246).
    const recipientOff =
      item.user !== null &&
      (item.user.status !== 'ACTIVE' ||
        (item.channel === 'EMAIL' && !item.user.notifyEmail) ||
        (item.channel === 'TELEGRAM' && !item.user.notifyTelegram));
    if (recipientOff) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { state: 'FAILED', failure: 'RECIPIENT_OFF', lastError: RECIPIENT_OFF, scheduledAt: new Date() },
      });
      continue;
    }

    // Адрес заявителя читается из заявки сейчас, а не при постановке:
    // обезличенная за это время заявка адреса уже не даст (решение Р-217).
    const address = item.user?.email ?? (item.lead === null ? null : leadAddress(item.lead));
    const footer = item.user === null ? FOOTER_APPLICANT : FOOTER_MEMBER;
    const chatId = item.user?.telegramChatId ?? null;
    // Экран события; заявителю кабинета нет — и кнопки нет (Т-06, Р-309).
    const screen = item.path ?? defaultPath(item.project?.code ?? null);
    const base = siteUrl();
    const open = item.user === null || base === null ? null : openLink(base, screen, address);
    const text = open === null ? item.body : `${item.body}\n\nОткрыть кабинет: ${open}`;
    const result: SendResult =
      address === null && item.channel === 'EMAIL'
        ? { ok: false, error: NO_ADDRESS }
        : item.channel === 'EMAIL'
          ? await sendMailTo(address!, item.subject, renderLetter(item.subject, item.body, footer, open), text)
          : chatId === null
            ? { ok: false, error: TG_UNBOUND }
            : await sendTelegram(chatId, telegramNote(item.eventKind, item.project?.code ?? null, screen));

    // Без адреса повторять нечего: строка сразу помечается неудачей.
    if (result.error === NO_ADDRESS) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { state: 'FAILED', failure: 'NO_ADDRESS', attempts: { increment: 1 }, lastError: NO_ADDRESS },
      });
      failed += 1;
      continue;
    }

    if (result.ok) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { state: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
      sent += 1;
      continue;
    }

    // Ненастроенный канал не расходует попытки: строка ждёт настройки,
    // а не перегорает. Отдельного состояния для этого не заводится —
    // причина в `lastError` и так называет положение дел.
    if (result.error === CHANNEL_OFF) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          lastError: CHANNEL_OFF,
          scheduledAt: new Date(Date.now() + CHANNEL_OFF_DELAY_MS),
        },
      });
      failed += 1;
      continue;
    }

    // Окончательный отказ — ящика нет, адрес отвергнут, бот заблокирован —
    // строку сразу закрывает: прежде она ещё четыре раза стучалась туда же,
    // по разу в несколько минут (решение Р-252). Признак выставляет сама
    // отправка по коду ответа сервера, а не разбор текста ошибки.
    if (result.unreachable === true) down.add(item.channel);
    const attempts = item.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS || result.permanent === true;
    // Снятая привязка — отказ получателя; остальное — отказ доставки, о
    // котором руководитель узнаёт делом и сигналом (РК-02, Р-334).
    const failure = !giveUp ? null : result.error === TG_UNBOUND ? 'RECIPIENT_OFF' : 'DELIVERY';
    await prisma.notificationOutbox.update({
      where: { id: item.id },
      data: {
        state: giveUp ? 'FAILED' : 'PENDING',
        failure,
        attempts,
        lastError: result.error ?? null,
        // Отступ растёт с числом попыток: временная недоступность почты не
        // должна выливаться в сотню обращений подряд.
        scheduledAt: giveUp ? now : new Date(Date.now() + attempts * 5 * 60 * 1000),
      },
    });
    // Сбой самого сигнала нового сигнала не порождает.
    if (failure === 'DELIVERY' && item.eventKind !== 'OUTBOX_FAILED') await signalFailure(item.channel, now);
    failed += 1;
  }

  return { taken: pending.length, sent, failed };
}

const CHANNEL_NAME: Record<'EMAIL' | 'TELEGRAM', string> = { EMAIL: 'почта', TELEGRAM: 'Telegram' };

/**
 * Сигнал руководителям о сбое отправки — тем каналом, который работает:
 * сбой почты — в Telegram, сбой Telegram — письмом (требование РК-02,
 * решение Р-334). Не чаще раза в сутки на канал: ключ — канал и
 * московский день. Пока второй канал у руководителя не подключён, сигнал
 * не ставится — остаются дело на «Сводке» и плашка.
 */
async function signalFailure(channel: 'EMAIL' | 'TELEGRAM', at: Date): Promise<void> {
  const other = channel === 'EMAIL' ? 'TELEGRAM' : 'EMAIL';
  const day = moscowToday(at).toISOString().slice(0, 10);
  const heads = await prisma.user.findMany({ where: { role: 'HEAD', status: 'ACTIVE' }, select: { id: true } });
  for (const head of heads) {
    await enqueue(prisma, {
      userId: head.id,
      eventKind: 'OUTBOX_FAILED',
      subject: `Уведомления не доставлены: ${CHANNEL_NAME[channel]}`,
      body:
        `Канал «${CHANNEL_NAME[channel]}» не доставил уведомление после всех попыток.\n` +
        'Причина и строки очереди — в «Управление → Очередь уведомлений».',
      dedupKey: `outbox-failed:${channel.toLowerCase()}:${day}:${head.id}`,
      path: '/cabinet/manage/outbox',
      only: other,
    });
  }
}

/**
 * Не настроен ни один канал — ни почта, ни бот. Тогда на «Сводке» —
 * постоянная плашка «Уведомления не уходят: настройте почту» (требование
 * РК-02, решение Р-334).
 */
export function notifyChannelsDown(): boolean {
  return !mailConfigured() && !(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
}

/**
 * Напоминания о сроке этапа (требование М-08, ОМ-14, решение Р-301).
 *
 * Адресат — тот, чей ход: клиенту — только когда этап ждёт его данных
 * (на согласовании ему напоминает срок согласования, Р-290); эксперту с
 * договором поручения — пока этап в работе и не сдан менеджеру: сданный
 * этап — ход менеджера (требование Э-09, решение Р-328); куратору — всегда. Прежде
 * клиенту приходило «срок этапа подходит» и тогда, когда от него ничего не
 * ждали, а куратор и эксперт не получали ничего.
 *
 * Одно письмо за три дня до срока и одно при срыве — вместо ежедневных.
 * Ключ — этап, срок и адресат: перенос срока даёт новое напоминание. День
 * считается по Москве, этап со сроком «сегодня» тоже напоминается.
 * «Срок сорван» берёт только вчерашние сроки: первый прогон после выката
 * не рассылает его по давно сорванным этапам.
 */
export async function enqueueDeadlineReminders(at: Date = new Date()): Promise<number> {
  const today = moscowToday(at);
  const DAY = 24 * 60 * 60 * 1000;
  const yesterday = new Date(today.getTime() - DAY);
  const horizon = new Date(today.getTime() + 3 * DAY);

  const stages = await prisma.stage.findMany({
    where: {
      state: { in: ['NOT_STARTED', 'IN_PROGRESS', 'AWAITING_CLIENT', 'IN_APPROVAL'] },
      dueOn: { gte: yesterday, lte: horizon },
      // Приостановленная, завершённая и отменённая работа о сроках этапов
      // не напоминает (решение Р-235).
      project: { status: 'ACTIVE' },
    },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          title: true,
          managerId: true,
          client: { select: { userId: true } },
          expert: {
            select: { id: true, status: true, role: true, expertProfile: { select: { ndaSignedAt: true } } },
          },
        },
      },
    },
  });

  let queued = 0;
  for (const stage of stages) {
    const dueOn = stage.dueOn!;
    const missed = dueOn.getTime() < today.getTime();
    const { project } = stage;
    // Эксперт — только с договором поручения: без него название этапа
    // ему не показывается (решение Р-237).
    const expert =
      project.expert !== null &&
      project.expert.status === 'ACTIVE' &&
      project.expert.role === 'EXPERT' &&
      (project.expert.expertProfile?.ndaSignedAt ?? null) !== null
        ? project.expert.id
        : null;
    const recipients = new Set<string>([project.managerId]);
    if (stage.state === 'AWAITING_CLIENT' && project.client.userId !== null) recipients.add(project.client.userId);
    if (stage.state === 'IN_PROGRESS' && stage.handedOverAt === null && expert !== null) recipients.add(expert);

    for (const userId of recipients) {
      const forClient = userId === project.client.userId;
      // Считаются новые строки, а не попытки (решение Р-246).
      queued += await enqueue(prisma, {
        userId,
        projectId: project.id,
        eventKind: missed ? 'DEADLINE_MISSED' : 'DEADLINE_IN_3_DAYS',
        subject: missed
          ? `Срок этапа «${stage.title}» сорван`
          : `Срок этапа «${stage.title}» — ${formatDay(dueOn)}`,
        body:
          `${workLine(project, forClient)}\n` +
          (missed
            ? `Срок этапа «${stage.title}» был ${formatDay(dueOn)}.\n`
            : `Этап «${stage.title}» должен быть закрыт до ${formatDay(dueOn)} включительно.\n`) +
          (forClient
            ? 'Этап ждёт ваших материалов: что нужно, видно на главном экране кабинета.'
            : 'Ход по этапу виден на его экране в личном кабинете.'),
        dedupKey: `stage:${stage.id}:${missed ? 'missed' : 'due-soon'}:${dueOn.toISOString().slice(0, 10)}:${userId}`,
        path: `/cabinet/stages/${stage.id}`,
      });
    }
  }
  return queued;
}

/**
 * Состояние очереди для руководителя.
 *
 * Модуль в собственном заголовке обещает, что недоставленное видно, а не
 * растворяется в журнале. Эта выборка и есть исполнение обещания: пока
 * экрана не было, письмо, не ушедшее после пяти попыток, никто не видел.
 */
export interface OutboxFailure {
  readonly id: string;
  readonly channel: 'EMAIL' | 'TELEGRAM';
  readonly eventKind: string;
  readonly subject: string;
  readonly recipient: string;
  readonly projectTitle: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly scheduledAt: Date;
}

export interface OutboxDigest {
  readonly pending: number;
  readonly sentLastDay: number;
  readonly failed: number;
  /** Из неудач — отказы доставки: по ним дело на «Сводке» (РК-02, Р-334). */
  readonly deliveryFailed: number;
  /** Ждут настройки канала: попытки им не наращиваются (см. `dispatch`). */
  readonly waitingChannel: number;
  /** Закрыты без отправки за последние сутки: устарели в очереди. */
  readonly expiredLastDay: number;
  readonly lastSentAt: Date | null;
  readonly failures: readonly OutboxFailure[];
}

export async function outboxDigest(actor: Actor): Promise<OutboxDigest> {
  // Очередь — служебная кухня практики: в ней видны адресаты по всем работам,
  // поэтому право то же, что у журналов.
  ensure(actor, 'AUDIT_VIEW');
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pending, sentLastDay, failed, deliveryFailed, waitingChannel, expiredLastDay, lastSent, failures] = await Promise.all([
    prisma.notificationOutbox.count({ where: { state: 'PENDING' } }),
    prisma.notificationOutbox.count({ where: { state: 'SENT', sentAt: { gte: dayAgo } } }),
    prisma.notificationOutbox.count({ where: { state: 'FAILED' } }),
    prisma.notificationOutbox.count({ where: { state: 'FAILED', failure: 'DELIVERY' } }),
    prisma.notificationOutbox.count({ where: { state: 'PENDING', lastError: CHANNEL_OFF } }),
    prisma.notificationOutbox.count({ where: { state: 'EXPIRED', scheduledAt: { gte: dayAgo } } }),
    prisma.notificationOutbox.findFirst({
      where: { state: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    }),
    prisma.notificationOutbox.findMany({
      where: { state: 'FAILED' },
      // Свежие уведомления первыми. Срок следующей попытки у отказавшей
      // строки — след аренды, а не момент отказа: по нему старые строки
      // вытесняли свежие из перечня (решение Р-249).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        channel: true,
        eventKind: true,
        subject: true,
        attempts: true,
        lastError: true,
        scheduledAt: true,
        user: { select: { fullName: true } },
        lead: { select: { name: true } },
        project: { select: { title: true } },
      },
    }),
  ]);

  return {
    pending,
    sentLastDay,
    failed,
    deliveryFailed,
    waitingChannel,
    expiredLastDay,
    lastSentAt: lastSent?.sentAt ?? null,
    failures: failures.map((row) => ({
      id: row.id,
      channel: row.channel,
      eventKind: row.eventKind,
      subject: row.subject,
      // Адрес получателя в служебный перечень не выносится: для разбора
      // достаточно имени, а адрес — персональные данные.
      recipient: row.user?.fullName ?? `заявитель ${row.lead?.name ?? 'без имени'}`,
      projectTitle: row.project?.title ?? null,
      attempts: row.attempts,
      lastError: row.lastError,
      scheduledAt: row.scheduledAt,
    })),
  };
}

/**
 * Доставка заявок с сайта — второй, более старый путь уведомлений.
 *
 * Обращение с сайта не проходит через эту очередь: маршрут приёма шлёт его
 * в Telegram и на почту сразу, а исход записывает в `Delivery` (см.
 * `src/lib/notify.ts`). Таблица велась с открытия сайта и не показывалась
 * нигде: отказ канала был виден только тому, кто читает журнал контейнера.
 * Отсюда и выборка — на одном экране с очередью кабинета, потому что
 * вопрос у руководителя один: дошло ли до меня то, что пришло.
 *
 * Адрес и имя заявителя сюда не выносятся: для разбора отказа достаточно
 * страницы, темы и времени, а состав сведений держится минимальным
 * (ч. 5 ст. 5 152-ФЗ).
 */
export interface LeadDeliveryFailure {
  readonly id: string;
  readonly channel: string;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly leadId: string;
  readonly leadSource: string;
  readonly leadTopic: string | null;
  readonly leadCreatedAt: Date;
}

export interface LeadDeliveryDigest {
  /** Заявок с сайта за сутки — с чем сверяется число доставок. */
  readonly leadsLastDay: number;
  readonly deliveredLastDay: number;
  readonly lastOkAt: Date | null;
  /** Отказы за тридцать дней, кроме «канал не настроен». */
  readonly failed: number;
  /** Отказы за тридцать дней по причине незаданного канала. */
  readonly channelOff: number;
  readonly failures: readonly LeadDeliveryFailure[];
}

/** Глубина разбора: дальше месяца причина отказа уже не чинится. */
const LEAD_DELIVERY_WINDOW_DAYS = 30;

export async function leadDeliveryDigest(actor: Actor): Promise<LeadDeliveryDigest> {
  // Право то же, что у очереди: перечень сквозной по всем обращениям.
  ensure(actor, 'AUDIT_VIEW');
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const windowStart = new Date(Date.now() - LEAD_DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Причина «канал не настроен» ставится обоими отправителями до обращения
  // к сети — это не отказ по существу, и считается она отдельно.
  const broken = { ok: false, createdAt: { gte: windowStart }, NOT: { error: CHANNEL_OFF } };

  const [leadsLastDay, deliveredLastDay, lastOk, failed, channelOff, failures] = await Promise.all([
    // Сравнимо с доставками: машинным заявкам доставка не запускается, а
    // обращения из кабинета идут через очередь, не через `Delivery`.
    // Прежде они входили в счёт, и расхождение выглядело отказом канала
    // (решение Р-245).
    prisma.lead.count({
      where: { createdAt: { gte: dayAgo }, status: { not: 'SPAM' }, source: { not: 'cabinet' } },
    }),
    prisma.delivery.count({ where: { ok: true, createdAt: { gte: dayAgo } } }),
    prisma.delivery.findFirst({
      where: { ok: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.delivery.count({ where: broken }),
    prisma.delivery.count({ where: { ok: false, createdAt: { gte: windowStart }, error: CHANNEL_OFF } }),
    prisma.delivery.findMany({
      where: broken,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        channel: true,
        error: true,
        createdAt: true,
        lead: { select: { id: true, source: true, topic: true, createdAt: true } },
      },
    }),
  ]);

  return {
    leadsLastDay,
    deliveredLastDay,
    lastOkAt: lastOk?.createdAt ?? null,
    failed,
    channelOff,
    failures: failures.map((row) => ({
      id: row.id,
      channel: row.channel,
      error: row.error,
      createdAt: row.createdAt,
      leadId: row.lead.id,
      leadSource: row.lead.source,
      leadTopic: row.lead.topic,
      leadCreatedAt: row.lead.createdAt,
    })),
  };
}

/** Пауза между повторами одного письма отказа (требование М-19, Р-307). */
export const LEAD_RETRY_PAUSE_MS = 10 * 60 * 1000;

/**
 * Отправить ещё раз письмо отказа по заявке — с её карточки (требование
 * М-19, решение Р-307).
 *
 * Прежде экран заявки советовал «повторить отправку на экране очереди
 * уведомлений», а очередь менеджеру закрыта. Повторяется только письмо
 * отказа, не доставленное после всех попыток (ОМ-6): доставленное и
 * ждущее остаются как есть, и служба возвращает `false`. Адрес рассылка
 * читает из заявки при отправке, поэтому исправленный в сведениях адрес
 * действует сразу. Один и тот же отказ повторяется не чаще раза в десять
 * минут: иначе кнопка становится способом слать письма на чужой ящик.
 */
export async function retryLeadLetter(actor: Actor, leadId: string, ip?: string | null): Promise<boolean> {
  ensure(actor, 'REQUEST_MODERATE');
  const scope = scopeLeads(actor);
  const lead =
    scope === null
      ? null
      : await prisma.lead.findFirst({
          where: { AND: [{ id: leadId }, scope] },
          select: { id: true, contactKind: true, contact: true },
        });
  if (lead === null) throw new Error('Заявка не найдена');
  const row = await prisma.notificationOutbox.findFirst({
    where: { leadId: lead.id, eventKind: 'LEAD_DECLINED', channel: 'EMAIL' },
    select: { id: true, state: true, projectId: true, eventKind: true },
  });
  if (row === null || row.state !== 'FAILED') return false;
  if (leadAddress(lead) === null) {
    throw new Error('В заявке нет адреса почты: исправьте адрес в сведениях заявки и отправьте ещё раз');
  }
  const recent = await prisma.auditEvent.findFirst({
    where: {
      action: 'OUTBOX_RETRY',
      objectType: 'NotificationOutbox',
      objectId: row.id,
      occurredAt: { gt: new Date(Date.now() - LEAD_RETRY_PAUSE_MS) },
    },
    select: { id: true },
  });
  if (recent !== null) {
    throw new Error('Письмо уже отправлено заново: повторить можно через десять минут');
  }
  // Захват по состоянию: второе нажатие в соседнем окне строку не тронет.
  const claimed = await prisma.notificationOutbox.updateMany({
    where: { id: row.id, state: 'FAILED' },
    data: { state: 'PENDING', failure: null, attempts: 0, lastError: null, scheduledAt: new Date() },
  });
  if (claimed.count === 0) return false;
  await record(actor, {
    action: 'OUTBOX_RETRY',
    objectType: 'NotificationOutbox',
    objectId: row.id,
    projectId: row.projectId,
    payload: { eventKind: row.eventKind, leadId: lead.id },
    ip,
  });
  return true;
}

/**
 * Вернуть отказавшую строку в очередь. Счётчик попыток обнуляется: причина
 * отказа обычно устраняется снаружи (адрес исправлен, ящик настроен), и
 * прежние пять попыток к новой отправке отношения не имеют.
 */
export async function retryFailed(actor: Actor, id: string, ip?: string | null): Promise<void> {
  ensure(actor, 'AUDIT_VIEW');
  const row = await prisma.notificationOutbox.findUnique({
    where: { id },
    select: { id: true, state: true, projectId: true, eventKind: true, createdAt: true },
  });
  if (row === null || row.state !== 'FAILED') return;
  // Напоминание о сроке, повторённое через неделю, сообщало бы «срок через
  // три дня» после срока (решение Р-246).
  if (isExpired(row, new Date())) {
    throw new Error('Напоминание о сроке старше суток не повторяется: срок уже другой');
  }

  await prisma.notificationOutbox.update({
    where: { id: row.id },
    data: { state: 'PENDING', failure: null, attempts: 0, lastError: null, scheduledAt: new Date() },
  });
  await record(actor, {
    action: 'OUTBOX_RETRY',
    objectType: 'NotificationOutbox',
    objectId: row.id,
    projectId: row.projectId,
    payload: { eventKind: row.eventKind },
    ip,
  });
}
