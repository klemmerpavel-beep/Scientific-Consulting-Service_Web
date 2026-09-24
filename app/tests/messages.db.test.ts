/**
 * Переписка «клиент — куратор» на настоящей базе (решение Р-183).
 *
 * Канал переписки не имел ни одной проверки, хотя держит два требования
 * разом: эксперт в него не входит вовсе — это технический барьер против
 * переманивания (Р-150), — и контакты в тексте помечаются, не блокируя
 * отправку (Р-130).
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('переписка по работе', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const actorOf = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `ms-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `ms-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const head = await prisma.user.create({
      data: { email: `ms-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const client = await prisma.user.create({
      data: { email: `ms-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `ms-type-${stamp}`, name: 'Сопровождение' },
    });
    const profile = await prisma.clientProfile.create({
      data: { fullName: `Заказчик ${stamp}`, normalizedName: `ms-client-${stamp}`, userId: client.id },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-MS-${stamp}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа с перепиской',
        managerId: manager.id,
        expertId: expert.id,
        status: 'ACTIVE',
      },
    });
    Object.assign(ids, {
      manager: manager.id,
      head: head.id,
      expert: expert.id,
      client: client.id,
      profile: profile.id,
      project: project.id,
      type: type.id,
    });
  });

  after(async () => {
    await prisma.message.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.manager!, ids.head!, ids.expert!, ids.client!] } },
    });
    await prisma.$disconnect();
  });

  const client = () => actorOf(ids.client!, 'CLIENT', { clientProfileId: ids.profile! });
  const manager = () => actorOf(ids.manager!, 'MANAGER');
  const expert = () => actorOf(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date() });

  it('клиент пишет куратору, куратор отвечает', async () => {
    await messages.sendMessage(client(), ids.project!, 'Когда ждать расчётную часть?');
    await messages.sendMessage(manager(), ids.project!, 'На следующей неделе.');
    const thread = await messages.listMessages(manager(), ids.project!);
    assert.equal(thread.length, 2);
    assert.deepEqual(
      thread.map((row) => row.body),
      ['Когда ждать расчётную часть?', 'На следующей неделе.'],
    );
  });

  it('эксперт в канал не входит ни на чтение, ни на запись', async () => {
    // Барьер против переманивания: эксперт высказывается замечаниями к
    // версиям, а не в переписке с клиентом (решение Р-150).
    await assert.rejects(() => messages.listMessages(expert(), ids.project!), AccessDenied);
    await assert.rejects(
      () => messages.sendMessage(expert(), ids.project!, 'Мой телефон для связи'),
      AccessDenied,
    );
  });

  it('пустое сообщение не отправляется', async () => {
    await assert.rejects(() => messages.sendMessage(client(), ids.project!, '   '), /Пустое/u);
  });

  it('контакт в тексте помечается, но отправку не блокирует', async () => {
    const sent = await messages.sendMessage(
      client(),
      ids.project!,
      'Пишите на почту client@example.org, так быстрее',
    );
    assert.equal(sent.containsContactHint, true);
    const flagged = await messages.flaggedMessages(manager());
    assert.ok(flagged.some((row) => row.id === sent.id), 'помеченное сообщение не попало в реестр');
    // Менеджер другой работы этого сообщения не видит: в нём контакт
    // чужого клиента (решение Р-220).
    const foreign = await messages.flaggedMessages(actorOf(`ms-other-${stamp}`, 'MANAGER'));
    assert.ok(!foreign.some((row) => row.id === sent.id), 'реестр показал сообщение чужой работы');
  });

  it('менеджер чужой работы не читает и не пишет в её канал', async () => {
    // Работа не видна ему ни в одном перечне, и действовать в ней по
    // прямому адресу он тоже не может (решение Р-220).
    const other = actorOf(`ms-other-${stamp}`, 'MANAGER');
    await assert.rejects(() => messages.listMessages(other, ids.project!), AccessDenied);
    await assert.rejects(() => messages.sendMessage(other, ids.project!, 'Здравствуйте'), AccessDenied);
    await assert.rejects(() => messages.markRead(other, ids.project!), AccessDenied);
  });

  it('непрочитанным считается написанное другой стороной', async () => {
    const before = await messages.unreadCount(manager(), ids.project!);
    await messages.sendMessage(client(), ids.project!, 'Ещё вопрос по срокам');
    const after = await messages.unreadCount(manager(), ids.project!);
    assert.equal(after, before + 1, 'сообщение клиента не увеличило непрочитанное у куратора');
    // Своё сообщение непрочитанным для себя не становится.
    await messages.sendMessage(manager(), ids.project!, 'Отвечаю');
    assert.equal(await messages.unreadCount(manager(), ids.project!), after);
  });

  it('пометка прочитанного обнуляет счётчик и не трогает чужой', async () => {
    await messages.markRead(manager(), ids.project!);
    assert.equal(await messages.unreadCount(manager(), ids.project!), 0);
    // У клиента остаётся непрочитанным то, что написал куратор.
    assert.ok((await messages.unreadCount(client(), ids.project!)) > 0);
  });

  it('руководитель, открывший чужую работу, не гасит новое у куратора', async () => {
    // Прежде отметку ставил любой читатель, кроме автора (решение Р-221).
    const head = actorOf(ids.head!, 'HEAD');
    await messages.sendMessage(client(), ids.project!, 'Вопрос куратору');
    const before = await messages.unreadCount(manager(), ids.project!);
    assert.ok(before > 0);
    await messages.markRead(head, ids.project!);
    assert.equal(await messages.unreadCount(manager(), ids.project!), before);
  });

  it('сообщение руководителя ново для клиента и не висит у куратора', async () => {
    const head = actorOf(ids.head!, 'HEAD');
    await messages.markRead(manager(), ids.project!);
    await messages.markRead(client(), ids.project!);
    await messages.sendMessage(head, ids.project!, 'Руководитель на связи');
    assert.equal(await messages.unreadCount(client(), ids.project!), 1, 'клиент не видит нового');
    assert.equal(await messages.unreadCount(manager(), ids.project!), 0, 'у куратора висит сообщение своей стороны');
  });

  it('куратор, открывший переписку, не гасит новое у клиента', async () => {
    await messages.sendMessage(manager(), ids.project!, 'Ответ куратора');
    const before = await messages.unreadCount(client(), ids.project!);
    await messages.markRead(manager(), ids.project!);
    assert.equal(await messages.unreadCount(client(), ids.project!), before);
    await messages.markRead(client(), ids.project!);
    assert.equal(await messages.unreadCount(client(), ids.project!), 0);
  });

  it('о новом сообщении второй стороне уходит сигнал, но не на каждую реплику', async () => {
    // Сигнал без текста: переписка во внешние каналы не уходит (решение
    // Р-228). Счёт ведётся по очереди уведомлений этой работы.
    const signals = (userId: string) =>
      prisma.notificationOutbox.count({
        where: { projectId: ids.project!, userId, eventKind: 'MESSAGE_RECEIVED' },
      });
    await prisma.user.updateMany({
      where: { id: { in: [ids.manager!, ids.client!] } },
      data: { notifyEmail: true },
    });
    await messages.markRead(manager(), ids.project!);
    await messages.markRead(client(), ids.project!);

    const before = await signals(ids.manager!);
    await messages.sendMessage(client(), ids.project!, 'Первый вопрос');
    assert.equal(await signals(ids.manager!), before + 1, 'куратор не получил сигнала');
    await messages.sendMessage(client(), ids.project!, 'И ещё уточнение');
    assert.equal(await signals(ids.manager!), before + 1, 'сигнал на каждую реплику');

    const toClient = await signals(ids.client!);
    await messages.sendMessage(manager(), ids.project!, 'Отвечаю на оба');
    assert.equal(await signals(ids.client!), toClient + 1, 'клиент не получил сигнала');

    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { projectId: ids.project!, userId: ids.client!, eventKind: 'MESSAGE_RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(!row.body.includes('Отвечаю на оба'), 'текст сообщения ушёл во внешний канал');
  });

  it('правило куратора отключает сигнал о сообщении', async () => {
    await prisma.notifyRule.create({
      data: { userId: ids.manager!, eventKind: 'MESSAGE_RECEIVED', channel: 'EMAIL', enabled: false },
    });
    await messages.markRead(manager(), ids.project!);
    const before = await prisma.notificationOutbox.count({
      where: { userId: ids.manager!, eventKind: 'MESSAGE_RECEIVED' },
    });
    await messages.sendMessage(client(), ids.project!, 'Вопрос после правила');
    const after = await prisma.notificationOutbox.count({
      where: { userId: ids.manager!, eventKind: 'MESSAGE_RECEIVED' },
    });
    assert.equal(after, before, 'правило не сработало');
    await prisma.notifyRule.deleteMany({ where: { userId: ids.manager! } });
  });

  it('входящие куратора называют работу', async () => {
    await messages.sendMessage(client(), ids.project!, 'Последний вопрос');
    const inbox = await messages.unreadInbox(manager());
    const mine = inbox.find((row) => row.code === `PD-MS-${stamp}`);
    assert.ok(mine !== undefined, 'работа не попала во входящие куратора');
    assert.equal(mine.title, 'Работа с перепиской');
    assert.ok(mine.count > 0);
  });
});
