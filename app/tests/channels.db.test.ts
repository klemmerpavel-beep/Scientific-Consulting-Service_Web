/**
 * Способы связи и правила уведомлений (решение Р-198).
 *
 * Пропускается без заданного адреса базы: запускается командой
 * `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('способы связи и правила уведомлений', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const { enqueue } = await import('../src/lib/cabinet/outbox.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const who = (id: string, role: 'CLIENT' | 'EXPERT' | 'MANAGER' | 'HEAD'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    // Служебные роли набора заводятся с закрытым доступом: иначе каждый
    // прогон растит общую очередь стенда уведомлениями о новых заявках.
    const head = await prisma.user.create({
      data: {
        email: `chan-head-${stamp}@example.org`,
        fullName: 'Руководитель',
        role: 'HEAD',
        status: 'SUSPENDED',
      },
    });
    const expert = await prisma.user.create({
      data: {
        email: `chan-expert-${stamp}@example.org`,
        fullName: 'Исполнитель',
        role: 'EXPERT',
        status: 'SUSPENDED',
      },
    });
    const client = await prisma.user.create({
      data: { email: `chan-client-${stamp}@example.org`, fullName: 'Заказчик', role: 'CLIENT' },
    });
    ids.head = head.id;
    ids.expert = expert.id;
    ids.client = client.id;
  });

  it('звонок без номера не заводится', async () => {
    await assert.rejects(
      () => channels.addContact(who(ids.client!, 'CLIENT'), { kind: 'PHONE_CALL', value: '  ' }),
      /номер/iu,
      'способ, которому нужен адрес, принят пустым',
    );
  });

  it('предпочтительный способ ровно один', async () => {
    const actor = who(ids.client!, 'CLIENT');
    await channels.addContact(actor, {
      kind: 'PHONE_CALL',
      value: '+7 900 000-00-00',
      preferred: true,
    });
    await channels.addContact(actor, { kind: 'EMAIL', preferred: true });

    const rows = await channels.ownContacts(actor);
    assert.equal(rows.filter((row) => row.preferred).length, 1, 'предпочтительных больше одного');
    assert.equal(rows[0]?.kind, 'EMAIL', 'предпочтение не перешло к последнему выбранному');
  });

  it('полное сопровождение не требует адреса', async () => {
    const actor = who(ids.client!, 'CLIENT');
    await channels.addContact(actor, { kind: 'FULL_SUPPORT' });
    const rows = await channels.ownContacts(actor);
    const support = rows.find((row) => row.kind === 'FULL_SUPPORT');
    assert.ok(support !== undefined, 'полное сопровождение не завелось');
    assert.equal(support?.value, null, 'у порядка работы откуда-то взялся адрес');
  });

  it('эксперту чужие способы связи недоступны', async () => {
    await assert.rejects(
      () => channels.contactsOf(who(ids.expert!, 'EXPERT'), ids.client!),
      AccessDenied,
      'эксперт получил телефон клиента',
    );
  });

  it('куратор видит способы связи клиента', async () => {
    const rows = await channels.contactsOf(who(ids.head!, 'HEAD'), ids.client!);
    assert.ok(rows.length >= 2, 'куратор не увидел ни одного способа связи');
  });

  it('правило по событию решает, каким каналом ставить уведомление', async () => {
    // Оба канала включены целиком, но правило запрещает письмо о сроке.
    await prisma.user.update({
      where: { id: ids.client! },
      data: { notifyEmail: true, notifyTelegram: true, telegramChatId: `chan-${stamp}` },
    });
    await channels.saveRules(who(ids.client!, 'CLIENT'), [
      { eventKind: 'DEADLINE_IN_3_DAYS', channel: 'EMAIL', enabled: false },
      { eventKind: 'DEADLINE_IN_3_DAYS', channel: 'TELEGRAM', enabled: true },
    ]);

    await enqueue(prisma, {
      userId: ids.client!,
      eventKind: 'DEADLINE_IN_3_DAYS',
      subject: 'Срок подходит',
      body: 'Ход работы виден в кабинете.',
      dedupKey: `chan-rule-${stamp}`,
    });

    const rows = await prisma.notificationOutbox.findMany({
      where: { userId: ids.client!, eventKind: 'DEADLINE_IN_3_DAYS' },
      select: { channel: true },
    });
    assert.deepEqual(
      rows.map((row) => row.channel).sort(),
      ['TELEGRAM'],
      'правило по событию не разобрало каналы',
    );
  });

  it('правило не включает канал, выключенный целиком', async () => {
    await prisma.user.update({
      where: { id: ids.client! },
      data: { notifyTelegram: false },
    });
    await enqueue(prisma, {
      userId: ids.client!,
      eventKind: 'DEADLINE_IN_3_DAYS',
      subject: 'Срок подходит',
      body: 'Ход работы виден в кабинете.',
      dedupKey: `chan-rule-off-${stamp}`,
    });
    const rows = await prisma.notificationOutbox.findMany({
      where: { userId: ids.client!, dedupKey: { startsWith: `chan-rule-off-${stamp}` } },
    });
    assert.equal(rows.length, 0, 'правило включило канал, выключенный целиком');
  });

  it('событие без правила уходит обычным порядком', async () => {
    await prisma.user.update({ where: { id: ids.client! }, data: { notifyEmail: true } });
    await enqueue(prisma, {
      userId: ids.client!,
      eventKind: 'STAGE_IN_APPROVAL',
      subject: 'Этап ждёт согласования',
      body: 'Ход работы виден в кабинете.',
      dedupKey: `chan-plain-${stamp}`,
    });
    const rows = await prisma.notificationOutbox.findMany({
      where: { userId: ids.client!, dedupKey: { startsWith: `chan-plain-${stamp}` } },
      select: { channel: true },
    });
    assert.deepEqual(
      rows.map((row) => row.channel),
      ['EMAIL'],
      'событие, о котором правил нет, не ушло почтой',
    );
  });
});
