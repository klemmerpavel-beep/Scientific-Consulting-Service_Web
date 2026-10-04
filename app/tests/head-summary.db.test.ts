/**
 * Одни определения на «Сводке», «Ближайшие сроки», счётчик меню
 * (требование РК-04, решение Р-342): «действующих» одинаково во всех
 * блоках — плитке, «Ведутся сейчас», «Чем занята практика» и реестре
 * кураторов; приостановленная работа стоит пометкой; работа из книги без
 * плана видна в «Ближайших сроках» по сроку работы; у строки — менеджер,
 * куратор и чей ход; «Закрыто» — завершено и отменено раздельно; число у
 * пункта меню равно числу дел «Требует внимания».
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('одни определения на «Сводке» (РК-04)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const summary = await import('../src/lib/cabinet/summary.ts');
  const attention = await import('../src/lib/cabinet/attention.ts');
  const { expertRegistry } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const code = (suffix: string) => `PD-HS-${String(stamp).slice(-6)}-${suffix}`;

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `hs-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Сводки'),
      make('mgr', 'MANAGER', 'Менеджер Сводки'),
      make('cur', 'EXPERT', 'Куратор Сводки'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Сводки', normalizedName: `hs клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `hs-${stamp}`, name: 'Проверка сводки' } });
    const base = {
      clientId: profile.id,
      serviceTypeId: type.id,
      managerId: managerUser.id,
      expertId: curatorUser.id,
    };
    const now = Date.now();
    const [running, paused, book] = await Promise.all([
      prisma.project.create({ data: { ...base, code: code('run'), title: `Идущая ${stamp}`, status: 'ACTIVE' } }),
      prisma.project.create({ data: { ...base, code: code('pause'), title: `Приостановленная ${stamp}`, status: 'PAUSED' } }),
      // Работа из книги: этапов нет, срок — у работы.
      prisma.project.create({
        data: { ...base, code: code('book'), title: `Из книги ${stamp}`, status: 'ACTIVE', dueOn: new Date(now + 5 * DAY) },
      }),
    ]);
    await Promise.all([
      prisma.stage.create({
        data: { projectId: running.id, position: 1, title: 'Глава 1', state: 'IN_PROGRESS', dueOn: new Date(now + 3 * DAY) },
      }),
      prisma.stage.create({
        data: { projectId: paused.id, position: 1, title: 'Глава 2', state: 'AWAITING_CLIENT', dueOn: new Date(now + 4 * DAY) },
      }),
    ]);
    const closed = new Date(now - 10 * DAY);
    const [done, cancelled] = await Promise.all([
      prisma.project.create({ data: { ...base, code: code('done'), title: `Завершённая ${stamp}`, status: 'COMPLETED', closedOn: closed } }),
      prisma.project.create({ data: { ...base, code: code('cancel'), title: `Отменённая ${stamp}`, status: 'CANCELLED', closedOn: closed } }),
    ]);
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      running: running.id,
      paused: paused.id,
      book: book.id,
      done: done.id,
      cancelled: cancelled.id,
    });
  });

  after(async () => {
    const projects = [ids.running!, ids.paused!, ids.book!, ids.done!, ids.cancelled!];
    const users = [ids.head!, ids.manager!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: { in: projects } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('«действующих» одинаково в плитке, «Ведутся сейчас», «Чем занята практика» и реестре', async () => {
    const [orders, works, load] = await Promise.all([
      summary.orderSummary(head()),
      summary.activeWorks(head()),
      summary.stageLoad(head()),
    ]);
    const live = orders.active + orders.paused;
    assert.equal(works.length, live, '«Ведутся сейчас» расходится с плиткой');
    assert.equal(
      load.points.reduce((acc, point) => acc + point.count, 0),
      live,
      '«Чем занята практика» расходится с плиткой',
    );
    assert.equal(load.paused, orders.paused);
    assert.equal(works.filter((work) => work.paused).length, orders.paused);
    const paused = works.find((work) => work.code === code('pause'));
    assert.equal(paused?.paused, true, 'приостановленная работа без пометки');
    const row = (await expertRegistry(head())).find((expert) => expert.id === ids.curator);
    assert.equal(row?.active, 3);
    assert.equal(row?.paused, 1);
    assert.equal(row?.total, 5);
  });

  it('«Закрыто за 90 дней» — завершено и отменено раздельно', async () => {
    const orders = await summary.orderSummary(head());
    assert.ok(orders.completedLastQuarter >= 1 && orders.cancelledLastQuarter >= 1);
    assert.equal(orders.completedLastQuarter + orders.cancelledLastQuarter, orders.closedLastQuarter);
  });

  it('«Ближайшие сроки»: работа из книги без плана — по сроку работы; у строки менеджер, куратор, ход', async () => {
    const rows = (await summary.upcomingDeadlines(head())).filter((row) => row.code.startsWith(code('')));
    assert.deepEqual(
      rows.map((row) => row.code),
      [code('run'), code('pause'), code('book')],
    );
    const book = rows.find((row) => row.code === code('book'))!;
    assert.equal(book.stage, null);
    assert.equal(book.href, `/cabinet/projects/${code('book')}`);
    const running = rows.find((row) => row.code === code('run'))!;
    assert.equal(running.manager, 'Менеджер Сводки');
    assert.equal(running.curator, 'Куратор Сводки');
    assert.equal(running.turn, 'Ход за куратором: этап в работе');
    assert.equal(rows.find((row) => row.code === code('pause'))?.paused, true);
  });

  it('число у пункта меню равно числу дел «Требует внимания»', async () => {
    const sources = await attention.attentionSources(head());
    const parts = attention.attentionParts(sources);
    const total = Object.values(parts).reduce((acc, part) => acc + part.length, 0);
    assert.equal(await attention.headAttentionCount(head()), total);
    // Сорванный срок своей работы руководителя — дело; число растёт на одно.
    await prisma.project.update({ where: { id: ids.running }, data: { managerId: ids.head } });
    await prisma.stage.updateMany({ where: { projectId: ids.running }, data: { dueOn: new Date(Date.now() - 5 * DAY) } });
    const after = await attention.headAttentionCount(head());
    const parts2 = attention.attentionParts(await attention.attentionSources(head()));
    assert.ok(parts2.overdue.some((stage) => stage.project.code === code('run')));
    assert.equal(after, Object.values(parts2).reduce((acc, part) => acc + part.length, 0));
    // Менеджеру числа у пункта меню нет.
    assert.equal(await attention.headAttentionCount(who(ids.manager!, 'MANAGER')), null);
  });
});
