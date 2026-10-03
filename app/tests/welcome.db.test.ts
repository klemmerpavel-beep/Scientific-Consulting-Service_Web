/**
 * Блок первого входа (требование Т-10, решение Р-310): виден клиенту, пока
 * тот его не закрыл; закрытие запоминается для учётной записи и касается
 * только своей записи; сотрудникам блока нет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('блок первого входа', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { closeWelcome, welcomeState } = await import('../src/lib/cabinet/channels.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const [first, second, manager] = await Promise.all([
      prisma.user.create({ data: { email: `wl-a-${stamp}@example.org`, fullName: 'Первый клиент', role: 'CLIENT' } }),
      prisma.user.create({ data: { email: `wl-b-${stamp}@example.org`, fullName: 'Второй клиент', role: 'CLIENT' } }),
      prisma.user.create({ data: { email: `wl-m-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' } }),
    ]);
    Object.assign(ids, { first: first.id, second: second.id, manager: manager.id });
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ids.first!, ids.second!, ids.manager!] } } });
  });

  it('виден клиенту до закрытия; закрытие — навсегда и только своё', async () => {
    const first = who(ids.first!, 'CLIENT');
    assert.equal((await welcomeState(first)).open, true);
    await closeWelcome(first);
    assert.equal((await welcomeState(first)).open, false);
    await closeWelcome(first);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.first } });
    assert.ok(row.welcomeClosedAt !== null);
    assert.equal((await welcomeState(who(ids.second!, 'CLIENT'))).open, true, 'закрытие задело чужую запись');
  });

  it('сотруднику блока нет; без настроенного бота кнопки Telegram нет', async () => {
    assert.equal((await welcomeState(who(ids.manager!, 'MANAGER'))).open, false);
    const saved = process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_BOT_USERNAME;
    try {
      assert.equal((await welcomeState(who(ids.second!, 'CLIENT'))).telegram, false);
    } finally {
      if (saved !== undefined) process.env.TELEGRAM_BOT_USERNAME = saved;
    }
  });
});
