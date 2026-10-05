/**
 * Перечень своих уведомлений в «Настройках» (часть F, П-04, решение
 * Р-402): только свои строки очереди, новые сверху, не больше двадцати.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'e'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('перечень своих уведомлений (П-04)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const ids: Record<string, string> = {};
  const client = (): Actor => ({
    id: ids.client!,
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const [mine, other] = await Promise.all([
      prisma.user.create({ data: { email: `nl-cl-${stamp}@example.org`, fullName: 'Клиент Перечня', role: 'CLIENT' } }),
      prisma.user.create({ data: { email: `nl-ot-${stamp}@example.org`, fullName: 'Чужой Клиент', role: 'CLIENT' } }),
    ]);
    Object.assign(ids, { client: mine.id, other: other.id });
    const base = Date.UTC(2026, 9, 1, 6);
    await prisma.notificationOutbox.createMany({
      data: [
        ...Array.from({ length: 22 }, (_, index) => ({
          userId: mine.id,
          channel: 'EMAIL' as const,
          eventKind: 'STAGE_AWAITING_CLIENT',
          subject: `Своё ${index}`,
          body: 'текст письма',
          dedupKey: `nl:${stamp}:${index}`,
          state: 'SENT' as const,
          createdAt: new Date(base + index * 60_000),
          sentAt: new Date(base + index * 60_000 + 1000),
        })),
        {
          userId: other.id,
          channel: 'EMAIL' as const,
          eventKind: 'STAGE_AWAITING_CLIENT',
          subject: 'Чужое',
          body: 'текст письма',
          dedupKey: `nl:${stamp}:other`,
          state: 'SENT' as const,
          createdAt: new Date(base + 99 * 60_000),
        },
      ],
    });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [ids.client!, ids.other!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.client!, ids.other!] } } });
  });

  it('свои строки, новые сверху, двадцать последних, без текста письма', async () => {
    const rows = await channels.ownNotifications(client());
    assert.equal(rows.length, 20);
    assert.equal(rows[0]?.subject, 'Своё 21');
    assert.equal(rows[19]?.subject, 'Своё 2');
    assert.ok(rows.every((row) => row.subject !== 'Чужое'), 'в перечень попало чужое уведомление');
    assert.ok(rows.every((row) => !('body' in row)), 'перечень отдаёт текст письма');
  });
});
