/**
 * Перечень своих уведомлений в «Настройках» (часть F, П-04, решение
 * Р-402): что и когда отправлено, каким каналом и чем кончилось.
 *
 * Модуль без базы: строки отбирает `ownNotifications` в `channels.ts`,
 * здесь — только подписи, чтобы их можно было проверить без базы.
 */

export type NotifyState = 'PENDING' | 'SENT' | 'FAILED' | 'EXPIRED' | 'MERGED';
export type NotifyFailure = 'DELIVERY' | 'RECIPIENT_OFF' | 'NO_ADDRESS';

export interface NotifyLogRow {
  readonly id: string;
  readonly channel: 'EMAIL' | 'TELEGRAM';
  readonly subject: string;
  readonly state: NotifyState;
  readonly failure: NotifyFailure | null;
  readonly createdAt: Date;
  readonly scheduledAt: Date;
  readonly sentAt: Date | null;
}

/** Сколько последних уведомлений показывает перечень. */
export const NOTIFY_LOG_SIZE = 20;

export const NOTIFY_CHANNEL_LABEL: Record<NotifyLogRow['channel'], string> = {
  EMAIL: 'письмо',
  TELEGRAM: 'Telegram',
};

/** Отложенная строка: отправка назначена позже постановки (утренняя почта, сводка). */
function deferred(row: NotifyLogRow): boolean {
  return row.scheduledAt.getTime() - row.createdAt.getTime() > 60_000;
}

/** Чем кончилось уведомление — словами, без кодов очереди. */
export function notifyStatus(row: NotifyLogRow): string {
  switch (row.state) {
    case 'SENT':
      return 'отправлено';
    case 'PENDING':
      return deferred(row) ? 'отправка назначена' : 'в очереди на отправку';
    case 'MERGED':
      return 'вошло в утреннюю сводку';
    case 'EXPIRED':
      return 'не отправлено: событие устарело';
    case 'FAILED':
      if (row.failure === 'RECIPIENT_OFF') return 'не отправлено: канал отключён';
      if (row.failure === 'NO_ADDRESS') return 'не отправлено: нет адреса';
      return 'не доставлено';
  }
}

/** Какое время показывать: отправки, назначенной отправки или постановки. */
export function notifyMoment(row: NotifyLogRow): Date {
  if (row.state === 'SENT' && row.sentAt !== null) return row.sentAt;
  if (row.state === 'PENDING') return row.scheduledAt;
  return row.createdAt;
}
