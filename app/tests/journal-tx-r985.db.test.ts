/**
 * Строка журнала — в транзакции действия, часть 2, на настоящей базе
 * (аудит кабинета 15.11.2026, находка Ф-15; решение Р-985, продолжение
 * Р-937, Р-938 и Р-967): по представительным службам классов «б» (одна
 * запись и строка) и «в» (несколько записей, письма в очереди).
 *
 * Сбой записи журнала воспроизводится запретом на вставку строк журнала
 * от лиц проверки и о её объектах (как в `journal-tx-r967.db`): объект
 * нужен автозакрытию этапа, у которого действующего лица нет. Каждое
 * действие обязано отказать и не оставить ни своей записи, ни письма в
 * очереди; без запрета — пишет и то и другое.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'r'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('строка журнала — в транзакции действия, часть 2 (Р-985)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const assignments = await import('../src/lib/cabinet/assignments.ts');
  const approval = await import('../src/lib/cabinet/approval.ts');
  const auth = await import('../src/lib/cabinet/auth.ts');
  const applications = await import('../src/lib/cabinet/expert-applications.ts');
  const feedback = await import('../src/lib/cabinet/feedback.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');
  const checks = await import('../src/lib/cabinet/head-checks.ts');
  const leads = await import('../src/lib/cabinet/lead-work.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const messages = await import('../src/lib/cabinet/messages.ts');
  const outbox = await import('../src/lib/cabinet/outbox.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const ratings = await import('../src/lib/cabinet/ratings.ts');
  const recommendations = await import('../src/lib/cabinet/recommendations.ts');
  const importing = await import('../src/lib/cabinet/import/apply.ts');

  const stamp = Date.now();
  const fn = `pd_r985_refuse_${stamp}`;
  const trigger = `pd_r985_refuse_${stamp}`;
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const KEY = `calendar:r985-${stamp}:2026-10-20`;
  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.client!, 'CLIENT', { clientProfileId: ids.profile! });
  const people = () => [ids.head!, ids.manager!, ids.curator!, ids.client!];
  const letters = () => prisma.notificationOutbox.count({ where: { userId: { in: people() }, id: { not: ids.failed! } } });
  const settingsKeys = ['analyticsSince', 'confidenceThresholds'];

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `r985-${suffix}-${stamp}@example.org`, fullName, role, notifyEmail: true } });
    const [headUser, managerUser, curatorUser, clientUser] = [
      await make('head', 'HEAD', 'Руководитель Журнала'),
      await make('mgr', 'MANAGER', 'Менеджер Журнала'),
      await make('cur', 'EXPERT', 'Куратор Журнала'),
      await make('cli', 'CLIENT', 'Клиент Журнала'),
    ];
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, curator: curatorUser.id, client: clientUser.id });
    await prisma.expertProfile.create({ data: { userId: ids.curator, ndaSignedAt: NDA } });
    ids.profile = (await prisma.clientProfile.create({ data: { userId: ids.client, fullName: 'Клиент Журнала', normalizedName: `r985 клиент ${stamp}` } })).id;
    ids.source = (await prisma.clientProfile.create({ data: { fullName: 'Иванов Иван', normalizedName: `r985 иванов ${stamp}` } })).id;
    ids.target = (await prisma.clientProfile.create({ data: { fullName: 'Иванов  Иван', normalizedName: `r985 иванов2 ${stamp}` } })).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `r985-${stamp}`, name: `Тип Р-985 ${stamp}` } })).id;
    const work = (suffix: string, status: 'ACTIVE' | 'COMPLETED') =>
      prisma.project.create({
        data: {
          code: `PD-R985${suffix}-${String(stamp).slice(-6)}`,
          clientId: ids.profile!,
          serviceTypeId: ids.type!,
          title: `Работа Р-985 ${suffix}`,
          managerId: ids.manager!,
          expertId: ids.curator!,
          expertRole: 'SUBJECT_EXPERT',
          status,
        },
      });
    ids.work = (await work('A', 'ACTIVE')).id;
    ids.done = (await work('B', 'COMPLETED')).id;
    const stage = (position: number, data: Record<string, unknown>) =>
      prisma.stage.create({ data: { projectId: ids.work!, position, title: `Этап ${position}`, ...data } });
    ids.stage = (await stage(1, { state: 'IN_PROGRESS' })).id;
    ids.handed = (await stage(2, { state: 'IN_PROGRESS', handedOverAt: new Date(), handoverNote: 'Сдано' })).id;
    ids.returned = (await stage(3, { state: 'IN_PROGRESS', returnedAt: new Date() })).id;
    ids.expired = (await stage(4, { state: 'IN_APPROVAL', approvalDueOn: new Date(Date.UTC(2020, 0, 10)) })).id;
    const material = await prisma.material.create({
      data: {
        projectId: ids.work!,
        stageId: ids.stage!,
        title: 'Глава Р-985',
        createdById: ids.curator!,
        versions: {
          create: {
            number: 1,
            storageKey: `r985/${stamp}/v1`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'c'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: ids.curator!,
          },
        },
      },
      include: { versions: true },
    });
    ids.version = material.versions[0]!.id;
    await prisma.versionModeration.create({ data: { versionId: ids.version, status: 'PUBLISHED', decidedById: ids.manager! } });
    ids.comment = (
      await prisma.versionComment.create({
        data: { versionId: ids.version, authorId: ids.curator!, body: 'Замечание куратора', moderationStatus: 'PENDING' },
      })
    ).id;
    ids.check = (await prisma.headCheck.create({ data: { kind: 'ACT_AFTER_ACCEPT', projectId: ids.work!, stageId: ids.stage! } })).id;
    ids.assignment = (
      await prisma.assignment.create({
        data: { assigneeId: ids.manager!, text: 'Поручение Р-985', dueOn: new Date(Date.UTC(2031, 0, 10)), createdById: ids.head! },
      })
    ).id;
    ids.lead = (
      await prisma.lead.create({
        data: { source: 'site', form: 'request', name: 'Заявитель', contactKind: 'email', contact: `r985-lead-${stamp}@example.org`, topic: 'Тема', consentGiven: true, consentVersion: 'v1' },
      })
    ).id;
    ids.failed = (
      await prisma.notificationOutbox.create({
        data: {
          userId: ids.manager!,
          channel: 'EMAIL',
          eventKind: 'MESSAGE_RECEIVED',
          subject: 'Письмо',
          body: 'Письмо',
          dedupKey: `r985:${stamp}`,
          state: 'FAILED',
          failure: 'DELIVERY',
        },
      })
    ).id;
    ids.application = (
      await prisma.expertApplication.create({
        data: { fullName: 'Кандидат', email: `r985-app-${stamp}@example.org`, degree: 'к. т. н.', fields: 'Сфера', experience: 'Опыт', consentVersion: 'v1' },
      })
    ).id;
    ids.feedback = (
      await prisma.feedback.create({
        data: { area: 'CABINET', pathTemplate: '/cabinet', text: 'Замечание', device: 'desktop', severityAuto: 'LOW', severity: 'LOW' },
      })
    ).id;
    await prisma.user.update({ where: { id: ids.client }, data: { telegramChatId: `r985-${stamp}`, notifyTelegram: true } });

    const objects = [ids.expired, ids.stage, ids.handed, ids.returned].map((id) => `'${id}'`).join(', ');
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN ` +
        `IF NEW."actorId" IN (${people().map((id) => `'${id}'`).join(', ')}) OR NEW."objectId" IN (${objects}) ` +
        `THEN RAISE EXCEPTION 'сбой журнала'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    delete process.env.APPROVAL_AUTO_ACCEPT;
    const works = [ids.work!, ids.done!];
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: people() } }, { projectId: { in: works } }, { objectId: { in: [ids.expired!] } }] } });
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: people() } }, { projectId: { in: works } }] } });
    await prisma.recommendationMark.deleteMany({ where: { key: KEY } });
    await prisma.lead.deleteMany({ where: { OR: [{ id: ids.lead }, { contact: { contains: `r985-cli-${stamp}` } }] } });
    await prisma.feedback.deleteMany({ where: { id: ids.feedback } });
    await prisma.expertApplication.deleteMany({ where: { id: ids.application } });
    await prisma.assignment.deleteMany({ where: { OR: [{ createdById: ids.head }, { assigneeId: { in: people() } }] } });
    await prisma.message.deleteMany({ where: { OR: [{ projectId: { in: works } }, { authorId: { in: people() } }] } });
    await prisma.messageThreadRead.deleteMany({ where: { userId: { in: people() } } });
    await prisma.workRating.deleteMany({ where: { projectId: { in: works } } });
    await prisma.headCheck.deleteMany({ where: { projectId: { in: works } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: works } } });
    await prisma.stageStateChange.deleteMany({ where: { stage: { projectId: { in: works } } } });
    await prisma.project.deleteMany({ where: { id: { in: works } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.profile!, ids.source!, ids.target!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.loginToken.deleteMany({ where: { userId: { in: people() } } });
    await prisma.user.deleteMany({ where: { id: { in: people() } } });
    await prisma.practiceSetting.deleteMany({ where: { key: { in: settingsKeys }, updatedById: { in: people() } } });
  });

  it('«б»: заявка, дело руководителя, анкета, замечание о кабинете, очередь, оценка, принятие замечаний, роль куратора, отвязка Telegram', async () => {
    await assert.rejects(leads.setLeadStatus(head(), ids.lead!, 'IN_PROGRESS'), /сбой журнала/u);
    await assert.rejects(leads.editLead(head(), ids.lead!, { topic: 'Другая тема' }), /сбой журнала/u);
    await assert.rejects(leads.addLeadComment(head(), ids.lead!, 'Комментарий'), /сбой журнала/u);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: ids.lead }, include: { comments: true } });
    assert.equal(lead.status, 'NEW', 'смена состояния заявки без строки журнала');
    assert.equal(lead.firstResponseAt, null, 'первый ответ без строки журнала');
    assert.equal(lead.topic, 'Тема');
    assert.equal(lead.comments.length, 0);

    await assert.rejects(checks.closeCheck(head(), ids.check!, 'не требуется'), /сбой журнала/u);
    assert.equal((await prisma.headCheck.findUniqueOrThrow({ where: { id: ids.check } })).closedAt, null);

    await assert.rejects(applications.reviewExpertApplication(head(), ids.application!, { status: 'INVITED', note: 'Позвать' }), /сбой журнала/u);
    assert.equal((await prisma.expertApplication.findUniqueOrThrow({ where: { id: ids.application } })).status, 'NEW');

    await assert.rejects(feedback.reviewFeedback(head(), ids.feedback!, { status: 'FIXED', severity: 'HIGH', note: 'Исправлено' }), /сбой журнала/u);
    const shot = await prisma.feedback.findUniqueOrThrow({ where: { id: ids.feedback } });
    assert.deepEqual([shot.status, shot.severity, shot.resolvedAt], ['NEW', 'LOW', null]);

    // Пауза повтора считается по журналу: строка остаётся «не доставлено».
    await assert.rejects(outbox.retryFailed(head(), ids.failed!), /сбой журнала/u);
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: ids.failed } })).state, 'FAILED');

    // Оценку изменить нельзя: оставшаяся без строки журнала так и стояла бы.
    await assert.rejects(ratings.rateWork(client(), { projectId: ids.done!, score: '5', text: '', publishAllowed: false }), /сбой журнала/u);
    assert.equal(await prisma.workRating.count({ where: { projectId: ids.done } }), 0);

    await assert.rejects(projects.acknowledgeReturn(manager(), ids.returned!), /сбой журнала/u);
    assert.equal((await prisma.stage.findUniqueOrThrow({ where: { id: ids.returned } })).returnAckAt, null);

    await assert.rejects(projects.assignExpert(head(), ids.work!, ids.curator!, 'METHODOLOGIST'), /сбой журнала/u);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: ids.work } })).expertRole, 'SUBJECT_EXPERT');

    await assert.rejects(auth.unbindTelegram(client()), /сбой журнала/u);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.client } })).telegramChatId, `r985-${stamp}`);
  });

  it('«в»: поручения, сдача этапа, внутренние ветки, замечания с письмами — ни записи, ни письма', async () => {
    const before = await letters();
    await assert.rejects(
      assignments.createAssignment(head(), { assigneeId: ids.manager!, text: 'Новое поручение', dueOn: new Date(Date.UTC(2031, 1, 1)), projectCode: null }),
      /сбой журнала/u,
    );
    assert.equal(await prisma.assignment.count({ where: { text: 'Новое поручение' } }), 0);
    await assert.rejects(assignments.setAssignmentStatus(manager(), ids.assignment!, 'DONE'), /сбой журнала/u);
    assert.equal((await prisma.assignment.findUniqueOrThrow({ where: { id: ids.assignment } })).status, 'ASSIGNED');

    await assert.rejects(handover.handOverStage(curator(), ids.stage!, 'Что сделано'), /сбой журнала/u);
    assert.equal((await prisma.stage.findUniqueOrThrow({ where: { id: ids.stage } })).handedOverAt, null);
    await assert.rejects(handover.recallHandover(curator(), ids.handed!), /сбой журнала/u);
    await assert.rejects(handover.handBackStage(manager(), ids.handed!, 'Доработать'), /сбой журнала/u);
    const handed = await prisma.stage.findUniqueOrThrow({ where: { id: ids.handed } });
    assert.ok(handed.handedOverAt instanceof Date, 'отзыв или возврат без строки журнала');
    assert.equal(handed.handbackReason, null);
    assert.equal(await prisma.projectEvent.count({ where: { projectId: ids.work } }), 0, 'событие истории без строки журнала');

    await assert.rejects(messages.sendInternal(manager(), ids.work!, 'Внутреннее'), /сбой журнала/u);
    await assert.rejects(messages.sendCurator(curator(), ids.work!, 'Вопрос куратора'), /сбой журнала/u);
    await assert.rejects(messages.sendStaff(manager(), ids.manager!, 'Вопрос руководителю'), /сбой журнала/u);
    assert.equal(await prisma.message.count({ where: { authorId: { in: people() } } }), 0);
    assert.equal(await prisma.messageThreadRead.count({ where: { userId: { in: people() } } }), 0, 'курсор прочтения без сообщения');

    await assert.rejects(materials.addComment(client(), ids.version!, 'Замечание клиента'), /сбой журнала/u);
    assert.equal(await prisma.versionComment.count({ where: { versionId: ids.version, authorId: ids.client } }), 0);
    await assert.rejects(materials.moderateComment(manager(), ids.comment!, 'PUBLISHED'), /сбой журнала/u);
    assert.equal((await prisma.versionComment.findUniqueOrThrow({ where: { id: ids.comment } })).moderationStatus, 'PENDING');

    assert.equal(await letters(), before, 'письмо о действии без строки журнала');
  });

  it('«в»: заявка из кабинета по ссылке сотрудника, привязка Telegram, рекомендация, сведение карточек, автозакрытие этапа', async () => {
    const topic = `Заявка Р-985 ${stamp}`;
    await assert.rejects(
      queries.createCabinetRequest(
        { ...client(), viaStaffLink: true },
        { topic, need: null, deadline: null, message: null, ip: '127.0.0.1', consent: true, terms: true },
        'v-site',
      ),
      /сбой журнала/u,
    );
    assert.equal(await prisma.lead.count({ where: { topic } }), 0, 'заявка без строки журнала');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.client } })).consentAcceptedAt, null, 'согласие без заявки');

    // Метка привязки остаётся непогашенной: человек отправит /start ещё раз.
    process.env.TELEGRAM_BOT_USERNAME ??= 'r985_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET ??= 'w'.repeat(40);
    await prisma.user.update({ where: { id: ids.curator }, data: { telegramChatId: null } });
    const link = await auth.createTelegramBindLink(ids.curator!);
    assert.ok(link !== null);
    const value = new URL(link).searchParams.get('start')!;
    await assert.rejects(auth.bindTelegram(value, `r985-chat-${stamp}`), /сбой журнала/u);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.curator } })).telegramChatId, null);
    assert.equal(await prisma.loginToken.count({ where: { userId: ids.curator, purpose: 'BIND_TELEGRAM', usedAt: { not: null } } }), 0);

    await assert.rejects(recommendations.markRecommendation(head(), KEY, 'DONE'), /сбой журнала/u);
    assert.equal(await prisma.recommendationMark.count({ where: { key: KEY } }), 0);

    await assert.rejects(importing.mergeClients(head(), ids.source!, ids.target!), /сбой журнала/u);
    assert.equal((await prisma.clientProfile.findUniqueOrThrow({ where: { id: ids.source } })).mergedIntoId, null);

    // Автозакрытие — без действующего лица: запрет стоит на объекте.
    process.env.APPROVAL_AUTO_ACCEPT = '1';
    await assert.rejects(approval.autoAcceptExpired(), /сбой журнала/u);
    const expired = await prisma.stage.findUniqueOrThrow({ where: { id: ids.expired } });
    assert.equal(expired.state, 'IN_APPROVAL', 'этап закрыт без строки журнала');
    assert.equal(await prisma.stageStateChange.count({ where: { stageId: ids.expired } }), 0);
    assert.equal(await prisma.headCheck.count({ where: { stageId: ids.expired } }), 0, 'дело «акт и счёт» без строки журнала');
    assert.equal(await prisma.notificationOutbox.count({ where: { projectId: ids.work, eventKind: 'STAGE_APPROVED' } }), 0);
    delete process.env.APPROVAL_AUTO_ACCEPT;
  });

  it('без запрета журнала те же действия пишут и запись, и строку, и письмо', async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "AuditEvent"`);
    await leads.setLeadStatus(head(), ids.lead!, 'IN_PROGRESS');
    assert.equal(await prisma.auditEvent.count({ where: { action: 'LEAD_STATUS_CHANGED', objectId: ids.lead } }), 1);

    const created = await assignments.createAssignment(head(), {
      assigneeId: ids.manager!,
      text: 'Новое поручение',
      dueOn: new Date(Date.UTC(2031, 1, 1)),
      projectCode: null,
    });
    assert.equal(await prisma.auditEvent.count({ where: { action: 'ASSIGNMENT_CREATED', objectId: created.id } }), 1);
    assert.equal(await prisma.notificationOutbox.count({ where: { dedupKey: { startsWith: `assignment:${created.id}:created:` } } }), 1);

    const message = await messages.sendInternal(manager(), ids.work!, 'Внутреннее');
    assert.equal(await prisma.auditEvent.count({ where: { action: 'MESSAGE_SENT', objectId: message.id } }), 1);
    // Сигнал руководителю ставится: новое сообщение видно счёту в транзакции.
    assert.equal(await prisma.notificationOutbox.count({ where: { userId: ids.head, dedupKey: { startsWith: `thread:${message.id}:${ids.head}:` } } }), 1);

    const comment = await materials.moderateComment(manager(), ids.comment!, 'PUBLISHED');
    assert.equal(comment.moderationStatus, 'PUBLISHED');
    assert.equal(await prisma.auditEvent.count({ where: { action: 'COMMENT_PUBLISHED', objectId: ids.comment } }), 1);
    assert.equal(await prisma.notificationOutbox.count({ where: { dedupKey: { startsWith: `expert-decision:comment:${ids.comment}:` } } }), 1);
  });
});
