/**
 * Письмо «Заявка получена» на настоящей базе (требование Т-05, решение
 * Р-312): заявке с почтой — письмо на адрес заявки; телефону, отзыву и
 * машинной заявке — нет; на один адрес — не больше письма в сутки; строка
 * годна сутки.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('письмо «Заявка получена»', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { enqueueLeadReceived, lifetimeMs } = await import('../src/lib/cabinet/outbox.ts');

  const leadIds: string[] = [];
  const lead = async (data: Record<string, unknown>) => {
    const row = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact: `lr-${stamp}@example.org`,
        name: 'Заявитель',
        consentGiven: true,
        consentVersion: 'test',
        ...data,
      } as never,
    });
    leadIds.push(row.id);
    return row.id;
  };

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.user.deleteMany({ where: { email: `lr-head-${stamp}@example.org` } });
  });

  it('заявке с почтой — письмо на адрес заявки, без ссылки входа', async () => {
    const id = await lead({});
    assert.equal(await enqueueLeadReceived(id), true);
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { leadId: id, eventKind: 'LEAD_RECEIVED' } });
    assert.equal(row.userId, null, 'письмо ушло учётной записи, а не заявке');
    assert.equal(row.dedupKey, `lead:${id}:received:email`);
    assert.doesNotMatch(row.body, /\/cabinet\/enter\//u);
    assert.equal(lifetimeMs('LEAD_RECEIVED'), 24 * 60 * 60 * 1000);
  });

  it('повтор на тот же адрес за сутки — письма нет', async () => {
    const again = await lead({ contact: `LR-${stamp}@Example.org` });
    assert.equal(await enqueueLeadReceived(again), false);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId: again } }), 0);
  });

  it('тот же ящик с плюс-меткой за сутки — письма нет (Р-428)', async () => {
    for (const tag of ['2', 'promo']) {
      const tagged = await lead({ contact: `lr-${stamp}+${tag}@example.org` });
      assert.equal(await enqueueLeadReceived(tagged), false, `+${tag}`);
    }
  });

  it('за час — не больше общего потолка писем на все адреса (Р-428)', async () => {
    const { LEAD_RECEIVED_PER_HOUR } = await import('../src/lib/cabinet/outbox.ts');
    const filler = await lead({ contact: `lr-filler-${stamp}@example.org` });
    const existing = await prisma.notificationOutbox.count({
      where: { eventKind: 'LEAD_RECEIVED', createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    const missing = Math.max(0, LEAD_RECEIVED_PER_HOUR - existing);
    await prisma.notificationOutbox.createMany({
      data: Array.from({ length: missing }, (_, i) => ({
        leadId: filler,
        channel: 'EMAIL' as const,
        eventKind: 'LEAD_RECEIVED',
        subject: 'Заявка получена',
        body: '—',
        dedupKey: `lr-cap-${stamp}-${i}`,
      })),
    });
    const fresh = await lead({ contact: `lr-fresh-${stamp}@example.org` });
    assert.equal(await enqueueLeadReceived(fresh), false, 'потолок в час не сработал');
  });

  it('повтор письма старше суток отклоняется с причиной про само письмо, не про срок (Р-664)', async () => {
    const { retryFailed } = await import('../src/lib/cabinet/outbox.ts');
    const boss = await prisma.user.create({
      data: { email: `lr-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const head = {
      id: boss.id,
      role: 'HEAD' as const,
      status: 'ACTIVE' as const,
      clientProfileId: null,
      expertNdaSignedAt: null,
    };
    // Письмо отвергнуто почтовым сервером, повтор нажат через двое суток.
    const id = await lead({ contact: `lr-stale-${stamp}@example.org` });
    const row = await prisma.notificationOutbox.create({
      data: {
        leadId: id,
        channel: 'EMAIL',
        eventKind: 'LEAD_RECEIVED',
        subject: 'Заявка получена',
        body: '—',
        dedupKey: `lr-stale-${stamp}`,
        state: 'FAILED',
        failure: 'DELIVERY',
        attempts: 1,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await assert.rejects(() => retryFailed(head, row.id), /Заявка получена/u);
    const kept = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(kept.state, 'FAILED', 'устаревшее письмо вернулось в очередь');
  });

  it('телефону, отзыву и машинной заявке — письма нет', async () => {
    const phone = await lead({ contactKind: 'phone', contact: '+7 900 000-00-00' });
    const review = await lead({ form: 'review', contact: `lr-review-${stamp}@example.org` });
    const spam = await lead({ status: 'SPAM', contact: `lr-spam-${stamp}@example.org` });
    for (const id of [phone, review, spam]) {
      assert.equal(await enqueueLeadReceived(id), false);
      assert.equal(await prisma.notificationOutbox.count({ where: { leadId: id } }), 0);
    }
  });
});
