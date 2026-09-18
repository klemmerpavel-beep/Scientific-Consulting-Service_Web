/**
 * Очередь уведомлений на настоящей базе: постановка в одной транзакции с
 * изменением, идемпотентность по ключу, повтор с отступом и отказ после
 * исчерпания попыток.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('очередь уведомлений', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { CHANNEL_OFF, dispatch, enqueue, outboxDigest, retryFailed } = await import(
    '../src/lib/cabinet/outbox.ts'
  );
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const stamp = Date.now();
  let userId = '';
  let headId = '';
  let managerId = '';

  const staff = (id: string, role: 'MANAGER' | 'HEAD') => ({
    id,
    role,
    status: 'ACTIVE' as const,
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const user = await prisma.user.create({
      data: {
        email: `outbox-${stamp}@example.org`,
        fullName: 'Получатель',
        role: 'CLIENT',
        notifyEmail: true,
      },
    });
    userId = user.id;
    const boss = await prisma.user.create({
      data: { email: `outbox-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    headId = boss.id;
    const curator = await prisma.user.create({
      data: { email: `outbox-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    managerId = curator.id;
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId } });
    await prisma.auditEvent.deleteMany({ where: { actorId: headId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, headId, managerId] } } });
    await prisma.$disconnect();
  });

  const head = () => staff(headId, 'HEAD');
  const manager = () => staff(managerId, 'MANAGER');

  const item = (dedupKey: string) => ({
    userId,
    eventKind: 'STAGE_AWAITING_CLIENT' as const,
    subject: 'Этап ждёт ваших материалов',
    body: 'Проект PD-2026-001.',
    dedupKey,
  });

  it('событие порождает ровно одну запись на включённый канал', async () => {
    await enqueue(prisma, item(`t-${stamp}-1`));
    const rows = await prisma.notificationOutbox.findMany({ where: { userId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].channel, 'EMAIL');
    assert.equal(rows[0].state, 'PENDING');
  });

  it('повторная постановка с тем же ключом дубля не создаёт', async () => {
    await enqueue(prisma, item(`t-${stamp}-1`));
    await enqueue(prisma, item(`t-${stamp}-1`));
    assert.equal(await prisma.notificationOutbox.count({ where: { userId } }), 1);
  });

  it('выключенный канал записи не порождает', async () => {
    await prisma.user.update({ where: { id: userId }, data: { notifyEmail: false } });
    await enqueue(prisma, item(`t-${stamp}-2`));
    assert.equal(await prisma.notificationOutbox.count({ where: { userId } }), 1);
    await prisma.user.update({ where: { id: userId }, data: { notifyEmail: true } });
  });

  it('обезличенной учётной записи уведомления не ставятся', async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: 'ERASED' } });
    await enqueue(prisma, item(`t-${stamp}-3`));
    assert.equal(await prisma.notificationOutbox.count({ where: { userId } }), 1);
    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  it('ненастроенный канал не расходует попытки, а ждёт настройки', async () => {
    // Почта на стенде не настроена, поэтому отправка заведомо не проходит.
    // До решения Р-154 это выглядело как настоящий отказ, и очередь
    // перегорала до того, как ящик заводили.
    const report = await dispatch();
    assert.ok(report.taken >= 1);
    assert.equal(report.sent, 0);

    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } });
    assert.equal(row.state, 'PENDING', 'запись потеряна при отказе канала');
    assert.equal(row.attempts, 0, 'ненастроенный канал израсходовал попытку');
    assert.equal(row.lastError, CHANNEL_OFF);
    assert.ok(row.scheduledAt.getTime() > Date.now(), 'повтор не отложен');
  });

  it('настоящий отказ наращивает попытки и кончается пометкой неудачи', async () => {
    // Отказ без обращения в сеть: канал Telegram при снятой привязке.
    const row = await prisma.notificationOutbox.create({
      data: {
        userId,
        channel: 'TELEGRAM',
        eventKind: 'STAGE_AWAITING_CLIENT',
        subject: 'Этап ждёт ваших материалов',
        body: 'Проект PD-2026-001.',
        dedupKey: `t-${stamp}-tg`,
        scheduledAt: new Date(Date.now() - 1000),
      },
    });
    await dispatch();
    const once = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(once.state, 'PENDING');
    assert.equal(once.attempts, 1);
    assert.ok(once.lastError !== null && once.lastError !== CHANNEL_OFF);

    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { attempts: 4, scheduledAt: new Date(Date.now() - 1000) },
    });
    await dispatch();
    const done = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(done.state, 'FAILED');
    assert.equal(done.attempts, 5);
  });

  it('сводка очереди считает состояния и показывает отказ', async () => {
    const digest = await outboxDigest(head());
    assert.ok(digest.failed >= 1, 'отказ не попал в счётчик');
    assert.ok(digest.waitingChannel >= 1, 'ждущие настройки канала не сочтены');
    const mine = digest.failures.find((row) => row.recipient === 'Получатель');
    assert.ok(mine !== undefined, 'отказавшая строка не попала в перечень');
    assert.equal(mine.channel, 'TELEGRAM');
    assert.equal(mine.attempts, 5);
  });

  it('повтор возвращает отказавшую строку в очередь', async () => {
    const failed = await prisma.notificationOutbox.findFirstOrThrow({
      where: { userId, state: 'FAILED' },
    });
    await retryFailed(head(), failed.id);
    const back = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(back.state, 'PENDING');
    assert.equal(back.attempts, 0);
    assert.equal(back.lastError, null);
  });

  it('менеджеру состояние очереди и повтор недоступны', async () => {
    await assert.rejects(() => outboxDigest(manager()), AccessDenied);
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } });
    await assert.rejects(() => retryFailed(manager(), row.id), AccessDenied);
  });
});
