import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../db.ts';
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
  | 'REQUEST_CREATED';

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

export interface DispatchReport {
  readonly taken: number;
  readonly sent: number;
  readonly failed: number;
}

async function sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'канал не настроен' };
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
