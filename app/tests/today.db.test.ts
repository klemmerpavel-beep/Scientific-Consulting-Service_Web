/**
 * Рабочий экран «Сегодня» (требование М-06, решение Р-304): каждое новое
 * дело появляется и исчезает после закрывающего действия; дела по
 * работам — только свои; работы из книги заказов делами не становятся;
 * «ждёт клиента» — с недели и гаснет после письма практики.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('рабочий экран «Сегодня»', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { todayItems, trafficLight } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const leadIds: string[] = [];
  const curator = (): Actor => ({
    id: ids.manager!,
    role: 'MANAGER',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const work = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-TD-${String(stamp).slice(-6)}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        ...extra,
      },
    });
    projectIds.push(project.id);
    return project;
  };

  before(async () => {
    const [manager, other, expert] = await Promise.all([
      prisma.user.create({ data: { email: `td-mgr-${stamp}@example.org`, fullName: 'Куратор дня', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `td-oth-${stamp}@example.org`, fullName: 'Другой куратор', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `td-exp-${stamp}@example.org`, fullName: 'Эксперт без договора', role: 'EXPERT' } }),
    ]);
    await prisma.expertProfile.create({ data: { userId: expert.id } });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент дня', normalizedName: `td клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `td-${stamp}`, name: 'Проверка дня' } });
    Object.assign(ids, { manager: manager.id, other: other.id, expert: expert.id, client: profile.id, type: type.id });
  });

  after(async () => {
    await prisma.message.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: { in: projectIds } } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.other!, ids.expert!] } } });
  });

  it('работа без плана и без исполнителя — дело; из книги и чужая — нет', async () => {
    const mine = await work('A');
    const imported = await work('B', { source: 'IMPORT' });
    const foreign = await work('C', { managerId: ids.other! });
    const items = await todayItems(curator());
    const codes = (rows: readonly { code: string }[]) => rows.map((row) => row.code);
    assert.ok(codes(items.noPlan).includes(mine.code));
    assert.ok(codes(items.noExpert).includes(mine.code));
    assert.ok(!codes(items.noPlan).includes(imported.code), 'работа из книги стала делом');
    assert.ok(!codes(items.noPlan).includes(foreign.code), 'чужая работа стала делом');

    await prisma.stage.create({ data: { projectId: mine.id, position: 1, title: 'Глава 1' } });
    await prisma.project.update({ where: { id: mine.id }, data: { expertId: ids.expert! } });
    const after = await todayItems(curator());
    assert.ok(!codes(after.noPlan).includes(mine.code), 'дело не исчезло после плана');
    assert.ok(!codes(after.noExpert).includes(mine.code), 'дело не исчезло после назначения');
    assert.ok(codes(after.noNda).includes(mine.code), 'исполнитель без договора — не дело');
  });

  it('этап принят — запустить следующий; дело гаснет, когда следующий в работе', async () => {
    const project = await work('D');
    const done = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Обзор', state: 'DONE', completedAt: new Date() },
    });
    const next = await prisma.stage.create({
      data: { projectId: project.id, position: 2, title: 'Методика', dueOn: new Date(Date.now() + 3 * DAY) },
    });
    await prisma.stageStateChange.create({
      data: { stageId: done.id, fromState: 'IN_APPROVAL', toState: 'DONE', via: 'CLIENT_APPROVE' },
    });
    let items = await todayItems(curator());
    const accepted = items.accepted.find((row) => row.href === `/cabinet/stages/${next.id}`);
    assert.ok(accepted !== undefined, 'принятый этап — не дело');
    assert.equal(accepted.nextTitle, 'Методика');
    assert.ok(items.week.some((row) => row.key === `stage-${next.id}`), 'срок на неделе не попал в «На этой неделе»');

    await prisma.stage.update({ where: { id: next.id }, data: { state: 'IN_PROGRESS' } });
    items = await todayItems(curator());
    assert.ok(!items.accepted.some((row) => row.href === `/cabinet/stages/${next.id}`), 'дело не исчезло');
  });

  it('заявка без ответа дольше рабочего дня и заявка в разборе — с давностью', async () => {
    const old = await prisma.lead.create({
      data: {
        source: 'postgrad', form: 'request', contactKind: 'email', contact: `td-${stamp}@example.org`,
        name: 'Давняя заявка', consentGiven: true, consentVersion: 'test', createdAt: new Date(Date.now() - 6 * DAY),
      },
    });
    const review = await prisma.lead.create({
      data: {
        source: 'postgrad', form: 'request', contactKind: 'email', contact: `td2-${stamp}@example.org`,
        name: 'В разборе', consentGiven: true, consentVersion: 'test', status: 'AWAITING_REPLY',
        statusChangedAt: new Date(Date.now() - 4 * DAY),
      },
    });
    leadIds.push(old.id, review.id);
    const items = await todayItems(curator());
    assert.ok(items.lateLeads.some((lead) => lead.id === old.id));
    const row = items.reviewLeads.find((lead) => lead.id === review.id);
    assert.ok(row !== undefined && row.since.getTime() < Date.now() - 3 * DAY);
  });

  it('«ждёт клиента» — с недели и гаснет после письма практики', async () => {
    const project = await work('E');
    const stage = await prisma.stage.create({
      data: {
        projectId: project.id, position: 1, title: 'Данные', state: 'AWAITING_CLIENT',
        awaitingClientSince: new Date(Date.now() - 8 * DAY),
      },
    });
    let light = await trafficLight(curator());
    assert.ok(light.stalled.some((row) => row.id === stage.id), 'восемь дней ожидания — не дело');
    // Внутренняя ветка работы клиенту не видна: напоминанием не считается (Р-417).
    await prisma.message.create({
      data: { projectId: project.id, thread: 'WORK_INTERNAL', authorId: ids.manager!, body: 'Клиент молчит, напомню' },
    });
    light = await trafficLight(curator());
    assert.ok(light.stalled.some((row) => row.id === stage.id), 'дело погасло от внутреннего сообщения');
    await prisma.message.create({ data: { projectId: project.id, authorId: ids.manager!, body: 'Напоминаем о данных' } });
    light = await trafficLight(curator());
    assert.ok(!light.stalled.some((row) => row.id === stage.id), 'дело не погасло после письма практики');
  });
});
