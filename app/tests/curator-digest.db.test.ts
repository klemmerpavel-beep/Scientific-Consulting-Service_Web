/**
 * Сводка писем куратору раз в день (улучшение УЭ-01, решение Р-398):
 * письмо о работе ждёт 09:00 по Москве, сводка собирает отложенные одним
 * письмом, они получают состояние «вошло в сводку»; приглашение и доступ —
 * сразу; без выбора куратора — как прежде.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'g'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('сводка куратору (УЭ-01)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const outbox = await import('../src/lib/cabinet/outbox.ts');
  const ids: Record<string, string> = {};

  before(async () => {
    const [digest, plain] = await Promise.all([
      prisma.user.create({
        data: { email: `cd-on-${stamp}@example.org`, fullName: 'Куратор Сводки', role: 'EXPERT', notifyEmail: true, dailyDigest: true },
      }),
      prisma.user.create({
        data: { email: `cd-off-${stamp}@example.org`, fullName: 'Куратор Сразу', role: 'EXPERT', notifyEmail: true },
      }),
    ]);
    Object.assign(ids, { digest: digest.id, plain: plain.id });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [ids.digest!, ids.plain!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.digest!, ids.plain!] } } });
  });

  it('время сводки — ближайшие 09:00 по Москве', () => {
    assert.equal(outbox.nextDigestAt(new Date('2026-10-05T05:00:00Z')).toISOString(), '2026-10-05T06:00:00.000Z');
    assert.equal(outbox.nextDigestAt(new Date('2026-10-05T06:00:00Z')).toISOString(), '2026-10-06T06:00:00.000Z');
    assert.equal(outbox.nextDigestAt(new Date('2026-10-04T22:30:00Z')).toISOString(), '2026-10-05T06:00:00.000Z');
  });

  it('письмо о работе ждёт сводки; доступ — сразу; без выбора — сразу', async () => {
    const item = (userId: string, key: string, eventKind: 'CURATOR_TURN' | 'NDA_SIGNED') => ({
      userId,
      eventKind,
      subject: `Ход за вами ${key}`,
      body: 'Этап запущен.',
      dedupKey: `cd:${key}:${stamp}`,
    });
    await outbox.enqueue(prisma, item(ids.digest!, 'a', 'CURATOR_TURN'));
    await outbox.enqueue(prisma, item(ids.digest!, 'b', 'CURATOR_TURN'));
    await outbox.enqueue(prisma, item(ids.digest!, 'nda', 'NDA_SIGNED'));
    await outbox.enqueue(prisma, item(ids.plain!, 'c', 'CURATOR_TURN'));
    const rows = await prisma.notificationOutbox.findMany({ where: { userId: { in: [ids.digest!, ids.plain!] } } });
    const now = Date.now();
    const held = rows.filter((row) => row.userId === ids.digest && row.eventKind === 'CURATOR_TURN');
    assert.equal(held.length, 2);
    assert.ok(held.every((row) => row.scheduledAt.getTime() > now), 'письмо куратора со сводкой не отложено');
    assert.ok(rows.find((row) => row.eventKind === 'NDA_SIGNED')!.scheduledAt.getTime() <= now, 'доступ отложен');
    assert.ok(rows.find((row) => row.userId === ids.plain)!.scheduledAt.getTime() <= now, 'без выбора отложено');
  });

  it('в 09:00 — одна сводка, отложенные «вошли в сводку»; повторный прогон второй не ставит', async () => {
    const at = outbox.nextDigestAt(new Date());
    assert.equal(await outbox.enqueueCuratorDigest(at), 1);
    assert.equal(await outbox.enqueueCuratorDigest(at), 0);
    const digest = await prisma.notificationOutbox.findMany({ where: { userId: ids.digest, eventKind: 'CURATOR_DIGEST' } });
    assert.equal(digest.length, 1);
    assert.match(digest[0]!.subject, /2 события/u);
    assert.match(digest[0]!.body, /Ход за вами a[\s\S]*Ход за вами b/u);
    const merged = await prisma.notificationOutbox.count({ where: { userId: ids.digest, eventKind: 'CURATOR_TURN', state: 'MERGED' } });
    assert.equal(merged, 2);
  });

  it('строка, ставшая к отправке после сводки, уходит второй сводкой, а не пропадает (Р-436)', async () => {
    const at = outbox.nextDigestAt(new Date());
    // Повтор неудачной строки после утренней сводки: она снова ждёт отправки.
    const late = await prisma.notificationOutbox.create({
      data: {
        userId: ids.digest!,
        channel: 'EMAIL',
        eventKind: 'CURATOR_TURN',
        subject: 'Ход за вами поздний',
        body: 'Этап запущен.',
        dedupKey: `cd:late:${stamp}:email`,
        scheduledAt: at,
      },
    });
    assert.equal(await outbox.enqueueCuratorDigest(at), 1, 'поздняя строка не попала ни в одну сводку');
    const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: late.id } });
    assert.equal(row.state, 'MERGED');
    const digests = await prisma.notificationOutbox.findMany({
      where: { userId: ids.digest, eventKind: 'CURATOR_DIGEST' },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(digests.length, 2);
    assert.match(digests[1]!.body, /Ход за вами поздний/u);
    assert.equal(await outbox.enqueueCuratorDigest(at), 0, 'повторный прогон поставил третью сводку');
  });
});
