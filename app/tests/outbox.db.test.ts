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
  const { dispatch, enqueue } = await import('../src/lib/cabinet/outbox.ts');

  const stamp = Date.now();
  let userId = '';

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
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

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

  it('отказ канала не теряет запись, а откладывает её', async () => {
    // Почта на стенде не настроена, поэтому отправка заведомо не проходит:
    // это и есть проверяемый случай.
    const report = await dispatch();
    assert.ok(report.taken >= 1);
    assert.equal(report.sent, 0);

    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } });
    assert.equal(row.state, 'PENDING', 'запись потеряна при отказе канала');
    assert.equal(row.attempts, 1);
    assert.ok(row.lastError !== null, 'причина отказа не сохранена');
    assert.ok(row.scheduledAt.getTime() > Date.now(), 'повтор не отложен');
  });

  it('после исчерпания попыток запись помечается неудачной', async () => {
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } });
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { attempts: 4, scheduledAt: new Date(Date.now() - 1000) },
    });
    await dispatch();
    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.state, 'FAILED');
    assert.equal(after.attempts, 5);
  });
});
