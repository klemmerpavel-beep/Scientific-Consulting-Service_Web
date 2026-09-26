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
        // Канал Telegram включён, а привязки нет: так выглядит снятый чат, на
        // котором проверяется отказ без обращения в сеть. С выключенным
        // каналом строка отсекается ещё до отправки (решение Р-246).
        notifyTelegram: true,
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
    // Предел берётся с запасом: очередь на стенде общая, и при двадцати
    // строках за раз своя могла не попасть в пачку — проверка падала от
    // соседнего набора, а не от разладки канала (решение Р-191).
    // Своя строка ставится первой: иначе при полутысяче накопившихся
    // строк прошлых прогонов она могла не попасть в пачку.
    await prisma.notificationOutbox.updateMany({ where: { userId }, data: { scheduledAt: new Date(0) } });
    const report = await dispatch(500);
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

  it('два наложившихся прогона не берут одну строку дважды', async () => {
    // Прежде порция выбиралась простым чтением, и прогон, наложившийся на
    // медленный предыдущий, отправлял те же письма ещё раз (решение Р-235).
    for (let i = 0; i < 6; i += 1) {
      await prisma.notificationOutbox.create({
        data: {
          userId,
          channel: 'TELEGRAM',
          eventKind: 'STAGE_AWAITING_CLIENT',
          subject: 'Этап ждёт ваших материалов',
          body: 'Проект PD-2026-001.',
          dedupKey: `t-${stamp}-race-${i}`,
          scheduledAt: new Date(Date.now() - 1000),
        },
      });
    }
    const due = await prisma.notificationOutbox.count({
      where: { state: 'PENDING', scheduledAt: { lte: new Date() } },
    });
    // Предел с запасом: очередь стенда общая и копит строки прошлых прогонов.
    const [a, b] = await Promise.all([dispatch(5000), dispatch(5000)]);
    assert.equal(a.taken + b.taken, due, 'одна строка досталась обоим прогонам');
    const rows = await prisma.notificationOutbox.findMany({
      where: { dedupKey: { startsWith: `t-${stamp}-race-` } },
    });
    for (const row of rows) assert.equal(row.attempts, 1);
  });

  it('о сроке этапа приостановленной работы не напоминается', async () => {
    const { enqueueDeadlineReminders } = await import('../src/lib/cabinet/outbox.ts');
    const type = await prisma.serviceType.upsert({
      where: { code: 'dissertation' },
      create: { code: 'dissertation', name: 'Диссертация' },
      update: {},
    });
    const client = await prisma.clientProfile.create({
      data: { userId, fullName: 'Получатель', normalizedName: `outbox-${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-OBX-${String(stamp).slice(-6)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа',
        managerId,
        status: 'PAUSED',
      },
    });
    const stage = await prisma.stage.create({
      data: {
        projectId: project.id,
        position: 1,
        title: 'Глава',
        state: 'IN_PROGRESS',
        dueOn: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    try {
      await enqueueDeadlineReminders();
      const paused = await prisma.notificationOutbox.count({
        where: { dedupKey: { startsWith: `stage:${stage.id}:` } },
      });
      assert.equal(paused, 0, 'приостановленная работа напомнила о сроке');

      await prisma.project.update({ where: { id: project.id }, data: { status: 'ACTIVE' } });
      await enqueueDeadlineReminders();
      const active = await prisma.notificationOutbox.count({
        where: { dedupKey: { startsWith: `stage:${stage.id}:` } },
      });
      assert.ok(active >= 1, 'действующая работа о сроке не напомнила');
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { projectId: project.id } });
      await prisma.stage.delete({ where: { id: stage.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.clientProfile.delete({ where: { id: client.id } });
    }
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

/**
 * Доставка заявок с сайта: перечень показывает отказы по существу, отделяет
 * их от незаданного канала и не выносит наружу контакт заявителя.
 */
describe('доставка заявок с сайта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { CHANNEL_OFF, leadDeliveryDigest } = await import('../src/lib/cabinet/outbox.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const stamp = Date.now();
  let leadId = '';

  const person = (role: 'MANAGER' | 'HEAD') => ({
    id: `delivery-${role}-${stamp}`,
    role,
    status: 'ACTIVE' as const,
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const lead = await prisma.lead.create({
      data: {
        source: 'business',
        form: 'request',
        contactKind: 'email',
        contact: `delivery-${stamp}@example.org`,
        name: 'Заявитель',
        topic: `Проверка доставки ${stamp}`,
        consentGiven: true,
        consentVersion: 'test',
      },
    });
    leadId = lead.id;
    await prisma.delivery.createMany({
      data: [
        { leadId, channel: 'telegram', ok: false, error: 'HTTP 502 от api.telegram.org' },
        { leadId, channel: 'email', ok: false, error: CHANNEL_OFF },
        { leadId, channel: 'email', ok: true, error: null },
      ],
    });
  });

  after(async () => {
    await prisma.delivery.deleteMany({ where: { leadId } });
    await prisma.lead.deleteMany({ where: { id: leadId } });
    await prisma.$disconnect();
  });

  it('отказ по существу виден, незаданный канал сочтён отдельно', async () => {
    const digest = await leadDeliveryDigest(person('HEAD'));
    assert.ok(digest.failed >= 1, 'отказ не сочтён');
    assert.ok(digest.channelOff >= 1, 'незаданный канал не сочтён');
    assert.ok(digest.deliveredLastDay >= 1, 'удачная доставка не сочтена');
    assert.ok(digest.lastOkAt !== null, 'время последней доставки не найдено');

    const mine = digest.failures.find((row) => row.leadId === leadId);
    assert.ok(mine !== undefined, 'отказавшая строка не попала в перечень');
    assert.equal(mine.channel, 'telegram');
    assert.equal(mine.leadSource, 'business');
    assert.equal(mine.leadTopic, `Проверка доставки ${stamp}`);
    // Незаданный канал в перечень отказов не попадает: чинить нечего.
    assert.ok(
      digest.failures.every((row) => row.error !== CHANNEL_OFF),
      'строка «канал не настроен» попала в отказы',
    );
  });

  it('контакт заявителя в перечень не выносится', async () => {
    const digest = await leadDeliveryDigest(person('HEAD'));
    const text = JSON.stringify(digest);
    assert.ok(!text.includes(`delivery-${stamp}@example.org`), 'адрес заявителя виден в перечне');
    assert.ok(!text.includes('Заявитель'), 'имя заявителя видно в перечне');
  });

  it('менеджеру перечень доставок недоступен', async () => {
    await assert.rejects(() => leadDeliveryDigest(person('MANAGER')), AccessDenied);
  });
});
