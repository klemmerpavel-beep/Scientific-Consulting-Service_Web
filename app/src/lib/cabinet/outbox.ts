import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
import { ensure, type Actor } from './access.ts';
import { record } from './audit.ts';
import { sendMailTo } from './mail.ts';
import { escapeHtml } from './token.ts';

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

export type EventKind =
  | 'STAGE_AWAITING_CLIENT'
  | 'VERSION_UPLOADED'
  | 'EXPERT_COMMENT_PUBLISHED'
  | 'STAGE_IN_APPROVAL'
  | 'DEADLINE_IN_3_DAYS'
  | 'PAYMENT_STATUS_CHANGED'
  | 'REQUEST_CREATED'
  | 'PROJECT_OPENED';

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
}

/** Клиент Prisma или транзакция — уведомление ставится вместе с изменением. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Поставить уведомление во все каналы, включённые получателем. Роль здесь не
 * проверяется: адресата определяет вызывающий сценарий, который уже прошёл
 * через модуль прав.
 */
export async function enqueue(db: Db, item: OutboxItem): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: item.userId },
    select: { status: true, notifyEmail: true, notifyTelegram: true, telegramChatId: true },
  });
  if (user === null || user.status !== 'ACTIVE') return;

  const channels: ('EMAIL' | 'TELEGRAM')[] = [];
  if (user.notifyEmail) channels.push('EMAIL');
  if (user.notifyTelegram && user.telegramChatId !== null) channels.push('TELEGRAM');

  for (const channel of channels) {
    await db.notificationOutbox.createMany({
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
      },
      skipDuplicates: true,
    });
  }
}

/** Сколько раз пробуем доставить, прежде чем признать отправку неудачной. */
const MAX_ATTEMPTS = 5;

/**
 * Причина, которую отправители возвращают при незаданных настройках канала.
 * Она отличается от настоящего отказа по существу: чинить нечего, пока
 * ящик или бот не заведены, и попытки такой строке не наращиваются —
 * иначе очередь перегорит до первой же настоящей отправки.
 */
export const CHANNEL_OFF = 'канал не настроен';

/** Через сколько проверить строку, ждущую настройки канала. */
const CHANNEL_OFF_DELAY_MS = 60 * 60 * 1000;

export interface DispatchReport {
  readonly taken: number;
  readonly sent: number;
  readonly failed: number;
}

async function sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
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
    if (!res.ok) return { ok: false, error: `${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

function letter(subject: string, body: string): string {
  const paragraphs = body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 14px">${escapeHtml(line)}</p>`)
    .join('');
  return (
    `<div style="font:15px/1.6 'Helvetica Neue',Arial,sans-serif;color:#14161C">` +
    `<p style="margin:0 0 16px;font-size:17px;font-weight:600">${escapeHtml(subject)}</p>` +
    paragraphs +
    `<p style="margin:20px 0 0;color:#5C6474;font-size:13px">Письмо отправлено личным кабинетом ` +
    `ProDisser. Ход работы виден в кабинете.</p></div>`
  );
}

/**
 * Разослать накопившееся. Берём небольшими порциями: маршрут вызывается раз
 * в минуту, и длинная очередь разойдётся за несколько вызовов, не удерживая
 * запрос на минуты.
 */
export async function dispatch(limit = 20): Promise<DispatchReport> {
  const pending = await prisma.notificationOutbox.findMany({
    where: { state: 'PENDING', scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    include: { user: { select: { email: true, telegramChatId: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    const result =
      item.channel === 'EMAIL'
        ? await sendMailTo(item.user.email, item.subject, letter(item.subject, item.body), item.body)
        : item.user.telegramChatId === null
          ? { ok: false, error: 'привязка Telegram снята' }
          : await sendTelegram(item.user.telegramChatId, `${item.subject}\n\n${item.body}`);

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

    const attempts = item.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await prisma.notificationOutbox.update({
      where: { id: item.id },
      data: {
        state: giveUp ? 'FAILED' : 'PENDING',
        attempts,
        lastError: result.error ?? null,
        // Отступ растёт с числом попыток: временная недоступность почты не
        // должна выливаться в сотню обращений подряд.
        scheduledAt: giveUp ? item.scheduledAt : new Date(Date.now() + attempts * 5 * 60 * 1000),
      },
    });
    failed += 1;
  }

  return { taken: pending.length, sent, failed };
}

/**
 * Напоминания о приближающемся сроке. Выполняются той же командой, что и
 * рассылка: отдельного расписания для них заводить незачем, а ключ
 * дедупликации с датой не даёт напомнить дважды за сутки.
 */
export async function enqueueDeadlineReminders(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const stages = await prisma.stage.findMany({
    where: {
      state: { in: ['IN_PROGRESS', 'AWAITING_CLIENT', 'IN_APPROVAL'] },
      dueOn: { gte: now, lte: horizon },
    },
    include: {
      project: {
        select: { id: true, code: true, title: true, client: { select: { userId: true } } },
      },
    },
  });

  const today = now.toISOString().slice(0, 10);
  let queued = 0;
  for (const stage of stages) {
    const userId = stage.project.client.userId;
    if (userId === null) continue;
    await enqueue(prisma, {
      userId,
      projectId: stage.project.id,
      eventKind: 'DEADLINE_IN_3_DAYS',
      subject: `Срок этапа «${stage.title}» подходит`,
      body:
        `Проект ${stage.project.code} — ${stage.project.title}.\n` +
        `Этап «${stage.title}» должен быть закрыт до ${stage.dueOn?.toISOString().slice(0, 10)}.\n` +
        'Если от вас что-то требуется, это видно на главном экране кабинета.',
      dedupKey: `stage:${stage.id}:deadline:${today}`,
    });
    queued += 1;
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
  readonly projectCode: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly scheduledAt: Date;
}

export interface OutboxDigest {
  readonly pending: number;
  readonly sentLastDay: number;
  readonly failed: number;
  /** Ждут настройки канала: попытки им не наращиваются (см. `dispatch`). */
  readonly waitingChannel: number;
  readonly lastSentAt: Date | null;
  readonly failures: readonly OutboxFailure[];
}

export async function outboxDigest(actor: Actor): Promise<OutboxDigest> {
  // Очередь — служебная кухня практики: в ней видны адресаты по всем работам,
  // поэтому право то же, что у журналов.
  ensure(actor, 'AUDIT_VIEW');
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pending, sentLastDay, failed, waitingChannel, lastSent, failures] = await Promise.all([
    prisma.notificationOutbox.count({ where: { state: 'PENDING' } }),
    prisma.notificationOutbox.count({ where: { state: 'SENT', sentAt: { gte: dayAgo } } }),
    prisma.notificationOutbox.count({ where: { state: 'FAILED' } }),
    prisma.notificationOutbox.count({ where: { state: 'PENDING', lastError: CHANNEL_OFF } }),
    prisma.notificationOutbox.findFirst({
      where: { state: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    }),
    prisma.notificationOutbox.findMany({
      where: { state: 'FAILED' },
      orderBy: { scheduledAt: 'desc' },
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
        project: { select: { code: true } },
      },
    }),
  ]);

  return {
    pending,
    sentLastDay,
    failed,
    waitingChannel,
    lastSentAt: lastSent?.sentAt ?? null,
    failures: failures.map((row) => ({
      id: row.id,
      channel: row.channel,
      eventKind: row.eventKind,
      subject: row.subject,
      // Адрес получателя в служебный перечень не выносится: для разбора
      // достаточно имени, а адрес — персональные данные.
      recipient: row.user.fullName,
      projectCode: row.project?.code ?? null,
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
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
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

/**
 * Вернуть отказавшую строку в очередь. Счётчик попыток обнуляется: причина
 * отказа обычно устраняется снаружи (адрес исправлен, ящик настроен), и
 * прежние пять попыток к новой отправке отношения не имеют.
 */
export async function retryFailed(actor: Actor, id: string, ip?: string | null): Promise<void> {
  ensure(actor, 'AUDIT_VIEW');
  const row = await prisma.notificationOutbox.findUnique({
    where: { id },
    select: { id: true, state: true, projectId: true, eventKind: true },
  });
  if (row === null || row.state !== 'FAILED') return;

  await prisma.notificationOutbox.update({
    where: { id: row.id },
    data: { state: 'PENDING', attempts: 0, lastError: null, scheduledAt: new Date() },
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
