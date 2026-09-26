/**
 * Вход и границы доступа на настоящей базе (решение Р-251): частота ссылок
 * входа держится при параллельных запросах, чужие узлы не запирают
 * владельца адреса на его узле, страница входа видит владельца ссылки,
 * сессия не живёт дольше абсолютного предела, смена роли гасит выданные
 * ссылки; менеджер не видит заявок чужих работ и чужой загрузки экспертов;
 * клиент не видит списанных и сторнированных траншей, эксперт без договора
 * — работ в начислениях; контакт в имени файла любой версии не
 * принимается; замечание — только к живой версии и видимому документу;
 * куратор переноса книги, тип и название одобрения, договор эксперта и
 * перевод состояния работы проверяются словами.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'l'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-acl-'));

const enabled = Boolean(process.env.DATABASE_URL);

describe('вход и границы доступа (Р-251)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const auth = await import('../src/lib/cabinet/auth.ts');
  const token = await import('../src/lib/cabinet/token.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const { applyBatch } = await import('../src/lib/cabinet/import/apply.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  // Узлы проверки — свои на каждый прогон: счёт по IP общий для всей базы.
  const net = `10.${(stamp >> 8) & 255}.${stamp & 255}`;
  const ids: Record<string, string> = {};
  const emails: string[] = [];
  const leads: string[] = [];
  const projectIds: string[] = [];
  const typeIds: string[] = [];
  const batches: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const mine = () => who(ids.manager!, 'MANAGER');
  const other = () => who(ids.other!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const expert = () => who(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date('2026-01-01') });

  const person = async (tag: string, role: Actor['role']) => {
    const email = `acl-${tag}-${stamp}@example.org`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, fullName: `Лицо ${tag}`, role } });
    return user.id;
  };
  const newProject = async (suffix: string, managerId: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-AL-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Проверка доступа ${suffix}`,
        managerId,
        ...extra,
      },
    });
    projectIds.push(project.id);
    return project.id;
  };
  const newLead = async (extra: Record<string, unknown> = {}) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'landing',
        form: 'request',
        contactKind: 'email',
        contact: `acl-lead-${stamp}-${leads.length}@example.org`,
        name: `Заявитель ${tail}`,
        consentGiven: true,
        consentVersion: 'test',
        ...extra,
      },
    });
    leads.push(lead.id);
    return lead.id;
  };

  before(async () => {
    ids.head = await person('head', 'HEAD');
    ids.manager = await person('mgr', 'MANAGER');
    ids.other = await person('oth', 'MANAGER');
    ids.expert = await person('exp', 'EXPERT');
    ids.clientUser = await person('cli', 'CLIENT');
    ids.login = await person('login', 'CLIENT');
    await prisma.expertProfile.create({ data: { userId: ids.expert, ndaSignedAt: new Date('2026-01-01') } });
    const type = await prisma.serviceType.create({ data: { code: `acl-${stamp}`, name: 'Проверка доступа' } });
    const retired = await prisma.serviceType.create({
      data: { code: `acl-old-${stamp}`, name: 'Выведенный тип', isActive: false },
    });
    typeIds.push(type.id, retired.id);
    ids.type = type.id;
    ids.retired = retired.id;
    const profile = await prisma.clientProfile.create({
      data: { userId: ids.clientUser, fullName: 'Клиент', normalizedName: `acl клиент ${stamp}` },
    });
    ids.client = profile.id;
    ids.mine = await newProject('M', ids.manager, { expertId: ids.expert });
    ids.foreign = await newProject('F', ids.other, { expertId: ids.expert });
  });

  after(async () => {
    const users = [ids.head, ids.manager, ids.other, ids.expert, ids.clientUser, ids.login].filter(
      (id): id is string => id !== undefined,
    );
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: { in: emails } } });
    await prisma.loginAttempt.deleteMany({ where: { ip: { startsWith: `${net}.` } } });
    await prisma.importBatch.deleteMany({ where: { id: { in: batches } } });
    await prisma.leadAttachment.deleteMany({ where: { leadId: { in: leads } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.versionComment.deleteMany({ where: { version: { material: { projectId: { in: projectIds } } } } });
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: { in: projectIds } } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.expertPayout.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projectIds } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: { in: typeIds } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.loginToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { objectId: { in: [...users, ...leads] } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  // ── Вход ────────────────────────────────────────────────────────────────

  /** Запрос ссылки при «настроенной» почте; письмо не отправляется вовсе. */
  const request = async (email: string, ip: string) => {
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      return await auth.requestLoginLink(email, ip, { defer: () => undefined });
    } finally {
      delete process.env.SMTP_HOST;
    }
  };
  const issuedTo = (userId: string) =>
    prisma.loginToken.count({ where: { userId, purpose: 'LOGIN', createdAt: { gte: new Date(stamp) } } });
  const loginEmail = () => emails[5]!;

  it('двадцать параллельных запросов с одного узла дают не больше предела ссылок', async () => {
    // Прежде строка попытки писалась в отложенной отправке, после ответа:
    // параллельные запросы видели пустой счётчик и получали по ссылке.
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      const outcomes = await Promise.all(
        Array.from({ length: 20 }, () =>
          auth.requestLoginLink(loginEmail(), `${net}.1`, { defer: () => undefined }),
        ),
      );
      const issued = await issuedTo(ids.login!);
      assert.equal(issued, token.RATE_PER_EMAIL_IP, `выдано ${issued} ссылок`);
      assert.equal(outcomes.filter((o) => o === 'rate_limited').length, 20 - token.RATE_PER_EMAIL_IP);
      // Попытка записана до отправки: исход «выдано» дописывается потом.
      const pending = await prisma.loginAttempt.count({
        where: { emailNormalized: loginEmail(), ip: `${net}.1`, outcome: 'issued' },
      });
      assert.equal(pending, token.RATE_PER_EMAIL_IP);
    } finally {
      delete process.env.SMTP_HOST;
    }
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: loginEmail() } });
  });

  it('параллельные запросы с разных узлов упираются в потолок адреса', async () => {
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          auth.requestLoginLink(loginEmail(), `${net}.${10 + i}`, { defer: () => undefined }),
        ),
      );
    } finally {
      delete process.env.SMTP_HOST;
    }
    assert.equal(await issuedTo(ids.login!), token.RATE_PER_EMAIL);
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: loginEmail() } });
  });

  it('чужие узлы, исчерпав потолок адреса, не запирают владельца на его узле', async () => {
    for (let i = 0; i < token.RATE_PER_EMAIL; i += 1) {
      await prisma.loginAttempt.create({
        data: { emailNormalized: loginEmail(), ip: `${net}.${100 + i}`, outcome: 'sent' },
      });
    }
    // Новый узел — отказ: потолок исчерпан.
    assert.equal(await request(loginEmail(), `${net}.200`), 'rate_limited');
    // Узел, с которого владелец уже входил, — ссылка выдаётся.
    await auth.createSession(ids.login!, `${net}.201`, null);
    assert.equal(await request(loginEmail(), `${net}.201`), 'sent');
    assert.equal(await issuedTo(ids.login!), 1);
    // Безымянный узел своим не считается, даже если сессия с него была.
    await auth.createSession(ids.login!, 'unknown', null);
    assert.equal(await request(loginEmail(), 'unknown'), 'rate_limited');
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: loginEmail(), ip: 'unknown' } });
    await prisma.session.deleteMany({ where: { userId: ids.login } });
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: loginEmail() } });
  });

  it('исход отправки дописывается в ту же строку попытки', async () => {
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      let task: (() => Promise<void>) | null = null;
      const outcome = await auth.requestLoginLink(loginEmail(), `${net}.2`, {
        defer: (next) => {
          task = next;
        },
      });
      assert.equal(outcome, 'sent');
      const rows = () => prisma.loginAttempt.findMany({ where: { emailNormalized: loginEmail(), ip: `${net}.2` } });
      assert.deepEqual((await rows()).map((r) => r.outcome), ['issued']);
      await (task as unknown as () => Promise<void>)();
      assert.deepEqual((await rows()).map((r) => r.outcome), ['send_failed']);
    } finally {
      delete process.env.SMTP_HOST;
    }
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: loginEmail() } });
  });

  const issueRaw = async (userId: string, extra: Record<string, unknown> = {}) => {
    const raw = token.createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: raw.selector,
        verifierHash: token.digest(raw.verifier),
        userId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        requestIp: `${net}.3`,
        ...extra,
      },
    });
    return raw;
  };

  it('страница входа видит владельца только действующей ссылки целиком', async () => {
    const raw = await issueRaw(ids.login!);
    assert.equal(await auth.loginLinkOwner(raw.value), `a***@example.org`);
    const forged = `${raw.selector}.${token.createRawToken().verifier}`;
    assert.equal(await auth.loginLinkOwner(forged), null, 'подделанный ключ назвал владельца');
    assert.equal(await auth.loginLinkOwner('мусор'), null);
    // Показ не гасит ключ: войти по нему после показа можно.
    const session = await auth.consumeLoginToken(raw.value, `${net}.3`, null);
    assert.ok(session);
    assert.equal(await auth.loginLinkOwner(raw.value), null, 'погашенная ссылка назвала владельца');
    const expired = await issueRaw(ids.login!, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal(await auth.loginLinkOwner(expired.value), null);
    await prisma.session.deleteMany({ where: { userId: ids.login } });
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
  });

  it('сессия не живёт дольше девяноста дней от входа, как бы её ни продлевали', async () => {
    const day = 24 * 60 * 60 * 1000;
    const old = await auth.createSession(ids.login!, `${net}.4`, null);
    await prisma.session.update({
      where: { tokenHash: token.digest(old) },
      data: { createdAt: new Date(Date.now() - 91 * day), expiresAt: new Date(Date.now() + 20 * day) },
    });
    assert.equal(await auth.resolveSession(old), null, 'сессия старше предела действует');

    const late = await auth.createSession(ids.login!, `${net}.4`, null);
    const createdAt = new Date(Date.now() - 89 * day);
    await prisma.session.update({
      where: { tokenHash: token.digest(late) },
      data: { createdAt, lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    assert.ok(await auth.resolveSession(late));
    const row = await prisma.session.findUniqueOrThrow({ where: { tokenHash: token.digest(late) } });
    assert.ok(
      row.expiresAt.getTime() <= createdAt.getTime() + token.SESSION_MAX_DAYS * day,
      'продление вышло за абсолютный предел',
    );
    await prisma.session.deleteMany({ where: { userId: ids.login } });
  });

  it('смена роли гасит выданные ссылки входа', async () => {
    const pending = await issueRaw(ids.login!);
    await admin.setUserRole(head(), ids.login!, 'EXPERT');
    assert.equal(await auth.consumeLoginToken(pending.value, `${net}.5`, null), null);
    await admin.setUserRole(head(), ids.login!, 'CLIENT');
    await prisma.loginToken.deleteMany({ where: { userId: ids.login } });
  });

  // ── Заявки и реестры ────────────────────────────────────────────────────

  it('менеджер не видит заявку, развёрнутую в чужую работу, и её вложения', async () => {
    const open = await newLead();
    const ours = await newLead({ projectId: ids.mine, status: 'CONTRACTED' });
    const theirs = await newLead({ projectId: ids.foreign, status: 'CONTRACTED' });
    const file = await prisma.leadAttachment.create({
      data: {
        leadId: theirs,
        storageKey: `acl/${stamp}/lead.pdf`,
        originalName: 'lead.pdf',
        sizeBytes: 10n,
        sha256: 'x'.repeat(64),
        contentType: 'application/pdf',
      },
    });

    assert.equal(await queries.leadById(mine(), theirs), null, 'чужая заявка открылась');
    assert.ok(await queries.leadById(mine(), ours));
    assert.ok(await queries.leadById(mine(), open));
    assert.ok(await queries.leadById(head(), theirs));
    assert.equal(await queries.readLeadAttachment(mine(), file.id), null, 'чужое вложение отдано');

    const listed = await queries.leadList(mine(), { query: `Заявитель ${tail}` });
    const seen = new Set(listed.rows.map((row) => row.id));
    assert.ok(seen.has(open) && seen.has(ours));
    assert.equal(seen.has(theirs), false, 'чужая заявка в перечне и выгрузке');
    assert.equal(listed.total, 2);
    const all = await queries.leadList(head(), { query: `Заявитель ${tail}` });
    assert.equal(all.total, 3);
  });

  it('загрузка эксперта в реестре менеджера — по его работам', async () => {
    const forManager = await queries.expertRegistry(mine());
    const row = forManager.find((r) => r.id === ids.expert);
    assert.equal(row?.total, 1, 'в число вошла чужая работа');
    const forHead = await queries.expertRegistry(head());
    assert.equal(forHead.find((r) => r.id === ids.expert)?.total, 2);
  });

  // ── Деньги ──────────────────────────────────────────────────────────────

  it('клиент не видит списанных и сторнированных траншей, итоги — по видимым', async () => {
    const contract = await prisma.contract.create({
      data: { projectId: ids.mine!, number: `AL-${tail}`, totalAmount: 100_000n },
    });
    for (const [status, amount] of [
      ['PLANNED', 10_000n],
      ['INVOICED', 20_000n],
      ['PAID', 30_000n],
      ['WRITTEN_OFF', 15_000n],
      ['REVERSED', 25_000n],
    ] as const) {
      await prisma.tranche.create({
        data: { contractId: contract.id, title: `Транш ${status}`, amount, status },
      });
    }
    const forClient = await finance.projectContract(client(), ids.mine!);
    assert.deepEqual(
      forClient?.tranches.map((t) => t.status).sort(),
      ['INVOICED', 'PAID', 'PLANNED'],
    );
    const money = await finance.projectMoney(client(), ids.mine!);
    assert.ok(money !== null);
    assert.equal(money.received, 30_000n);
    assert.equal(money.awaiting, 30_000n);
    assert.equal('writtenOff' in money, false, 'клиенту отдано списанное');

    const forHead = await finance.projectContract(head(), ids.mine!);
    assert.equal(forHead?.tranches.length, 5);
    const headMoney = await finance.projectMoney(head(), ids.mine!);
    assert.equal(headMoney?.writtenOff, 15_000n);
  });

  it('эксперт без договора видит суммы начислений, но не работу, этап и комментарий', async () => {
    await prisma.expertPayout.create({
      data: { projectId: ids.mine!, expertId: ids.expert!, amount: 7_000n, comment: `Глава клиента ${tail}` },
    });
    const withNda = await finance.ownPayouts(expert());
    assert.equal(withNda.rows[0]?.project?.code, `PD-AL-${tail}-M`);

    const closed = await finance.ownPayouts({ ...expert(), expertNdaSignedAt: null });
    assert.equal(closed.accrued, 7_000n);
    assert.equal(closed.rows.length, 1);
    const [row] = closed.rows;
    assert.equal(row?.project, null);
    assert.equal(row?.stage, null);
    assert.equal(row?.comment, null);
    assert.equal(row?.projectId, null);
    assert.equal(row?.amount, 7_000n);
  });

  // ── Материалы и замечания ───────────────────────────────────────────────

  const newVersion = async (materialExtra: Record<string, unknown> = {}, versionExtra: Record<string, unknown> = {}) => {
    const material = await prisma.material.create({
      data: { projectId: ids.mine!, title: 'Глава 1', createdById: ids.manager!, ...materialExtra },
    });
    const version = await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey: `acl/${stamp}/${material.id}`,
        originalName: 'glava1.docx',
        sizeBytes: 10n,
        sha256: 'x'.repeat(64),
        contentType: 'application/octet-stream',
        uploadedById: ids.manager!,
        ...versionExtra,
      },
    });
    return { material: material.id, version: version.id };
  };

  it('контакт в имени файла следующей версии не принимается', async () => {
    const { material } = await newVersion();
    const upload = (actor: Actor, originalName: string) =>
      materials.uploadVersion(actor, {
        projectId: ids.mine!,
        materialId: material,
        originalName,
        contentType: 'text/plain',
        body: Buffer.from('текст'),
      });
    await assert.rejects(() => upload(client(), 'глава +7 900 123-45-67.docx'), /имени файла есть телефон/u);
    await assert.rejects(() => upload(expert(), 'пишите t.me/somebody.docx'), /имени файла есть телефон/u);
    assert.equal(await prisma.materialVersion.count({ where: { materialId: material } }), 1);
  });

  it('замечание — только к живой версии и к документу, который виден', async () => {
    const removed = await newVersion({ deletedAt: new Date() });
    await assert.rejects(() => materials.addComment(client(), removed.version, 'Замечание'), /Материал удалён/u);
    const purged = await newVersion({}, { purgedAt: new Date() });
    await assert.rejects(() => materials.addComment(client(), purged.version, 'Замечание'), /Версия изъята/u);
    const invoice = await newVersion({ kind: 'INVOICE' });
    await assert.rejects(() => materials.addComment(expert(), invoice.version, 'Замечание'), AccessDenied);
    const note = await materials.addComment(client(), invoice.version, 'Уточните реквизиты.');
    assert.equal(note.moderationStatus, 'PUBLISHED');
  });

  // ── Проверки словами ────────────────────────────────────────────────────

  it('перенос книги не закрепляет работы за клиентом или приостановленным', async () => {
    const batch = await prisma.importBatch.create({
      data: { fileName: `acl-${stamp}.xlsx`, sha256: 'x'.repeat(64), uploadedById: ids.head!, state: 'PREVIEWED' },
    });
    batches.push(batch.id);
    await assert.rejects(
      () => applyBatch(head(), batch.id, { managerId: ids.clientUser! }),
      /Куратором может быть менеджер или руководитель/u,
    );
    await prisma.user.update({ where: { id: ids.other }, data: { status: 'SUSPENDED' } });
    try {
      await assert.rejects(
        () => applyBatch(head(), batch.id, { managerId: ids.other! }),
        /Куратором может быть/u,
      );
    } finally {
      await prisma.user.update({ where: { id: ids.other }, data: { status: 'ACTIVE' } });
    }
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    assert.equal(after.state, 'PREVIEWED', 'отказ зафиксировал загрузку');
  });

  it('одобрение проверяет тип сопровождения и название словами', async () => {
    const lead = await newLead();
    const approve = (serviceTypeId: string, title: string) =>
      projects.approveLead(mine(), { leadId: lead, serviceTypeId, managerId: ids.manager!, title });
    await assert.rejects(() => approve(ids.type!, '   '), /Название работы не указано/u);
    await assert.rejects(() => approve(`нет-${stamp}`, 'Работа'), /Тип сопровождения не найден/u);
    await assert.rejects(() => approve(ids.retired!, 'Работа'), /выведен из оборота/u);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead } });
    assert.equal(row.status, 'NEW', 'отказ захватил заявку');
    assert.equal(row.projectId, null);
  });

  it('договор поручения — только эксперту и не будущей датой', async () => {
    await assert.rejects(
      () => admin.signExpertNda(head(), ids.clientUser!, new Date('2026-01-01')),
      /только у эксперта/u,
    );
    const tomorrow = new Date(admin.moscowToday().getTime() + 24 * 60 * 60 * 1000);
    await assert.rejects(() => admin.signExpertNda(head(), ids.expert!, tomorrow), /позже сегодняшней/u);
    await admin.signExpertNda(head(), ids.expert!, admin.moscowToday());
    const profile = await prisma.expertProfile.findUniqueOrThrow({ where: { userId: ids.expert } });
    assert.equal(profile.ndaSignedAt?.getTime(), admin.moscowToday().getTime());
    assert.equal(await prisma.expertProfile.count({ where: { userId: ids.clientUser } }), 0);
  });

  it('два одновременных перевода работы из одного состояния — проходит один', async () => {
    const project = await newProject('S', ids.manager!);
    const results = await Promise.allSettled([
      projects.setProjectStatus(mine(), project, 'COMPLETED'),
      projects.setProjectStatus(mine(), project, 'CANCELLED'),
    ]);
    const done = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    assert.equal(done.length, 1);
    assert.equal(refused.length, 1);
    assert.match(String(refused[0]!.reason), /уже изменено другим действием|не переводится/u);
    const events = await prisma.projectEvent.count({
      where: { projectId: project, kind: 'PROJECT_STATUS_CHANGED' },
    });
    assert.equal(events, 1, 'в ленте два перехода из одного состояния');
  });
});
