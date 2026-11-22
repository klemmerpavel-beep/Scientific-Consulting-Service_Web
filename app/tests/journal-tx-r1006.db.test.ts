/**
 * Действия с файлами хранилища: строка журнала — в транзакции действия,
 * файл — по своему порядку (план доработки 19.11.2026, К-6; решение
 * Р-1006, завершение Р-937, Р-938, Р-967 и Р-985). На настоящей базе и
 * временном каталоге хранилища.
 *
 * Сбой записи журнала воспроизводится запретом на вставку строк журнала
 * от лиц проверки (триггер, как в `journal-tx-r967.db`); у переноса
 * вложений заявки — только строки о переносе: одобрение пишет свою строку
 * своей транзакцией. Сбой удаления объекта — хранилищем, которое отказывает
 * в удалении ключей под заданным префиксом.
 *
 * Для каждого из пяти действий: сбой журнала откатывает действие и не
 * оставляет файла — или оставляет ровно то, что описано в решении; сбой
 * удаления объекта действие не ломает, а оставшийся объект виден сверке
 * (Р-986) или чистке по сроку (`deploy/retention.sh`), либо назван в
 * «Чего решение не закрывает».
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 'k'.repeat(48);
const root = mkdtempSync(path.join(tmpdir(), 'pd-r1006-'));
process.env.CABINET_STORAGE_DIR = root;

const enabled = Boolean(process.env.DATABASE_URL);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('действия с файлами: журнал в транзакции, файл по порядку (Р-1006)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { LocalStorage, setStorage, sha256 } = await import('../src/lib/cabinet/storage.ts');
  const { checkStorage } = await import('../src/lib/cabinet/storage-check.ts');
  const materials = await import('../src/lib/cabinet/materials.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const applications = await import('../src/lib/cabinet/expert-applications.ts');
  const erasure = await import('../src/lib/cabinet/erasure.ts');
  const intake = await import('../src/lib/cabinet/brief/intake.ts');
  const work = await import('../src/lib/cabinet/brief/work-apply.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const fn = `pd_r1006_refuse_${stamp}`;
  const trigger = `pd_r1006_refuse_${stamp}`;
  const ids: Record<string, string> = {};
  const works: string[] = [];
  const leads: string[] = [];
  const emails: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({ id, role, status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const people = () => [ids.head!, ids.manager!];

  // Хранилище с отказом удаления под префиксом и с вмешательством перед
  // записью (чужая загрузка между номером и транзакцией): остальное — как у диска.
  const inner = new LocalStorage(root);
  let failRemove: RegExp | null = null;
  let beforePut: (() => Promise<unknown>) | null = null;
  setStorage({
    put: async (key, body) => {
      const hook = beforePut;
      beforePut = null;
      if (hook !== null) await hook();
      return inner.put(key, body);
    },
    get: (key) => inner.get(key),
    open: (key) => inner.open(key),
    remove: (key) => (failRemove?.test(key) ? Promise.reject(Object.assign(new Error('отказ диска'), { code: 'EACCES' })) : inner.remove(key)),
    signedUrl: () => inner.signedUrl(),
    list: (prefix) => inner.list(prefix),
    stat: (key) => inner.stat(key),
  });
  const keysUnder = async (prefix: string) => (await inner.list(prefix)).map((object) => object.key);
  const gapsOf = async (prefix: string) =>
    (await checkStorage(prisma, inner)).gaps.filter((gap) => gap.key.startsWith(prefix)).map((gap) => gap.kind);

  // Журнал сервера: сбой удаления объекта уходит туда с ключом.
  const logged: string[] = [];
  const consoleError = console.error;

  /** Запрет строк журнала от лиц проверки; `action` — только этого вида. */
  const block = async (action: string | null) => {
    const only = action === null ? '' : ` AND NEW."action" = '${action}'`;
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN ` +
        `IF NEW."actorId" IN (${people().map((id) => `'${id}'`).join(', ')})${only} ` +
        `THEN RAISE EXCEPTION 'сбой журнала'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
  };
  const unblock = () => prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql`);

  /** Ключи изъятых объектов, которые повторно удаляет чистка по сроку. */
  const purgedKeys = async () => {
    const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'retention.sh'), 'utf8');
    const line = script.split('\n').find((text) => text.startsWith('SQL_PURGED_KEYS="'))!;
    const sql = line.slice('SQL_PURGED_KEYS="'.length, -1).replace(/\\"/gu, '"');
    return (await prisma.$queryRawUnsafe<{ storageKey: string }[]>(sql)).map((row) => row.storageKey);
  };

  const newWork = async (suffix: string, clientId: string, status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE') => {
    const project = await prisma.project.create({
      data: {
        code: `PD-K6${suffix}-${tail}`,
        clientId,
        serviceTypeId: ids.type!,
        title: `Работа К-6 ${suffix}`,
        topic: 'Прежняя тема',
        managerId: ids.manager!,
        status,
        stages: { create: [{ position: 1, title: 'Исходные данные', state: 'IN_PROGRESS' }] },
      },
      include: { stages: true },
    });
    works.push(project.id);
    return project;
  };

  const newLead = async (suffix: string, contact: string, projectId: string | null = null) => {
    const lead = await prisma.lead.create({
      data: { source: 'site', form: 'request', name: 'Заявитель К-6', contactKind: 'email', contact, topic: 'Тема', consentGiven: true, consentVersion: 'v1', projectId },
    });
    leads.push(lead.id);
    const body = Buffer.from(`вложение ${suffix}`);
    const key = `leads/${lead.id}/${suffix}.txt`;
    await inner.put(key, body);
    await prisma.leadAttachment.create({
      data: { leadId: lead.id, storageKey: key, originalName: `вложение-${suffix}.txt`, sizeBytes: BigInt(body.length), sha256: sha256(body), contentType: 'text/plain' },
    });
    return { lead, key };
  };

  before(async () => {
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `r1006-${suffix}-${stamp}@example.org`, fullName: `Сотрудник ${suffix}`, role, status: 'SUSPENDED' } });
    ids.head = (await make('head', 'HEAD')).id;
    ids.manager = (await make('mgr', 'MANAGER')).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `r1006-${stamp}`, name: `Тип Р-1006 ${stamp}` } })).id;
    ids.client = (await prisma.clientProfile.create({ data: { fullName: 'Клиент К-6', normalizedName: `r1006 клиент ${stamp}` } })).id;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  });

  after(async () => {
    console.error = consoleError;
    setStorage(null);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    const born = await prisma.project.findMany({ where: { lead: { is: { id: { in: leads } } } }, select: { id: true, clientId: true } });
    const all = [...works, ...born.map((project) => project.id)];
    const clients = await prisma.clientProfile.findMany({
      where: { OR: [{ id: ids.client }, { id: { in: born.map((project) => project.clientId) } }, { user: { email: { in: emails } } }] },
      select: { id: true, userId: true },
    });
    const users = [...people(), ...clients.flatMap((client) => (client.userId === null ? [] : [client.userId]))];
    await prisma.auditEvent.deleteMany({
      where: { OR: [{ actorId: { in: users } }, { projectId: { in: all } }, { objectId: { in: [...leads, ...Object.values(ids)] } }] },
    });
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: { in: all } }, { leadId: { in: leads } }] } });
    await prisma.erasureRequest.deleteMany({ where: { clientId: { in: clients.map((client) => client.id) } } });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.expertApplication.deleteMany({ where: { email: { startsWith: `r1006-app-${stamp}` } } });
    await prisma.project.deleteMany({ where: { id: { in: all } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients.map((client) => client.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
  });

  it('загрузка версии: сбой журнала — ни строк, ни писем, ни файла; отказ уборки — файл без версии, его видит сверка', async () => {
    const project = await newWork('U', ids.client!);
    const prefix = `projects/${project.id}/`;
    const upload = (body: string, materialId: string | null = null) =>
      materials.uploadVersion(manager(), {
        projectId: project.id,
        stageId: project.stages[0]!.id,
        materialId,
        title: 'Глава К-6',
        note: materialId === null ? 'Пояснение к первой версии' : null,
        originalName: 'glava.docx',
        contentType: DOCX,
        body: Buffer.from(body),
      });

    await block(null);
    await assert.rejects(upload('первая'), /сбой журнала/u);
    assert.equal(await prisma.material.count({ where: { projectId: project.id } }), 0, 'материал без строки журнала');
    assert.equal(await prisma.fileAccessLog.count({ where: { userId: ids.manager } }), 0, 'журнал доступа без версии');
    assert.equal(await prisma.notificationOutbox.count({ where: { projectId: project.id } }), 0, 'письмо о версии без строки журнала');
    assert.deepEqual(await keysUnder(prefix), [], 'файл остался после отката');

    // Уборка не удалась: остаётся ровно файл без версии — сверка его видит.
    failRemove = /^projects\//u;
    await assert.rejects(upload('первая'), /сбой журнала/u);
    failRemove = null;
    const [orphan] = await keysUnder(prefix);
    assert.ok(orphan !== undefined);
    assert.deepEqual(await gapsOf(prefix), ['ORPHAN']);
    assert.ok(logged.some((line) => line.includes(orphan)), 'ключ неубранного объекта — в журнале сервера');
    await inner.remove(orphan);

    await unblock();
    const first = await upload('первая');
    assert.equal(first.number, 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: 'VERSION_UPLOADED', objectId: first.id } }), 1);
    assert.equal(await prisma.fileAccessLog.count({ where: { versionId: first.id, action: 'UPLOAD' } }), 1);
    assert.equal(await prisma.versionComment.count({ where: { versionId: first.id } }), 1, 'пояснение — с версией');
    assert.deepEqual(await keysUnder(prefix), [first.storageKey]);
    assert.deepEqual(await gapsOf(prefix), []);

    // Номер взят до записи файла; пока файл пишется, другая загрузка того
    // же материала занимает его. Транзакция сверяет номер: объект этой
    // загрузки убирается, она повторяется со следующим номером.
    let other: Awaited<ReturnType<typeof upload>> | null = null;
    beforePut = async () => {
      other = await upload('вторая', first.materialId);
    };
    const late = await upload('третья', first.materialId);
    assert.deepEqual([other!.number, late.number], [2, 3]);
    assert.deepEqual((await keysUnder(prefix)).sort(), [first.storageKey, other!.storageKey, late.storageKey].sort(), 'объект первой попытки не убран');
    assert.deepEqual(await gapsOf(prefix), []);

    // Две загрузки разом: номер, занятый другой, берётся следующий; у каждой
    // версии свой файл, сирот нет.
    const both = await Promise.all([upload('четвёртая', first.materialId), upload('пятая', first.materialId)]);
    assert.deepEqual(both.map((version) => version.number).sort(), [4, 5]);
    assert.equal((await keysUnder(prefix)).length, 5);
    assert.deepEqual(await gapsOf(prefix), []);
  });

  it('документ исходных данных: сбой журнала — ни правки карточки, ни версии, ни файла, документ остаётся для повтора', async () => {
    const project = await newWork('B', ids.client!);
    const prefix = `projects/${project.id}/`;
    const doc = makeDocx(['Вариант 1. Первая тема', 'Цель работы: Первая цель.', 'Вариант 2. Вторая тема', 'Цель работы: Вторая цель.', 'Университет - Вуз из документа']);
    const ref = await intake.stageBrief(manager(), 'REQUEST_MODERATE', 'Исходные.docx', doc);
    const apply = () =>
      work.applyWorkBrief(manager(), { projectId: project.id, ref, variant: 0, apply: ['topic', 'summary', 'university'], stageId: project.stages[0]!.id });

    // Отказывает последняя из трёх строк журнала: правка карточки и версия
    // к этому времени записаны той же транзакцией и откатываются с ней.
    await block('BRIEF_APPLIED');
    await assert.rejects(apply(), /сбой журнала/u);
    assert.equal(await prisma.auditEvent.count({ where: { projectId: project.id } }), 0, 'строка журнала без действия');
    const kept = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { topic: true, summary: true, client: { select: { university: true } } } });
    assert.deepEqual([kept.topic, kept.summary, kept.client.university], ['Прежняя тема', null, null], 'карточка исправлена без строки журнала');
    assert.equal(await prisma.material.count({ where: { projectId: project.id } }), 0);
    assert.deepEqual(await keysUnder(prefix), [], 'файл версии остался после отката');
    assert.ok((await intake.loadBrief(manager(), 'REQUEST_MODERATE', ref)) !== null, 'документ пропал: повтор невозможен');

    // Без запрета — всё одной транзакцией; временный объект не убран —
    // его удалит чистка по сроку (старше суток), действие не ломается.
    await unblock();
    failRemove = /^briefs\//u;
    const result = await apply();
    failRemove = null;
    assert.equal(result.attached, true);
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { topic: true, client: { select: { university: true } } } });
    assert.deepEqual([saved.topic, saved.client.university], ['Первая тема', 'Вуз из документа']);
    for (const action of ['PROJECT_EDITED', 'VERSION_UPLOADED', 'BRIEF_APPLIED']) {
      assert.equal(await prisma.auditEvent.count({ where: { projectId: project.id, action } }), 1, action);
    }
    assert.equal((await keysUnder(prefix)).length, 1);
    assert.deepEqual(await gapsOf(prefix), []);
    assert.equal((await keysUnder(`briefs/${ids.manager}/`)).length, 1, 'временный объект при отказе удаления остаётся');
    assert.match(readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'retention.sh'), 'utf8'), /find "\$DIR\/storage\/briefs" -type f -mmin \+1440/u);
  });

  it('перенос вложений заявки: сбой журнала — одобрение стоит, вложения при заявке, копий нет; отказ удаления исходного — его повторит чистка', async () => {
    const contact = `r1006-lead-${stamp}@example.org`;
    emails.push(contact);
    const { lead, key } = await newLead('a', contact);
    await block('LEAD_FILES_MOVED');
    const project = await projects.approveLead(manager(), { leadId: lead.id, serviceTypeId: ids.type!, managerId: ids.manager!, title: 'Работа из заявки К-6' });
    assert.equal(await prisma.auditEvent.count({ where: { action: 'LEAD_APPROVED', objectId: lead.id } }), 1, 'одобрение — своей строкой');
    assert.equal(await prisma.material.count({ where: { projectId: project.id } }), 0, 'материал без строки журнала');
    const kept = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: lead.id } });
    assert.deepEqual([kept.materialId, kept.purgedAt], [null, null], 'вложение помечено перенесённым без строки журнала');
    assert.deepEqual(await keysUnder(`leads/${lead.id}/`), [key], 'исходный объект удалён без переноса');
    assert.deepEqual(await keysUnder(`projects/${project.id}/`), [], 'копия осталась после отката');

    const other = `r1006-lead2-${stamp}@example.org`;
    emails.push(other);
    const second = await newLead('b', other);
    await unblock();
    failRemove = /^leads\//u;
    const moved = await projects.approveLead(manager(), { leadId: second.lead.id, serviceTypeId: ids.type!, managerId: ids.manager!, title: 'Вторая работа К-6' });
    failRemove = null;
    const attachment = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId: second.lead.id } });
    assert.ok(attachment.materialId !== null && attachment.purgedAt !== null);
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'LEAD_FILES_MOVED', objectId: second.lead.id } });
    assert.deepEqual(journal.payload, { count: 1, failed: 0 });
    assert.equal((await keysUnder(`projects/${moved.id}/`)).length, 1);
    assert.deepEqual(await gapsOf(`projects/${moved.id}/`), []);
    // Исходный объект остался: вложение изъято, ключ выбирает чистка по сроку.
    assert.deepEqual(await keysUnder(`leads/${second.lead.id}/`), [second.key]);
    assert.ok((await purgedKeys()).includes(second.key), 'чистка по сроку не найдёт оставшийся объект');
    // До срока чистки сверка о нём молчит, после — видит (Р-1007).
    assert.deepEqual(await gapsOf(`leads/${second.lead.id}/`), []);
    assert.deepEqual(
      (await checkStorage(prisma, inner, new Date(Date.now() + 9 * 24 * 60 * 60 * 1000))).gaps.filter((gap) => gap.key === second.key).map((gap) => [gap.section, gap.kind]),
      [['LEADS', 'PURGED_KEPT']],
    );
    assert.ok(logged.some((line) => line.includes(second.key)));
  });

  it('удаление анкеты: сбой журнала — анкета и файлы на месте; отказ удаления объекта действие не ломает', async () => {
    const create = async (suffix: string) => {
      const application = await prisma.expertApplication.create({
        data: { fullName: 'Кандидат К-6', email: `r1006-app-${stamp}-${suffix}@example.org`, degree: 'к. т. н.', fields: 'Сфера', experience: 'Опыт', consentVersion: 'v1' },
      });
      const body = Buffer.from(`резюме ${suffix}`);
      const key = `experts/${application.id}/${suffix}.pdf`;
      await inner.put(key, body);
      await prisma.expertApplicationFile.create({
        data: { applicationId: application.id, storageKey: key, originalName: 'Резюме.pdf', sizeBytes: BigInt(body.length), sha256: sha256(body), contentType: 'application/pdf' },
      });
      return { id: application.id, key };
    };
    const first = await create('a');
    await block(null);
    await assert.rejects(applications.deleteExpertApplication(head(), first.id), /сбой журнала/u);
    assert.equal(await prisma.expertApplicationFile.count({ where: { applicationId: first.id } }), 1, 'анкета удалена без строки журнала');
    assert.deepEqual(await keysUnder(`experts/${first.id}/`), [first.key], 'файл удалён без строки журнала');

    await unblock();
    await applications.deleteExpertApplication(head(), first.id);
    assert.equal(await prisma.expertApplication.count({ where: { id: first.id } }), 0);
    assert.deepEqual(await keysUnder(`experts/${first.id}/`), []);

    const second = await create('b');
    failRemove = /^experts\//u;
    await applications.deleteExpertApplication(head(), second.id);
    failRemove = null;
    assert.equal(await prisma.expertApplication.count({ where: { id: second.id } }), 0);
    assert.equal(await prisma.auditEvent.count({ where: { action: 'EXPERT_APPLICATION_DELETED', objectId: second.id } }), 1);
    // Объект остался без строки: ключ — в журнале сервера, файл без записи
    // анкеты видит сверка (Р-1007; прежде анкеты были вне сверки).
    assert.deepEqual(await keysUnder(`experts/${second.id}/`), [second.key]);
    assert.deepEqual(await gapsOf(`experts/${second.id}/`), ['ORPHAN']);
    assert.ok(logged.some((line) => line.includes(second.key)));
    await inner.remove(second.key);
  });

  it('исполнение требования об удалении: сбой журнала — ничего не затёрто и не удалено; отказ хранилища — данные затёрты, объекты видны сверке и чистке', async () => {
    const email = `r1006-subject-${stamp}@example.org`;
    const subject = await prisma.clientProfile.create({
      data: { fullName: 'Субъект Удаления', normalizedName: `r1006 субъект ${stamp}`, email },
    });
    const project = await newWork('E', subject.id, 'COMPLETED');
    await prisma.contract.create({ data: { projectId: project.id, number: `Д-К6-${stamp}`, totalAmount: 1_000_00n } });
    const material = await prisma.material.create({ data: { projectId: project.id, title: 'Глава субъекта', createdById: ids.manager! } });
    const body = Buffer.from('текст главы');
    const versionKey = `projects/${project.id}/materials/${material.id}/v1/${stamp}.docx`;
    await inner.put(versionKey, body);
    const version = await prisma.materialVersion.create({
      data: { materialId: material.id, number: 1, storageKey: versionKey, originalName: 'Субъект — глава.docx', sizeBytes: BigInt(body.length), sha256: sha256(body), contentType: DOCX, uploadedById: ids.manager! },
    });
    const { key: leadKey } = await newLead('e', email);
    const request = await erasure.requestErasure(head(), subject.id);

    await block(null);
    await assert.rejects(erasure.executeErasure(head(), request.id), /сбой журнала/u);
    assert.equal((await prisma.erasureRequest.findUniqueOrThrow({ where: { id: request.id } })).executedAt, null);
    assert.equal((await prisma.clientProfile.findUniqueOrThrow({ where: { id: subject.id } })).fullName, 'Субъект Удаления');
    assert.equal((await prisma.materialVersion.findUniqueOrThrow({ where: { id: version.id } })).purgedAt, null);
    assert.equal(await prisma.fileAccessLog.count({ where: { versionId: version.id } }), 0, 'изъятие в журнале доступа без исполнения');
    assert.deepEqual(
      [await inner.stat(versionKey), await inner.stat(leadKey)].map((object) => object !== null),
      [true, true],
      'объекты удалены без исполнения требования',
    );

    await unblock();
    failRemove = /^(?:projects|leads)\//u;
    const report = await erasure.executeErasure(head(), request.id);
    failRemove = null;
    assert.deepEqual([report.objectsPurged, report.objectsFailed], [0, 2]);
    const stored = await prisma.erasureRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.ok(stored.executedAt instanceof Date);
    assert.deepEqual(
      [(stored.report as { objectsPurged: number }).objectsPurged, (stored.report as { objectsFailed: number }).objectsFailed],
      [0, 2],
      'отчёт требования не поправлен после отказа хранилища',
    );
    assert.match((await prisma.clientProfile.findUniqueOrThrow({ where: { id: subject.id } })).fullName, /удалено/u);
    assert.ok((await prisma.materialVersion.findUniqueOrThrow({ where: { id: version.id } })).purgedAt instanceof Date);
    assert.equal(await prisma.fileAccessLog.count({ where: { versionId: version.id, action: 'PURGE' } }), 1);

    // Строка журнала — без удаляемых персональных данных.
    const journal = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'ERASURE_EXECUTED', objectId: request.id } });
    assert.deepEqual(Object.keys(journal.payload as object).sort(), ['clientId', 'contractTotal', 'files', 'projects']);
    assert.deepEqual(journal.payload, { clientId: subject.id, projects: 1, files: 2, contractTotal: '100000' });
    assert.doesNotMatch(JSON.stringify(journal), /Субъект|r1006-subject|глава/u);

    // Оставшиеся объекты: версию видит сверка, обе строки — чистка по сроку.
    assert.deepEqual(await gapsOf(`projects/${project.id}/`), ['PURGED_KEPT']);
    const keys = await purgedKeys();
    assert.ok(keys.includes(versionKey) && keys.includes(leadKey), 'чистка по сроку не повторит удаление');
    assert.ok(logged.some((line) => line.includes(versionKey)) && logged.some((line) => line.includes(leadKey)));
  });
});
