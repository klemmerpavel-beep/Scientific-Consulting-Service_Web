/**
 * Судьба уведомления для строки исхода (решение Р-725): строка после
 * переноса срока и после заведения работы не обещает письма, которого не
 * будет (Р-163, Р-267). Берутся строки очереди человека по событию и
 * началу ключа, поставленные в окне исхода (час); почта без SMTP и
 * Telegram без бота не в счёт. Признак `?done=due` подтверждается свежим
 * событием переноса срока именно этого этапа на нынешний срок.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('судьба уведомления для строки исхода', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { enqueue, noticeFate } = await import('../src/lib/cabinet/outbox.ts');

  const stamp = Date.now();
  let userId = '';
  let quietId = '';
  const saved = {
    host: process.env.SMTP_HOST,
    from: process.env.SMTP_FROM,
    user: process.env.SMTP_USER,
    bot: process.env.TELEGRAM_BOT_TOKEN,
  };
  let botId = '';

  before(async () => {
    const user = await prisma.user.create({
      data: { email: `fate-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT', notifyEmail: true },
    });
    userId = user.id;
    const quiet = await prisma.user.create({
      data: { email: `fate-q-${stamp}@example.org`, fullName: 'Без уведомлений', role: 'CLIENT', notifyEmail: false },
    });
    quietId = quiet.id;
    // Только Telegram: почта выключена, чат привязан.
    const bot = await prisma.user.create({
      data: {
        email: `fate-t-${stamp}@example.org`,
        fullName: 'Только Telegram',
        role: 'MANAGER',
        notifyEmail: false,
        notifyTelegram: true,
        telegramChatId: `${stamp}`,
      },
    });
    botId = bot.id;
    for (const id of [userId, quietId, botId]) {
      await enqueue(prisma, {
        userId: id,
        eventKind: 'STAGE_DUE_CHANGED',
        subject: 'Срок этапа изменён',
        body: 'Новый срок — 20 октября 2026.',
        dedupKey: `stage:s-${stamp}:due-changed:2026-10-20:${Date.now()}`,
      });
    }
  });

  after(async () => {
    for (const [key, value] of Object.entries({
      SMTP_HOST: saved.host,
      SMTP_FROM: saved.from,
      SMTP_USER: saved.user,
      TELEGRAM_BOT_TOKEN: saved.bot,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [userId, quietId, botId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, quietId, botId] } } });
  });

  const prefix = `stage:s-${stamp}:due-changed:2026-10-20:`;

  it('почта не настроена — «не уйдёт», а не «получит»', async () => {
    delete process.env.SMTP_HOST;
    assert.equal(await noticeFate(userId, 'STAGE_DUE_CHANGED', prefix), 'mail-off');
  });

  it('почта настроена — письмо уйдёт', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_FROM = 'noreply@example.org';
    assert.equal(await noticeFate(userId, 'STAGE_DUE_CHANGED', prefix), 'email');
  });

  it('уведомление не положено или выключено — его нет', async () => {
    assert.equal(await noticeFate(quietId, 'STAGE_DUE_CHANGED', prefix), 'none');
    assert.equal(await noticeFate(userId, 'STAGE_DUE_CHANGED', `stage:s-${stamp}:due-changed:2026-11-01:`), 'none');
    assert.equal(await noticeFate(null, 'STAGE_DUE_CHANGED', prefix), 'none');
  });

  it('только Telegram, бот не настроен — «бот не настроен», а не «выключены»', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal(await noticeFate(botId, 'STAGE_DUE_CHANGED', prefix), 'telegram-off');
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    assert.equal(await noticeFate(botId, 'STAGE_DUE_CHANGED', prefix), 'telegram');
  });

  it('строка очереди старше окна исхода о нынешнем действии не говорит', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_FROM = 'noreply@example.org';
    // Через два часа те же строки — уже не исход этого действия.
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    assert.equal(await noticeFate(userId, 'STAGE_DUE_CHANGED', prefix, later), 'none');
    assert.equal(await noticeFate(userId, 'STAGE_DUE_CHANGED', prefix, new Date()), 'email');
  });
});

describe('подтверждение признака «срок перенесён»', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { rescheduleStage } = await import('../src/lib/cabinet/projects.ts');
  const { dueMovedJustNow } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const actor = (id: string) =>
    ({ id, role: 'MANAGER', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null }) as const;

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `due-m-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const other = await prisma.user.create({
      data: { email: `due-o-${stamp}@example.org`, fullName: 'Другой', role: 'MANAGER' },
    });
    const type = await prisma.serviceType.create({ data: { code: `due-${stamp}`, name: 'Перенос срока' } });
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Клиент', normalizedName: `due клиент ${stamp}` },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-DUE-${String(stamp).slice(-6)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа',
        managerId: manager.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 1', state: 'IN_PROGRESS', dueOn: new Date('2026-11-01T00:00:00Z') },
    });
    const twin = await prisma.stage.create({
      data: { projectId: project.id, position: 2, title: 'Глава 2', state: 'NOT_STARTED', dueOn: new Date('2026-11-20T00:00:00Z') },
    });
    Object.assign(ids, {
      manager: manager.id,
      other: other.id,
      type: type.id,
      client: client.id,
      project: project.id,
      stage: stage.id,
      twin: twin.id,
    });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.manager!, ids.other!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.other!] } } });
    await prisma.$disconnect();
  });

  const stageOf = (id: string) =>
    prisma.stage.findUniqueOrThrow({ where: { id }, select: { id: true, projectId: true, dueOn: true } });

  it('подделанный признак без переноса строки не даёт', async () => {
    assert.equal(await dueMovedJustNow(actor(ids.manager!), await stageOf(ids.stage!)), false);
  });

  it('перенос этим человеком на нынешний срок — подтверждён, и только в окне', async () => {
    await rescheduleStage(actor(ids.manager!), {
      stageId: ids.stage!,
      dueOn: new Date('2026-11-15T00:00:00Z'),
      reason: 'Ждём рецензента',
    });
    const stage = await stageOf(ids.stage!);
    assert.equal(await dueMovedJustNow(actor(ids.manager!), stage), true);
    // Другой сотрудник — не его действие; через два часа — уже не исход.
    assert.equal(await dueMovedJustNow(actor(ids.other!), stage), false);
    assert.equal(await dueMovedJustNow(actor(ids.manager!), stage, new Date(Date.now() + 2 * 60 * 60 * 1000)), false);
    // Соседний этап той же работы переноса не получал.
    assert.equal(await dueMovedJustNow(actor(ids.manager!), await stageOf(ids.twin!)), false);
  });

  it('срок изменён после переноса другим путём — событие о прежнем сроке не подтверждает', async () => {
    await prisma.stage.update({ where: { id: ids.stage! }, data: { dueOn: new Date('2026-12-01T00:00:00Z') } });
    assert.equal(await dueMovedJustNow(actor(ids.manager!), await stageOf(ids.stage!)), false);
  });
});
