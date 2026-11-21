/**
 * Строка журнала — в транзакции действия, на настоящей базе (аудит
 * кабинета 15.11.2026, находка Ф-15; решение Р-967, продолжение Р-937 и
 * Р-938): справочники, учётные записи, согласия, договор поручения,
 * способы связи, настройки практики, годы, расходы, шаблоны практики.
 *
 * Сбой записи журнала воспроизводится запретом на вставку строк журнала
 * от лиц проверки (как в `create-user-atomic.db`): своё действие человек
 * совершает от своей учётной записи, и «призрак» без записи здесь не
 * годится — запись о нём упёрлась бы во внешний ключ раньше журнала.
 * Каждое действие обязано отказать и не оставить ни своей записи, ни
 * письма в очереди, ни файла в хранилище.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 'j'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-r967-'));

const enabled = Boolean(process.env.DATABASE_URL);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('строка журнала — в транзакции действия (Р-967)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const settings = await import('../src/lib/cabinet/practice-settings.ts');
  const years = await import('../src/lib/cabinet/finance-years.ts');
  const profit = await import('../src/lib/cabinet/profit.ts');
  const templates = await import('../src/lib/cabinet/owner-templates.ts');
  const { CAMERA_CONSENT_TEXT, consentTextHash } = await import('../src/lib/cabinet/curator-consents.ts');

  const stamp = Date.now();
  const fn = `pd_r967_refuse_${stamp}`;
  const trigger = `pd_r967_refuse_${stamp}`;
  // Годы — давние и свои: 2001 и 2002 занимает проверка итогов по годам.
  const YEAR_NEW = 2003;
  const YEAR_OLD = 2005;
  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], clientProfileId: string | null = null): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.client!, 'CLIENT', ids.profile!);
  const stored = () => {
    const dir = path.join(process.env.CABINET_STORAGE_DIR!, 'templates');
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  };
  const actors = () => [ids.head!, ids.curator!, ids.client!];
  // Настройки практики общие для всех проверок: если действие всё же
  // запишет их мимо транзакции, прежние значения возвращаются после.
  let settingsBefore: { key: string; value: string; updatedById: string | null; updatedAt: Date }[] = [];

  before(async () => {
    settingsBefore = await prisma.practiceSetting.findMany({ select: { key: true, value: true, updatedById: true, updatedAt: true } });
    ids.head = (await prisma.user.create({ data: { email: `r967-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' } })).id;
    ids.curator = (
      await prisma.user.create({ data: { email: `r967-cur-${stamp}@example.org`, fullName: 'Куратор Журналов', role: 'EXPERT', notifyEmail: true } })
    ).id;
    await prisma.expertProfile.create({ data: { userId: ids.curator } });
    // Менеджер работы куратора: письмо «куратору открыт доступ» уходит ему.
    ids.manager = (
      await prisma.user.create({ data: { email: `r967-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER', notifyEmail: true } })
    ).id;
    const user = await prisma.user.create({ data: { email: `r967-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' } });
    ids.client = user.id;
    ids.profile = (await prisma.clientProfile.create({ data: { userId: user.id, fullName: 'Клиент', normalizedName: `r967 клиент ${stamp}` } })).id;
    // Карточка без почты и без записи — для «открыть вход» с вписанным адресом.
    ids.bare = (await prisma.clientProfile.create({ data: { fullName: 'Заказчик Без Почты', normalizedName: `r967 без почты ${stamp}` } })).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `r967-${stamp}`, name: `Тип Р-967 ${stamp}` } })).id;
    ids.work = (
      await prisma.project.create({
        data: {
          code: `PD-R967-${String(stamp).slice(-6)}`,
          clientId: ids.bare,
          serviceTypeId: ids.type,
          title: 'Работа Р-967',
          managerId: ids.manager,
          expertId: ids.curator,
        },
      })
    ).id;
    ids.alias = (await prisma.serviceTypeAlias.create({ data: { alias: `r967 написание ${stamp}`, serviceTypeId: ids.type } })).id;
    ids.template = (await prisma.stageTemplate.create({ data: { serviceTypeId: ids.type, title: 'Этап шаблона', position: 1 } })).id;
    ids.contact = (await prisma.contactChannel.create({ data: { userId: ids.client, kind: 'EMAIL', preferred: false } })).id;
    ids.invite = (
      await prisma.notificationOutbox.create({
        data: {
          userId: ids.curator,
          channel: 'EMAIL',
          eventKind: 'CURATOR_INVITED',
          subject: 'Приглашение',
          body: 'Приглашение',
          dedupKey: `curator-invited:${ids.curator}:r967:${stamp}`,
          state: 'FAILED',
          failure: 'DELIVERY',
        },
      })
    ).id;
    const category = await prisma.expenseCategory.findFirstOrThrow({ where: { isActive: true } });
    ids.expense = (
      await prisma.expense.create({ data: { month: new Date('2026-10-01T00:00:00Z'), categoryId: category.id, amount: 1_000n, createdById: ids.head } })
    ).id;
    await prisma.yearlyFinance.deleteMany({ where: { year: { in: [YEAR_NEW, YEAR_OLD] } } });
    await prisma.yearlyFinance.create({ data: { year: YEAR_OLD, revenue: 100n, costs: 10n, updatedById: ids.head } });
    // Шаблон практики заводится до запрета: его потом убирают под запретом.
    ids.docTemplate = (
      await templates.saveOwnerTemplate(head(), {
        title: `Памятка Р-967 ${stamp}`,
        note: '',
        audience: 'STAFF',
        originalName: 'Памятка.docx',
        contentType: DOCX,
        body: makeDocx(['Памятка']),
      })
    ).id;

    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN ` +
        `IF NEW."actorId" IN ('${ids.head}', '${ids.curator}', '${ids.client}') THEN RAISE EXCEPTION 'сбой журнала'; END IF; ` +
        `RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    await prisma.practiceSetting.deleteMany({ where: { key: { notIn: settingsBefore.map((row) => row.key) } } });
    for (const row of settingsBefore) {
      await prisma.practiceSetting.update({ where: { key: row.key }, data: { value: row.value, updatedById: row.updatedById, updatedAt: row.updatedAt } });
    }
    const people = [...actors(), ids.manager!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: people } } });
    await prisma.documentTemplate.deleteMany({ where: { uploadedById: ids.head } });
    await prisma.expense.deleteMany({ where: { createdById: ids.head } });
    await prisma.yearlyFinance.deleteMany({ where: { year: { in: [YEAR_NEW, YEAR_OLD] } } });
    await prisma.project.deleteMany({ where: { id: ids.work } });
    await prisma.stageTemplate.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.serviceTypeAlias.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.serviceType.deleteMany({ where: { OR: [{ id: ids.type }, { code: `r967-new-${stamp}` }] } });
    await prisma.calendarDay.deleteMany({ where: { day: { in: [new Date('2031-01-04T00:00:00Z'), new Date('2031-01-05T00:00:00Z')] } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.profile!, ids.bare!] } } });
    await prisma.user.deleteMany({ where: { id: { in: people } } });
  });

  it('справочники: позиция, написание, день календаря и шаблон этапов без строки журнала не остаются', async () => {
    await assert.rejects(admin.saveServiceType(head(), { code: `r967-new-${stamp}`, name: 'Новая позиция' }), /сбой журнала/u);
    assert.equal(await prisma.serviceType.count({ where: { code: `r967-new-${stamp}` } }), 0, 'позиция без строки журнала');

    await assert.rejects(admin.addAlias(head(), ids.type!, `Новое Написание ${stamp}`), /сбой журнала/u);
    assert.equal(await prisma.serviceTypeAlias.count({ where: { serviceTypeId: ids.type } }), 1, 'написание без строки журнала');
    await assert.rejects(admin.removeAlias(head(), ids.alias!), /сбой журнала/u);
    assert.equal(await prisma.serviceTypeAlias.count({ where: { id: ids.alias } }), 1, 'написание снято без строки журнала');

    await assert.rejects(admin.saveCalendarDay(head(), { day: new Date('2031-01-04T00:00:00Z'), workday: true }), /сбой журнала/u);
    assert.equal(await prisma.calendarDay.count({ where: { day: new Date('2031-01-04T00:00:00Z') } }), 0);
    await prisma.calendarDay.create({ data: { day: new Date('2031-01-05T00:00:00Z'), workday: false } });
    await assert.rejects(admin.removeCalendarDay(head(), '2031-01-05'), /сбой журнала/u);
    assert.equal(await prisma.calendarDay.count({ where: { day: new Date('2031-01-05T00:00:00Z') } }), 1);

    await assert.rejects(admin.saveStageTemplateItem(head(), { serviceTypeId: ids.type!, title: 'Второй этап', position: 2 }), /сбой журнала/u);
    await assert.rejects(admin.saveStageTemplateItem(head(), { serviceTypeId: ids.type!, title: 'Переименован', position: 1 }), /сбой журнала/u);
    await assert.rejects(admin.removeStageTemplateItem(head(), ids.template!), /сбой журнала/u);
    const rows = await prisma.stageTemplate.findMany({ where: { serviceTypeId: ids.type }, select: { title: true } });
    assert.deepEqual(rows.map((row) => row.title), ['Этап шаблона'], 'шаблон этапов изменён без строки журнала');
  });

  it('учётные записи: регалии, профиль, согласие, договор поручения, «Сообщить руководителю», каналы, повтор приглашения, почта клиента', async () => {
    await assert.rejects(admin.saveRegalia(head(), ids.curator!, { degree: 'к. т. н.', specialization: '', specialtyCode: '' }), /сбой журнала/u);
    await assert.rejects(
      admin.saveCuratorProfile(head(), ids.curator!, {
        degree: 'д. т. н.',
        academicTitle: '',
        position: '',
        specialtyCode: '',
        specialization: '',
        university: '',
        defaultPayout: '',
      }),
      /сбой журнала/u,
    );
    await assert.rejects(
      admin.saveOwnConsent(curator(), { kind: 'camera', give: true, seenHash: consentTextHash(CAMERA_CONSENT_TEXT) }),
      /сбой журнала/u,
    );
    const profile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } });
    assert.equal(profile.degree, null, 'регалии или профиль без строки журнала');
    assert.equal(profile.cameraConsentAt, null, 'согласие без строки журнала');

    // «Сообщить руководителю»: ни отметки, которая на сутки закрыла бы
    // повтор, ни письма руководителю.
    await assert.rejects(admin.requestNda(curator(), new Date()), /сбой журнала/u);
    assert.equal((await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } })).ndaRequestedAt, null);
    assert.equal(await prisma.notificationOutbox.count({ where: { eventKind: 'NDA_WAITING', dedupKey: { startsWith: `nda-waiting:${ids.curator}:` } } }), 0);

    // Договор поручения: ни отметки, ни писем куратору и менеджеру.
    await assert.rejects(admin.signExpertNda(head(), ids.curator!, new Date('2026-11-02T00:00:00Z')), /сбой журнала/u);
    assert.equal((await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.curator } })).ndaSignedAt, null);
    assert.equal(
      await prisma.notificationOutbox.count({ where: { dedupKey: { startsWith: `nda-signed:${ids.curator}` } } }),
      0,
      'письмо о договоре без договора',
    );

    await assert.rejects(admin.saveOwnChannels(curator(), { email: false, telegram: false }), /сбой журнала/u);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.curator } })).notifyEmail, true);

    // Повтор приглашения: строка остаётся «не доставлено» — пауза повтора
    // считается по журналу, и повтор без строки её бы обходил.
    await assert.rejects(admin.retryCuratorInvite(head(), ids.curator!), /сбой журнала/u);
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: ids.invite } })).state, 'FAILED');

    // Почта, вписанная при открытии входа клиенту, без строки журнала не остаётся.
    await assert.rejects(admin.openClientAccess(head(), ids.work!, null, `r967-bare-${stamp}@example.org`), /сбой журнала/u);
    assert.equal((await prisma.clientProfile.findUniqueOrThrow({ where: { id: ids.bare } })).email, null);
  });

  it('способы связи и правила уведомлений без строки журнала не меняются', async () => {
    const before = await prisma.contactChannel.findMany({ where: { userId: ids.client }, orderBy: { id: 'asc' } });
    await assert.rejects(channels.addContact(client(), { kind: 'PHONE_CALL', value: '+7 900 000-00-00', preferred: true }), /сбой журнала/u);
    await assert.rejects(channels.preferContact(client(), ids.contact!), /сбой журнала/u);
    await assert.rejects(channels.setFullSupport(client(), true), /сбой журнала/u);
    await assert.rejects(channels.dropContact(client(), ids.contact!), /сбой журнала/u);
    assert.deepEqual(await prisma.contactChannel.findMany({ where: { userId: ids.client }, orderBy: { id: 'asc' } }), before);

    await assert.rejects(channels.saveRules(curator(), [{ eventKind: 'CURATOR_TURN', channel: 'EMAIL', enabled: false }]), /сбой журнала/u);
    assert.equal(await prisma.notifyRule.count({ where: { userId: ids.curator } }), 0);
  });

  it('настройки практики без строки журнала не меняются', async () => {
    const read = () => prisma.practiceSetting.findMany({ orderBy: { key: 'asc' }, select: { key: true, value: true } });
    const before = await read();
    const reaction = await settings.reactionDays();
    const hours = await settings.leadFirstResponseHours();
    const since = (await settings.analyticsSince()).toISOString().slice(0, 10);
    const thresholds = await settings.confidenceThresholds();
    await assert.rejects(settings.saveReactionDays(head(), String(reaction === 3 ? 4 : 3)), /сбой журнала/u);
    await assert.rejects(settings.saveLeadFirstResponseHours(head(), String(hours === 3 ? 4 : 3)), /сбой журнала/u);
    await assert.rejects(settings.saveResponseTerms(head(), String(reaction === 3 ? 4 : 3), String(hours)), /сбой журнала/u);
    await assert.rejects(settings.saveAnalyticsSince(head(), since === '2001-02-03' ? '2001-02-04' : '2001-02-03'), /сбой журнала/u);
    await assert.rejects(
      settings.saveConfidenceThresholds(head(), thresholds.sure === 40 ? '41, 21, 11' : '40, 20, 10'),
      /сбой журнала/u,
    );
    await assert.rejects(settings.saveShowcaseConsentText(head(), `Текст согласия Р-967 ${stamp}`), /сбой журнала/u);
    assert.deepEqual(await read(), before);
  });

  it('годы, расходы и шаблоны практики без строки журнала не меняются; файл — по исходу транзакции', async () => {
    await assert.rejects(years.saveYear(head(), { year: YEAR_NEW, revenue: 5n, costs: 1n, note: null }), /сбой журнала/u);
    assert.equal(await prisma.yearlyFinance.count({ where: { year: YEAR_NEW } }), 0);
    await assert.rejects(years.removeYear(head(), YEAR_OLD), /сбой журнала/u);
    assert.equal(await prisma.yearlyFinance.count({ where: { year: YEAR_OLD } }), 1);

    await assert.rejects(profit.removeExpense(head(), ids.expense!), /сбой журнала/u);
    assert.equal(await prisma.expense.count({ where: { id: ids.expense } }), 1);

    // Новый шаблон: ни строки, ни файла — объект, положенный до
    // транзакции, убирается при её отказе.
    const files = stored();
    await assert.rejects(
      templates.saveOwnerTemplate(head(), {
        title: `Договор Р-967 ${stamp}`,
        note: '',
        audience: 'ALL',
        originalName: 'Договор.docx',
        contentType: DOCX,
        body: makeDocx(['Договор']),
      }),
      /сбой журнала/u,
    );
    assert.equal(await prisma.documentTemplate.count({ where: { title: `Договор Р-967 ${stamp}` } }), 0);
    assert.deepEqual(stored(), files, 'файл отказавшей загрузки остался в хранилище');

    // Замена по названию: прежняя строка и прежний файл целы.
    const was = await prisma.documentTemplate.findUniqueOrThrow({ where: { id: ids.docTemplate } });
    await assert.rejects(
      templates.saveOwnerTemplate(head(), {
        title: was.title,
        note: '',
        audience: 'STAFF',
        originalName: 'Памятка-2.docx',
        contentType: DOCX,
        body: makeDocx(['Памятка, вторая редакция']),
      }),
      /сбой журнала/u,
    );
    assert.equal((await prisma.documentTemplate.findUniqueOrThrow({ where: { id: ids.docTemplate } })).storageKey, was.storageKey);
    assert.deepEqual(stored(), files);

    // Убрать: строка не помечена, файл на месте.
    await assert.rejects(templates.removeOwnerTemplate(head(), ids.docTemplate!), /сбой журнала/u);
    assert.equal((await prisma.documentTemplate.findUniqueOrThrow({ where: { id: ids.docTemplate } })).deletedAt, null);
    assert.ok(existsSync(path.join(process.env.CABINET_STORAGE_DIR!, was.storageKey)), 'файл шаблона убран без пометки строки');
  });

  it('без сбоя действие пишет и запись, и строку журнала', async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "AuditEvent"`);
    await admin.saveStageTemplateItem(head(), { serviceTypeId: ids.type!, title: 'Второй этап', position: 2 });
    await profit.removeExpense(head(), ids.expense!);
    await admin.signExpertNda(head(), ids.curator!, new Date('2026-11-02T00:00:00Z'));
    await channels.dropContact(client(), ids.contact!);
    // Повторное снятие уже снятого способа — без действия и без строки.
    await channels.dropContact(client(), ids.contact!);
    const was = await prisma.documentTemplate.findUniqueOrThrow({ where: { id: ids.docTemplate } });
    await templates.removeOwnerTemplate(head(), ids.docTemplate!);
    assert.equal(existsSync(path.join(process.env.CABINET_STORAGE_DIR!, was.storageKey)), false);

    const journal = await prisma.auditEvent.findMany({ where: { actorId: { in: actors() } }, select: { action: true } });
    assert.deepEqual(
      journal.map((row) => row.action).sort(),
      ['CONTACT_REMOVED', 'EXPENSE_REMOVED', 'EXPERT_NDA_UPDATED', 'STAGE_TEMPLATE_SAVED', 'TEMPLATE_REMOVED', 'TEMPLATE_UPLOADED'],
    );
    assert.equal(await prisma.stageTemplate.count({ where: { serviceTypeId: ids.type } }), 2);
    assert.equal(await prisma.expense.count({ where: { id: ids.expense } }), 0);
    assert.equal(await prisma.contactChannel.count({ where: { id: ids.contact } }), 0);
    // Письма о договоре — той же транзакцией: куратору и менеджеру его работы.
    assert.deepEqual(
      (await prisma.notificationOutbox.findMany({ where: { dedupKey: { startsWith: `nda-signed:${ids.curator}` } }, select: { eventKind: true } }))
        .map((row) => row.eventKind)
        .sort(),
      ['CURATOR_NDA_SIGNED', 'NDA_SIGNED'],
    );
  });
});
