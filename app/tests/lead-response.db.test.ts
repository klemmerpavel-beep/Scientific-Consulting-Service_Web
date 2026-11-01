/**
 * Скорость ответа на заявку на настоящей базе (п. 2.8 задания, решение
 * Р-766): первый ответ пишется первой сменой состояния из «Новой» —
 * плашкой, одобрением или отказом — и больше не меняется; дело «Заявка
 * ждёт ответа N ч» считается рабочими часами и гаснет, когда наступает
 * дело Р-304; цель правит только руководитель; медиана за 90 дней —
 * только с правом на аналитику; миграция заполняет прежние заявки по
 * журналу.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('скорость ответа на заявку (Р-766)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { todayItems } = await import('../src/lib/cabinet/queries.ts');
  const { setLeadStatus } = await import('../src/lib/cabinet/lead-work.ts');
  const { approveLead, declineLead } = await import('../src/lib/cabinet/projects.ts');
  const { leadFirstResponseHours, saveLeadFirstResponseHours } = await import('../src/lib/cabinet/practice-settings.ts');
  const { leadResponse } = await import('../src/lib/cabinet/analytics/leads.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const leadIds: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const head = () => who(ids.head!, 'HEAD');

  const newLead = async (createdAt: Date, extra: Record<string, unknown> = {}) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        name: `Заявитель ответа ${stamp}`,
        contactKind: 'phone',
        contact: `+7 900 ${String(stamp).slice(-3)}-${String(leadIds.length).padStart(2, '0')}-00`,
        consentGiven: true,
        consentVersion: 'test',
        createdAt,
        ...extra,
      },
    });
    leadIds.push(lead.id);
    return lead;
  };
  const firstResponse = async (id: string) =>
    (await prisma.lead.findUniqueOrThrow({ where: { id }, select: { firstResponseAt: true } })).firstResponseAt;

  before(async () => {
    await prisma.practiceSetting.deleteMany({ where: { key: 'leadFirstResponseHours' } });
    const [managerUser, headUser] = await Promise.all([
      prisma.user.create({ data: { email: `lr-mgr-${stamp}@example.org`, fullName: 'Менеджер Ответа', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `lr-head-${stamp}@example.org`, fullName: 'Руководитель Ответа', role: 'HEAD' } }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `lr-${stamp}`, name: 'Проверка ответа' } });
    Object.assign(ids, { manager: managerUser.id, head: headUser.id, type: type.id });
  });

  after(async () => {
    await prisma.practiceSetting.deleteMany({ where: { key: 'leadFirstResponseHours' } });
    const projects = await prisma.project.findMany({ where: { serviceTypeId: ids.type }, select: { id: true, clientId: true } });
    const projectIds = projects.map((project) => project.id);
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { projectId: null } });
    await prisma.notificationOutbox.deleteMany({
      where: { OR: [{ leadId: { in: leadIds } }, { projectId: { in: projectIds } }, { userId: { in: [ids.manager!, ids.head!] } }] },
    });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: projects.map((project) => project.clientId) } } });
    await prisma.auditEvent.deleteMany({ where: { objectType: 'Lead', objectId: { in: leadIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.manager!, ids.head!] } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.head!] } } });
    await prisma.$disconnect();
  });

  it('первая смена из «Новой» пишет первый ответ; возврат в «Новую» и новая смена его не переписывают', async () => {
    const lead = await newLead(new Date());
    assert.equal(await firstResponse(lead.id), null);
    const before = Date.now();
    await setLeadStatus(manager(), lead.id, 'IN_PROGRESS');
    const first = await firstResponse(lead.id);
    assert.ok(first !== null && first.getTime() >= before - 1000);
    await setLeadStatus(manager(), lead.id, 'NEW');
    await setLeadStatus(manager(), lead.id, 'AWAITING_REPLY');
    assert.equal((await firstResponse(lead.id))?.getTime(), first.getTime());
  });

  it('отказ и одобрение «Новой» — первый ответ; одобрение после разбора его не переписывает', async () => {
    const declined = await newLead(new Date());
    await declineLead(manager(), declined.id, 'Тема вне наших направлений.');
    assert.ok((await firstResponse(declined.id)) !== null);

    const fresh = await newLead(new Date());
    await approveLead(manager(), { leadId: fresh.id, serviceTypeId: ids.type!, managerId: ids.manager!, title: `Работа ответа ${stamp}` });
    assert.ok((await firstResponse(fresh.id)) !== null);

    const answered = await newLead(new Date());
    await setLeadStatus(manager(), answered.id, 'CONSULTED');
    const first = (await firstResponse(answered.id))!;
    await approveLead(manager(), { leadId: answered.id, serviceTypeId: ids.type!, managerId: ids.manager!, title: `Работа разбора ${stamp}` });
    assert.equal((await firstResponse(answered.id))?.getTime(), first.getTime());
  });

  it('дело «Заявка ждёт ответа N ч» — по рабочим часам, до дела Р-304 и без повтора', async () => {
    // Понедельник 02.02.2015, 10:00 МСК.
    const lead = await newLead(new Date('2015-02-02T07:00:00Z'));
    const waiting = async (iso: string) => (await todayItems(manager(), new Date(iso))).waitingLeads.find((row) => row.id === lead.id);
    const late = async (iso: string) => (await todayItems(manager(), new Date(iso))).lateLeads.some((row) => row.id === lead.id);

    assert.equal(await waiting('2015-02-02T08:30:00Z'), undefined, 'полтора рабочих часа — ещё не дело');
    assert.equal((await waiting('2015-02-02T09:00:00Z'))?.hours, 2, 'два рабочих часа — дело');
    assert.equal((await waiting('2015-02-02T14:10:00Z'))?.hours, 7);
    assert.equal(await late('2015-02-02T14:10:00Z'), false);
    // Вторник, 10:00: наступило дело Р-304 — «ждёт ответа» гаснет.
    assert.equal(await waiting('2015-02-03T07:00:00Z'), undefined);
    assert.equal(await late('2015-02-03T07:00:00Z'), true);
  });

  it('цель правит руководитель: 1–9 рабочих часов, журнал; дело — по новой цели', async () => {
    await assert.rejects(() => saveLeadFirstResponseHours(manager(), '3'), AccessDenied);
    for (const bad of ['', '0', '10', '2.5', 'два']) {
      await assert.rejects(() => saveLeadFirstResponseHours(head(), bad), /целое число рабочих часов от 1 до 9/u, bad);
    }
    assert.equal(await leadFirstResponseHours(), 2);
    await saveLeadFirstResponseHours(head(), '3');
    assert.equal(await leadFirstResponseHours(), 3);
    const entry = await prisma.auditEvent.findFirst({
      where: { actorId: ids.head!, action: 'PRACTICE_SETTING_SAVED', objectId: 'leadFirstResponseHours' },
      select: { payload: true },
    });
    assert.deepEqual(entry?.payload, { from: '2', to: '3' });

    const lead = await newLead(new Date('2015-02-09T07:00:00Z'));
    const items = async (iso: string) => (await todayItems(manager(), new Date(iso))).waitingLeads.some((row) => row.id === lead.id);
    assert.equal(await items('2015-02-09T09:00:00Z'), false, 'два часа при цели три — ещё не дело');
    assert.equal(await items('2015-02-09T10:00:00Z'), true);
    // Ответ гасит дело и при возврате заявки в «Новую».
    await setLeadStatus(manager(), lead.id, 'IN_PROGRESS');
    await setLeadStatus(manager(), lead.id, 'NEW');
    assert.equal(await items('2015-02-09T10:00:00Z'), false);
    await prisma.practiceSetting.deleteMany({ where: { key: 'leadFirstResponseHours' } });
  });

  it('медиана за 90 дней — по рабочим часам и только с правом на аналитику', async () => {
    // Вторник 01.03.2016, 10:00 МСК → 11:00: час; среда 02.03, 17:00 → четверг 03.03, 12:00: четыре часа.
    await newLead(new Date('2016-03-01T07:00:00Z'), { status: 'IN_PROGRESS', firstResponseAt: new Date('2016-03-01T08:00:00Z') });
    await newLead(new Date('2016-03-02T14:00:00Z'), { status: 'CONSULTED', firstResponseAt: new Date('2016-03-03T09:00:00Z') });
    await newLead(new Date('2016-03-03T07:00:00Z'), { status: 'DECLINED', firstResponseAt: new Date('2016-03-03T07:30:00Z') });
    await newLead(new Date('2016-03-03T08:00:00Z'));
    // Спам и отзывы не считаются (Р-351).
    await newLead(new Date('2016-03-03T07:00:00Z'), { status: 'SPAM', firstResponseAt: new Date('2016-03-10T07:00:00Z') });
    await newLead(new Date('2016-03-03T07:00:00Z'), { form: 'review', firstResponseAt: new Date('2016-03-10T07:00:00Z') });

    const speed = await leadResponse(head(), new Date('2016-03-04T12:00:00Z'));
    assert.equal(speed.answered, 3);
    assert.equal(speed.medianMinutes, 60);
    assert.equal(speed.withinTarget, 2);
    assert.equal(speed.waiting, 1);
    assert.equal(speed.targetHours, 2);
    await assert.rejects(() => leadResponse(manager(), new Date('2016-03-04T12:00:00Z')), AccessDenied);
  });

  it('миграция заполняет прежние заявки по журналу: первая смена из «Новой», одобрение или отказ', async () => {
    // Миграция исполняется в отдельной схеме внутри транзакции, которая
    // затем откатывается: рабочие таблицы не трогаются.
    const sql = readFileSync(
      path.join(import.meta.dirname, '..', 'prisma', 'migrations', '20261101140000_lead_first_response', 'migration.sql'),
      'utf8',
    );
    const statements = sql
      .split('\n')
      .filter((line) => !line.startsWith('--'))
      .join('\n')
      .split(/;\s*\n/u)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const schema = `lr_${stamp}`;
    const rollback = new Error('откат');
    let rows: { id: string; firstResponseAt: Date | null }[] = [];
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe('CREATE TABLE "Lead" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL)');
        await tx.$executeRawUnsafe(
          'CREATE TABLE "AuditEvent" ("id" TEXT PRIMARY KEY, "occurredAt" TIMESTAMP(3) NOT NULL, "action" TEXT NOT NULL, "objectType" TEXT NOT NULL, "objectId" TEXT, "payload" JSONB)',
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Lead" ("id", "createdAt", "status") VALUES
             ('new', '2026-10-01 07:00', 'NEW'),
             ('switched', '2026-10-01 07:00', 'AWAITING_REPLY'),
             ('approved', '2026-10-01 07:00', 'CONTRACTED'),
             ('declined', '2026-10-01 07:00', 'DECLINED'),
             ('spam', '2026-10-01 07:00', 'IN_PROGRESS'),
             ('silent', '2026-10-01 07:00', 'DECLINED')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "AuditEvent" ("id", "occurredAt", "action", "objectType", "objectId", "payload") VALUES
             ('e1', '2026-10-01 08:00', 'LEAD_STATUS_CHANGED', 'Lead', 'new', '{"from":"NEW","to":"IN_PROGRESS"}'),
             ('e2', '2026-10-01 09:00', 'LEAD_STATUS_CHANGED', 'Lead', 'new', '{"from":"IN_PROGRESS","to":"NEW"}'),
             ('e3', '2026-10-01 10:00', 'LEAD_STATUS_CHANGED', 'Lead', 'switched', '{"from":"IN_PROGRESS","to":"AWAITING_REPLY"}'),
             ('e4', '2026-10-01 08:30', 'LEAD_STATUS_CHANGED', 'Lead', 'switched', '{"from":"NEW","to":"IN_PROGRESS"}'),
             ('e5', '2026-10-01 08:30', 'LEAD_EDITED', 'Lead', 'approved', '{}'),
             ('e6', '2026-10-01 09:15', 'LEAD_APPROVED', 'Lead', 'approved', '{}'),
             ('e7', '2026-10-01 11:00', 'LEAD_DECLINED', 'Lead', 'declined', '{"letter":true}'),
             ('e8', '2026-10-01 09:00', 'LEAD_STATUS_CHANGED', 'Lead', 'spam', '{"from":"SPAM","to":"IN_PROGRESS"}'),
             ('e9', '2026-10-01 09:00', 'LEAD_STATUS_CHANGED', 'Project', 'silent', '{"from":"NEW","to":"IN_PROGRESS"}')`,
        );
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        rows = await tx.$queryRawUnsafe<{ id: string; firstResponseAt: Date | null }[]>(
          'SELECT "id", "firstResponseAt" FROM "Lead" ORDER BY "id"',
        );
        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    assert.deepEqual(
      rows.map((row) => [row.id, row.firstResponseAt === null ? null : row.firstResponseAt.toISOString()]),
      [
        ['approved', '2026-10-01T09:15:00.000Z'],
        ['declined', '2026-10-01T11:00:00.000Z'],
        ['new', null],
        ['silent', null],
        ['spam', null],
        ['switched', '2026-10-01T08:30:00.000Z'],
      ],
    );
  });
});
