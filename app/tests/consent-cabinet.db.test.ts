/**
 * Согласие в кабинете (решение Р-238).
 *
 * Заявка из кабинета помечалась согласованной со ссылкой на «согласие при
 * первом входе», которого не существовало. Теперь согласие переносится из
 * заявки с сайта при одобрении, а у записи без согласия спрашивается в
 * форме теми же отметками. Там же — одобрение заявки на адрес сотрудника
 * и ссылка привязки Telegram без недопустимого знака.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('согласие в кабинете', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { createCabinetRequest } = await import('../src/lib/cabinet/queries.ts');
  const { approveLead } = await import('../src/lib/cabinet/projects.ts');
  const { bindTelegram, createTelegramBindLink } = await import('../src/lib/cabinet/auth.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const leadIds: string[] = [];

  const person = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: {
        email: `consent-mgr-${stamp}@example.org`,
        fullName: 'Куратор',
        role: 'MANAGER',
        status: 'SUSPENDED',
      },
    });
    const invited = await prisma.user.create({
      data: { email: `consent-new-${stamp}@example.org`, fullName: 'Приглашённый', role: 'CLIENT' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `consent-${stamp}`, name: 'Проверка согласия' },
    });
    Object.assign(ids, { manager: manager.id, invited: invited.id, type: type.id });
  });

  after(async () => {
    const users = [ids.manager!, ids.invited!, ids.approved ?? '', ids.staffLinked ?? ''].filter(Boolean);
    const projects = await prisma.project.findMany({ where: { serviceTypeId: ids.type } });
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { projectId: null } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects.map((p) => p.id) } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects.map((p) => p.id) } } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects.map((p) => p.id) } } });
    await prisma.project.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.clientProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { objectType: 'Lead', objectId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.loginToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.serviceType.delete({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  const draft = (topic: string, extra: Record<string, unknown> = {}) => ({
    topic,
    need: null,
    deadline: null,
    message: null,
    ip: '127.0.0.1',
    ...extra,
  });

  it('запись без согласия заявку без отметок не подаёт', async () => {
    const topic = `Без согласия ${stamp}`;
    await assert.rejects(
      createCabinetRequest(person(ids.invited!, 'CLIENT'), draft(topic), 'v-site'),
      /согласие/u,
    );
    assert.equal(await prisma.lead.count({ where: { topic } }), 0);
  });

  it('отметки в форме записывают согласие в учётную запись и заявку', async () => {
    const lead = await createCabinetRequest(
      person(ids.invited!, 'CLIENT'),
      draft(`С согласием ${stamp}`, { consent: true, terms: true }),
      'v-site',
    );
    leadIds.push(lead.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.invited! } });
    assert.ok(user.consentAcceptedAt instanceof Date);
    assert.equal(user.consentVersion, 'v-site');
    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(saved.consentVersion, 'v-site');
  });

  it('согласие во входе по ссылке сотрудника — с пометкой в журнале; в своей сессии — без записи (аудит 09.10.2026)', async () => {
    const staffLinked = await prisma.user.create({
      data: { email: `consent-staff-link-${stamp}@example.org`, fullName: 'По ссылке', role: 'CLIENT' },
    });
    ids.staffLinked = staffLinked.id;
    const lead = await createCabinetRequest(
      { ...person(staffLinked.id, 'CLIENT'), viaStaffLink: true },
      draft(`По ссылке сотрудника ${stamp}`, { consent: true, terms: true }),
      'v-site',
    );
    leadIds.push(lead.id);
    const journal = await prisma.auditEvent.findFirstOrThrow({
      where: { objectType: 'Lead', objectId: lead.id, action: 'REQUEST_VIA_STAFF_LINK' },
    });
    assert.equal(journal.actorId, staffLinked.id);
    assert.deepEqual(journal.payload, { consentGiven: true, staffLink: true });

    // Повторная заявка в такой сессии: согласие уже записано — пометка
    // говорит, что в этой заявке оно не давалось.
    const again = await createCabinetRequest(
      { ...person(staffLinked.id, 'CLIENT'), viaStaffLink: true },
      draft(`По ссылке сотрудника снова ${stamp}`),
      'v-site',
    );
    leadIds.push(again.id);
    const second = await prisma.auditEvent.findFirstOrThrow({
      where: { objectType: 'Lead', objectId: again.id, action: 'REQUEST_VIA_STAFF_LINK' },
    });
    assert.deepEqual(second.payload, { consentGiven: false, staffLink: true });

    // Своя сессия клиента пометки не пишет.
    const own = await createCabinetRequest(
      person(staffLinked.id, 'CLIENT'),
      draft(`Своя сессия ${stamp}`),
      'v-site',
    );
    leadIds.push(own.id);
    assert.equal(await prisma.auditEvent.count({ where: { objectType: 'Lead', objectId: own.id } }), 0);
  });

  it('одобрение переносит согласие из заявки с сайта', async () => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact: `consent-site-${stamp}@example.org`,
        name: 'С сайта',
        consentGiven: true,
        consentVersion: 'v-lead',
      },
    });
    leadIds.push(lead.id);
    await approveLead(person(ids.manager!, 'HEAD'), {
      leadId: lead.id,
      serviceTypeId: ids.type!,
      managerId: ids.manager!,
      title: 'Работа',
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `consent-site-${stamp}@example.org` },
    });
    ids.approved = user.id;
    assert.equal(user.consentVersion, 'v-lead');
    assert.equal(user.consentAcceptedAt?.getTime(), lead.createdAt.getTime());
  });

  it('заявка на адрес сотрудника не вешает работу на его запись', async () => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact: `consent-mgr-${stamp}@example.org`,
        name: 'Сотрудник',
        consentGiven: true,
        consentVersion: 'v-lead',
      },
    });
    leadIds.push(lead.id);
    await assert.rejects(
      approveLead(person(ids.manager!, 'HEAD'), {
        leadId: lead.id,
        serviceTypeId: ids.type!,
        managerId: ids.manager!,
        title: 'Работа',
      }),
      /сотруднику/u,
    );
  });

  it('ссылка привязки Telegram — без точки, и бот её принимает', async () => {
    process.env.TELEGRAM_BOT_USERNAME = 'prodisser_test_bot';
    try {
      // Без секрета вебхука бот не примет /start: ссылка не выдаётся (Р-246).
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      assert.equal(await createTelegramBindLink(ids.invited!), null);
      process.env.TELEGRAM_WEBHOOK_SECRET = 'секрет-проверки';
      const link = await createTelegramBindLink(ids.invited!);
      const start = new URL(link!).searchParams.get('start')!;
      assert.match(start, /^[A-Za-z0-9_-]{1,64}$/u, 'параметр запуска вне алфавита Telegram');
      assert.equal(await bindTelegram(start, `9${String(stamp).slice(-8)}`), true);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.invited! } });
      assert.equal(user.telegramChatId, `9${String(stamp).slice(-8)}`);
    } finally {
      delete process.env.TELEGRAM_BOT_USERNAME;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      await prisma.user.update({ where: { id: ids.invited! }, data: { telegramChatId: null } });
    }
  });
});
