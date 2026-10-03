/**
 * Напоминания о сроке этапа — тому, чей ход (требование М-08, ОМ-14,
 * решение Р-301): клиенту — только когда этап ждёт его данных, эксперту с
 * договором — пока этап в работе, куратору — всегда; одно письмо за три
 * дня и одно при срыве; срыв — только вчерашний; перенос срока — новое
 * напоминание.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'd'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('напоминания о сроке этапа', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { enqueueDeadlineReminders } = await import('../src/lib/cabinet/outbox.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

  const ids: Record<string, string> = {};
  const today = moscowToday(new Date());
  const day = (offset: number) => new Date(today.getTime() + offset * DAY);
  const stages: Record<string, string> = {};

  const letters = async (stageKey: string) => {
    const rows = await prisma.notificationOutbox.findMany({
      where: { dedupKey: { startsWith: `stage:${stages[stageKey]}:` }, channel: 'EMAIL' },
      select: { userId: true, eventKind: true },
    });
    return rows;
  };

  before(async () => {
    const make = (suffix: string, role: 'MANAGER' | 'CLIENT' | 'EXPERT') =>
      prisma.user.create({ data: { email: `dr-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [manager, clientUser, expert, plain] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('exp', 'EXPERT'),
      make('exp2', 'EXPERT'),
    ]);
    await prisma.expertProfile.create({ data: { userId: expert.id, ndaSignedAt: day(-30) } });
    await prisma.expertProfile.create({ data: { userId: plain.id } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент сроков', normalizedName: `dr клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `dr-${stamp}`, name: 'Проверка сроков' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-DR-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для сроков',
        managerId: manager.id,
        expertId: expert.id,
      },
    });
    const second = await prisma.project.create({
      data: {
        code: `PD-DS-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа без договора эксперта',
        managerId: manager.id,
        expertId: plain.id,
      },
    });
    const rows: [string, string, 'NOT_STARTED' | 'IN_PROGRESS' | 'AWAITING_CLIENT' | 'IN_APPROVAL', number][] = [
      ['work', project.id, 'IN_PROGRESS', 2],
      ['waiting', project.id, 'AWAITING_CLIENT', 1],
      ['idle', project.id, 'NOT_STARTED', 0],
      ['approval', project.id, 'IN_APPROVAL', 1],
      ['missed', project.id, 'IN_PROGRESS', -1],
      ['old', project.id, 'IN_PROGRESS', -5],
      ['nonda', second.id, 'IN_PROGRESS', 2],
    ];
    for (const [index, [key, projectId, state, offset]] of rows.entries()) {
      const stage = await prisma.stage.create({
        data: { projectId, position: index + 1, title: `Этап ${key}`, state, dueOn: day(offset) },
      });
      stages[key] = stage.id;
    }
    Object.assign(ids, {
      manager: manager.id,
      client: clientUser.id,
      expert: expert.id,
      plain: plain.id,
      profile: profile.id,
      type: type.id,
      project: project.id,
      second: second.id,
    });
  });

  after(async () => {
    const projects = [ids.project!, ids.second!];
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.client!, ids.expert!, ids.plain!] } } });
  });

  it('адресат — тот, чей ход', async () => {
    await enqueueDeadlineReminders();
    const who = async (key: string) => new Set((await letters(key)).map((row) => row.userId));

    const work = await who('work');
    assert.ok(work.has(ids.manager!) && work.has(ids.expert!), 'в работе: куратор и эксперт');
    assert.ok(!work.has(ids.client!), 'в работе клиенту напоминать не о чем');

    const waiting = await who('waiting');
    assert.ok(waiting.has(ids.client!) && waiting.has(ids.manager!), 'ждём данных: клиент и куратор');
    assert.ok(!waiting.has(ids.expert!));

    assert.deepEqual([...(await who('idle'))], [ids.manager], 'не начат: только куратор; срок «сегодня» входит');
    assert.deepEqual([...(await who('approval'))], [ids.manager], 'на согласовании клиенту — срок согласования');

    const nonda = await who('nonda');
    assert.ok(!nonda.has(ids.plain!), 'эксперт без договора получил письмо с названием этапа');
  });

  it('срыв — одно письмо и только по вчерашнему сроку; повтор — ни одного', async () => {
    const missed = await letters('missed');
    assert.ok(missed.length >= 2 && missed.every((row) => row.eventKind === 'DEADLINE_MISSED'));
    assert.equal((await letters('old')).length, 0, 'давно сорванный срок разослан при первом прогоне');
    assert.equal(await enqueueDeadlineReminders(), 0, 'повторный прогон поставил новые строки');
  });

  it('перенос срока даёт новое напоминание', async () => {
    const before = (await letters('work')).length;
    await prisma.stage.update({ where: { id: stages.work }, data: { dueOn: day(3) } });
    await enqueueDeadlineReminders();
    assert.ok((await letters('work')).length > before, 'перенос срока не дал нового напоминания');
  });
});
