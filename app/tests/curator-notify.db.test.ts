/**
 * Уведомления куратору на настоящей базе (требование Э-09, решение
 * Р-328): по каждому событию — строка почты и сигнала Telegram согласно
 * правилам; снятая строка правил не даёт строки очереди; сданный этап не
 * напоминает куратору о сроке; без договора поручения — только нейтральные
 * события, без названия работы; сумм, ФИО клиента и причин для клиента в
 * письмах нет.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'n'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-cn-'));

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('уведомления куратору (Э-09)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const { enqueueDeadlineReminders } = await import('../src/lib/cabinet/outbox.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.curator!, 'EXPERT', { expertNdaSignedAt: NDA });
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });

  /** Строки очереди адресата по виду события: каналы и последнее письмо. */
  async function rows(userId: string, eventKind: string) {
    const found = await prisma.notificationOutbox.findMany({
      where: { userId, eventKind, createdAt: { gte: new Date(stamp) } },
      orderBy: { createdAt: 'asc' },
    });
    return found;
  }
  const channelsOf = async (userId: string, eventKind: string) =>
    (await rows(userId, eventKind)).map((row) => row.channel).sort();
  const lastLetter = async (userId: string, eventKind: string) =>
    (await rows(userId, eventKind)).filter((row) => row.channel === 'EMAIL').at(-1)!;
  const makeStage = (position: number, state: 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_APPROVAL', extra = {}) =>
    prisma.stage.create({
      data: { projectId: ids.project!, position, title: `Этап проверки ${position}`, state, ...extra },
    });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string, extra = {}) =>
      prisma.user.create({ data: { email: `cn-${suffix}-${stamp}@example.org`, fullName, role, ...extra } });
    const [managerUser, headUser, clientUser, curatorUser, newcomer] = await Promise.all([
      make('mgr', 'MANAGER', 'Менеджер Уведомлений'),
      make('head', 'HEAD', 'Руководитель Уведомлений'),
      make('cl', 'CLIENT', 'Заказчикова Анна Петровна'),
      // Куратор подключил Telegram: события приходят двумя каналами.
      make('cur', 'EXPERT', 'Куратор Уведомлений', { notifyTelegram: true, telegramChatId: `cn-${stamp}` }),
      make('new', 'EXPERT', 'Куратор без договора'),
    ]);
    await prisma.expertProfile.createMany({
      data: [{ userId: curatorUser.id, ndaSignedAt: NDA }, { userId: newcomer.id }],
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Заказчикова Анна Петровна', normalizedName: `cn клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cn-${stamp}`, name: 'Проверка уведомлений' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CN-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Флотация медно-никелевых руд',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      head: headUser.id,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      newcomer: newcomer.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    const users = [ids.manager!, ids.head!, ids.clientUser!, ids.curator!, ids.newcomer!];
    const versions = await prisma.materialVersion.findMany({
      where: { material: { projectId: ids.project } },
      select: { id: true },
    });
    const versionIds = versions.map((version) => version.id);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: ids.project }, { userId: { in: users } }] } });
    await prisma.notifyRule.deleteMany({ where: { userId: { in: users } } });
    await prisma.expertPayout.deleteMany({ where: { projectId: ids.project } });
    await prisma.versionComment.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: ids.project } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('в настройках куратора — строки его работ', () => {
    const kinds = channels.rulesFor('EXPERT').map((event) => event.kind);
    for (const kind of [
      'CURATOR_TURN',
      'STAGE_RETURNED',
      'VERSION_UPLOADED',
      'EXPERT_DECISION',
      'DEADLINE_IN_3_DAYS',
      'STAGE_APPROVED',
      'PROJECT_STATUS_CHANGED',
      'WORK_UNASSIGNED',
      'PAYOUT_ACCRUED',
      'PAYOUT_PAID',
    ]) {
      assert.ok(kinds.includes(kind), `нет строки ${kind}`);
    }
    assert.ok(!kinds.includes('HELP_REQUESTED') && !kinds.includes('MODERATION_PENDING'));
    assert.ok(channels.rulesFor('EXPERT').every((event) => event.group === 'Работа куратора'));
  });

  it('этап запущен — «ход за вами» письмом и в Telegram', async () => {
    const stage = await makeStage(1, 'NOT_STARTED');
    ids.stage = stage.id;
    await projects.setStageState(manager(), stage.id, 'IN_PROGRESS');
    assert.deepEqual(await channelsOf(ids.curator!, 'CURATOR_TURN'), ['EMAIL', 'TELEGRAM']);
    const letter = await lastLetter(ids.curator!, 'CURATOR_TURN');
    assert.equal(letter.subject, `Ход за вами: этап «Этап проверки 1»`);
    assert.equal(letter.path, `/cabinet/stages/${stage.id}`);
  });

  it('снятая строка правил не даёт строки очереди; возврат менеджером — «ход за вами»', async () => {
    await channels.saveRules(curator(), [{ eventKind: 'CURATOR_TURN', channel: 'TELEGRAM', enabled: false }]);
    await prisma.material.create({
      data: {
        projectId: ids.project!,
        stageId: ids.stage!,
        title: 'Глава 1',
        createdById: ids.curator!,
        versions: {
          create: {
            number: 1,
            storageKey: `cn/${stamp}/v1`,
            originalName: 'glava1.docx',
            sizeBytes: 10n,
            sha256: 'c'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: ids.curator!,
          },
        },
      },
    });
    await handover.handOverStage(curator(), ids.stage!, 'Глава 1 написана');
    await handover.handBackStage(manager(), ids.stage!, 'Добавьте выводы');
    const turns = await rows(ids.curator!, 'CURATOR_TURN');
    assert.deepEqual(turns.map((row) => row.channel), ['EMAIL', 'TELEGRAM', 'EMAIL'], 'снятая строка дала сигнал');
    assert.match(turns.at(-1)!.subject, /возвращён вам/u);
  });

  it('клиент вернул этап — куратору, без текста замечаний', async () => {
    const stage = await makeStage(2, 'IN_APPROVAL');
    await projects.returnStage(client(), stage.id, 'Перепишите раздел 2.3 полностью');
    const letter = await lastLetter(ids.curator!, 'STAGE_RETURNED');
    assert.match(letter.subject, /Клиент вернул этап «Этап проверки 2»/u);
    assert.doesNotMatch(letter.body, /раздел 2\.3|Заказчикова/u);
  });

  it('этап согласован клиентом — куратору', async () => {
    const stage = await makeStage(3, 'IN_APPROVAL');
    await projects.setStageState(client(), stage.id, 'DONE');
    const letter = await lastLetter(ids.curator!, 'STAGE_APPROVED');
    assert.match(letter.body, /Клиент согласовал этап «Этап проверки 3»/u);
    assert.doesNotMatch(letter.body, /Заказчикова/u);
  });

  it('клиент приложил материал вне этапа — куратору с договором', async () => {
    await materials.uploadVersion(client(), {
      projectId: ids.project!,
      stageId: null,
      materialId: null,
      title: 'Исходные данные',
      originalName: 'dannye.xlsx',
      contentType: 'application/octet-stream',
      body: Buffer.from('данные'),
    });
    assert.deepEqual(await channelsOf(ids.curator!, 'VERSION_UPLOADED'), ['EMAIL', 'TELEGRAM']);
  });

  it('срок этапа: сданный этап куратору не напоминает, несданный — напоминает', async () => {
    const tomorrow = new Date(moscowToday().getTime() + 24 * 60 * 60 * 1000);
    const handed = await makeStage(4, 'IN_PROGRESS', { dueOn: tomorrow, handedOverAt: new Date() });
    const open = await makeStage(5, 'IN_PROGRESS', { dueOn: tomorrow });
    await enqueueDeadlineReminders();
    const reminders = await rows(ids.curator!, 'DEADLINE_IN_3_DAYS');
    assert.ok(reminders.some((row) => row.path === `/cabinet/stages/${open.id}`), 'несданный этап не напомнил');
    assert.ok(!reminders.some((row) => row.path === `/cabinet/stages/${handed.id}`), 'сданный этап напомнил куратору');
    const toManager = await rows(ids.manager!, 'DEADLINE_IN_3_DAYS');
    assert.ok(toManager.some((row) => row.path === `/cabinet/stages/${handed.id}`), 'менеджеру о сданном этапе не напомнено');
  });

  it('работа приостановлена — куратору, без причины для клиента', async () => {
    await projects.setProjectStatus(manager(), ids.project!, 'PAUSED', 'Клиент в отпуске до ноября');
    const letter = await lastLetter(ids.curator!, 'PROJECT_STATUS_CHANGED');
    assert.equal(letter.subject, `Работа ${ids.code} приостановлена`);
    assert.doesNotMatch(letter.body, /отпуске/u, 'причина для клиента ушла куратору');
    await projects.setProjectStatus(manager(), ids.project!, 'ACTIVE');
    assert.match((await lastLetter(ids.curator!, 'PROJECT_STATUS_CHANGED')).subject, /возобновлена/u);
  });

  it('начисление и выплата — без суммы; с договором — с названием работы', async () => {
    const payout = await finance.addPayout(head(), { projectId: ids.project!, amount: 1_234_500n });
    const accrued = await lastLetter(ids.curator!, 'PAYOUT_ACCRUED');
    assert.match(accrued.body, /Флотация медно-никелевых руд/u);
    await finance.markPayoutPaid(head(), payout.id, moscowToday());
    const paid = await lastLetter(ids.curator!, 'PAYOUT_PAID');
    for (const letter of [accrued, paid]) {
      assert.doesNotMatch(`${letter.subject}\n${letter.body}`, /12\s?345|1\s?234\s?500/u, 'сумма в письме');
      assert.equal(letter.path, '/cabinet/payout');
    }
  });

  it('передача работы — прежнему куратору; без договора — только нейтральные события', async () => {
    await projects.assignExpert(head(), ids.project!, ids.newcomer!);
    const gone = await lastLetter(ids.curator!, 'WORK_UNASSIGNED');
    assert.equal(gone.subject, `Работа ${ids.code} передана другому куратору`);
    assert.doesNotMatch(gone.body, /Флотация/u, 'название работы в нейтральном письме');
    // Неотправленные письма о работе прежнему куратору гаснут — в утреннюю
    // сводку о чужой работе они не попадут; письмо о снятии уходит (Р-421).
    const pending = await prisma.notificationOutbox.findMany({
      where: { userId: ids.curator, projectId: ids.project, state: 'PENDING' },
      select: { eventKind: true },
    });
    assert.deepEqual([...new Set(pending.map((row) => row.eventKind))], ['WORK_UNASSIGNED']);
    const expired = await prisma.notificationOutbox.count({
      where: { userId: ids.curator, projectId: ids.project, state: 'EXPIRED', lastError: projects.UNASSIGNED_NOTE },
    });
    assert.ok(expired > 0, 'отложенные письма прежнему куратору не погашены');

    const stage = await makeStage(6, 'NOT_STARTED');
    await projects.setStageState(manager(), stage.id, 'IN_PROGRESS');
    assert.deepEqual(await channelsOf(ids.newcomer!, 'CURATOR_TURN'), [], 'куратор без договора получил «ход за вами»');
    const turns = (await rows(ids.curator!, 'CURATOR_TURN')).length;
    assert.equal(turns, 3, 'прежний куратор получил событие чужой работы');

    await finance.addPayout(head(), { projectId: ids.project!, amount: 500_000n });
    const neutral = await lastLetter(ids.newcomer!, 'PAYOUT_ACCRUED');
    assert.match(neutral.body, new RegExp(ids.code!, 'u'));
    assert.doesNotMatch(neutral.body, /Флотация/u, 'название работы без договора поручения');
  });
});
