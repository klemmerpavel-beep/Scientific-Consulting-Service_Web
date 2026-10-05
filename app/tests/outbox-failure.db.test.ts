/**
 * Сбой отправки и плашка ненастроенных каналов (требование РК-02, решение
 * Р-334): отказ почты после всех попыток даёт руководителю сигнал в
 * Telegram, один в сутки на канал; сбой самого сигнала нового не даёт;
 * отключённый получателем канал — неудача без сигнала и без дела; без
 * почты и бота — плашка.
 *
 * Отказ почты воспроизводится без сети: почтовый сервер указан на
 * закрытый порт своей машины. Строка проверки стоит первой в очереди, и
 * прогон берёт ровно одну строку.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'o'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const MAIL_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM', 'TELEGRAM_BOT_TOKEN'] as const;

describe('сбой отправки (РК-02)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const outbox = await import('../src/lib/cabinet/outbox.ts');

  const ids: Record<string, string> = {};
  const saved: Partial<Record<(typeof MAIL_ENV)[number], string | undefined>> = {};
  const signals = () =>
    prisma.notificationOutbox.findMany({ where: { userId: ids.head, eventKind: 'OUTBOX_FAILED' } });
  /** Строка, которая провалится на этом прогоне: последняя попытка, первая в очереди. */
  const failing = (userId: string, eventKind = 'STAGE_AWAITING_CLIENT', channel: 'EMAIL' | 'TELEGRAM' = 'EMAIL') =>
    prisma.notificationOutbox.create({
      data: {
        userId,
        channel,
        eventKind,
        subject: 'Проверка сбоя',
        body: '—',
        dedupKey: `of-${stamp}-${Math.random()}`,
        attempts: 4,
        scheduledAt: new Date(0),
      },
    });

  before(async () => {
    for (const key of MAIL_ENV) saved[key] = process.env[key];
    const [head, client, quiet] = await Promise.all([
      prisma.user.create({
        data: {
          email: `of-head-${stamp}@example.org`,
          fullName: 'Руководитель Сбоев',
          role: 'HEAD',
          notifyTelegram: true,
          telegramChatId: `of-${stamp}`,
        },
      }),
      prisma.user.create({ data: { email: `of-cl-${stamp}@example.org`, fullName: 'Клиент Сбоев', role: 'CLIENT' } }),
      prisma.user.create({
        data: { email: `of-q-${stamp}@example.org`, fullName: 'Без почты', role: 'CLIENT', notifyEmail: false },
      }),
    ]);
    Object.assign(ids, { head: head.id, client: client.id, quiet: quiet.id });
  });

  after(async () => {
    for (const key of MAIL_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    const users = [ids.head!, ids.client!, ids.quiet!];
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('без почты и бота — плашка; настроена почта — плашки нет', () => {
    for (const key of MAIL_ENV) delete process.env[key];
    assert.equal(outbox.notifyChannelsDown(), true);
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_FROM = 'ProDisser <noreply@example.org>';
    assert.equal(outbox.notifyChannelsDown(), false);
  });

  it('отказ почты — неудача доставки и сигнал руководителю в Telegram', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_FROM = 'ProDisser <noreply@example.org>';
    const row = await failing(ids.client!);
    await outbox.dispatch(1);
    const done = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(done.state, 'FAILED');
    assert.equal(done.failure, 'DELIVERY');
    const [signal, ...rest] = await signals();
    assert.equal(rest.length, 0);
    assert.equal(signal?.channel, 'TELEGRAM', 'сигнал о сбое почты ушёл почтой');
    assert.equal(signal?.path, '/cabinet/manage/outbox');
    assert.match(signal!.subject, /не доставлены: почта/u);
  });

  it('второй отказ почты в тот же день сигнала не добавляет', async () => {
    await failing(ids.client!);
    await outbox.dispatch(1);
    assert.equal((await signals()).length, 1);
  });

  it('сбой самого сигнала нового сигнала не даёт', async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head, eventKind: 'OUTBOX_FAILED' } });
    await failing(ids.client!, 'OUTBOX_FAILED');
    await outbox.dispatch(1);
    assert.equal((await signals()).length, 0);
  });

  it('отключённый получателем канал — неудача без сигнала и без дела', async () => {
    const row = await failing(ids.quiet!);
    await outbox.dispatch(1);
    const done = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(done.state, 'FAILED');
    assert.equal(done.failure, 'RECIPIENT_OFF');
    assert.equal((await signals()).length, 0);
    const before = await prisma.notificationOutbox.count({ where: { state: 'FAILED', failure: 'DELIVERY' } });
    const digest = await outbox.outboxDigest({
      id: ids.head!,
      role: 'HEAD',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: null,
    });
    assert.equal(digest.deliveryFailed, before, 'отказ получателя посчитан отказом доставки');
    assert.ok(digest.failed > digest.deliveryFailed);
  });
});
