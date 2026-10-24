/**
 * Сохранение правил «Какое событие каким каналом» без привязанного
 * Telegram не трогает сохранённые правила Telegram (решение Р-736).
 *
 * Пока чат не привязан, флажки столбца Telegram неактивны, а неактивный
 * флажок форма не присылает: `saveNotifyRules` читает его отсутствие как
 * «выключено». Прежде `saveRules` стирал все правила и записывал Telegram
 * выключенным по каждому событию — после привязки чата в Telegram не
 * приходило ничего. Привязка проверяется по базе, а не по виду формы.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('правила Telegram без привязанного чата не перезаписываются (Р-736)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');

  const ids: Record<string, string> = {};
  const curator = (): Actor => ({ id: ids.curator!, role: 'EXPERT', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });

  /** Состояние решётки, как его присылает форма: снятая и неактивная клетки — «выключено». */
  const grid = (sent: Record<string, boolean>) =>
    channels.rulesFor('EXPERT').flatMap((event) =>
      (['EMAIL', 'TELEGRAM'] as const).map((channel) => ({
        eventKind: event.kind,
        channel,
        enabled: sent[`${event.kind}:${channel}`] ?? false,
      })),
    );
  const emailOn = (off: readonly string[]) =>
    Object.fromEntries(channels.rulesFor('EXPERT').map((event) => [`${event.kind}:EMAIL`, !off.includes(event.kind)]));
  const stored = async (channel: 'EMAIL' | 'TELEGRAM') =>
    (
      await prisma.notifyRule.findMany({
        where: { userId: ids.curator, channel },
        select: { eventKind: true, enabled: true },
        orderBy: { eventKind: 'asc' },
      })
    ).map((rule) => `${rule.eventKind}:${rule.enabled ? 'on' : 'off'}`);

  before(async () => {
    const user = await prisma.user.create({
      data: { email: `nr-cur-${stamp}@example.org`, fullName: 'Куратор Правил', role: 'EXPERT', status: 'SUSPENDED' },
    });
    ids.curator = user.id;
  });

  after(async () => {
    await prisma.notifyRule.deleteMany({ where: { userId: ids.curator } });
    await prisma.auditEvent.deleteMany({ where: { actorId: ids.curator } });
    await prisma.user.deleteMany({ where: { id: ids.curator } });
  });

  it('без чата и без прежних правил Telegram не записывается выключенным', async () => {
    await channels.saveRules(curator(), grid(emailOn(['CURATOR_TURN'])));
    assert.deepEqual(await stored('TELEGRAM'), [], 'правила Telegram записаны выключенными');
    const email = await stored('EMAIL');
    assert.equal(email.length, channels.rulesFor('EXPERT').length);
    assert.ok(email.includes('CURATOR_TURN:off'));
    assert.ok(email.includes('DEADLINE_MISSED:on'));
  });

  it('без чата сохранённые правила Telegram остаются как были, почта перезаписывается', async () => {
    await prisma.notifyRule.createMany({
      data: [
        { userId: ids.curator!, eventKind: 'CURATOR_TURN', channel: 'TELEGRAM', enabled: true },
        { userId: ids.curator!, eventKind: 'PAYOUT_PAID', channel: 'TELEGRAM', enabled: false },
      ],
    });
    await channels.saveRules(curator(), grid(emailOn(['DEADLINE_MISSED'])));
    assert.deepEqual(await stored('TELEGRAM'), ['CURATOR_TURN:on', 'PAYOUT_PAID:off']);
    const email = await stored('EMAIL');
    assert.ok(email.includes('DEADLINE_MISSED:off'));
    assert.ok(email.includes('CURATOR_TURN:on'), 'почта не перезаписана');
  });

  it('с привязанным чатом сохраняются оба канала, как прежде', async () => {
    await prisma.user.update({ where: { id: ids.curator }, data: { telegramChatId: `nr-${stamp}` } });
    await channels.saveRules(curator(), grid({ ...emailOn([]), 'PAYOUT_PAID:TELEGRAM': true }));
    const telegram = await stored('TELEGRAM');
    assert.equal(telegram.length, channels.rulesFor('EXPERT').length);
    assert.ok(telegram.includes('PAYOUT_PAID:on'));
    assert.ok(telegram.includes('CURATOR_TURN:off'), 'снятая клетка Telegram не записана');
  });
});
