/**
 * Анкеты экспертов на настоящей базе (решение Р-580): запись с файлами,
 * отказ исполняемого файла, права руководителя, разбор, выдача файла,
 * удаление с файлами, таблица для Диска и запросы чистки по сроку.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'e'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('анкеты экспертов', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');
  const service = await import('../src/lib/cabinet/expert-applications.ts');
  const { anonymize } = await import('../src/lib/disk/sheet.ts');
  const { ExpertInputError, EXPERT_CONSENT_VERSION } = await import('../src/lib/expert-application.ts');

  const stamp = Date.now();
  const marker = `Проверка ${stamp}`;
  const users: string[] = [];
  let root = '';

  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  let head: Actor;
  let manager: Actor;

  const PDF = Buffer.from('%PDF-1.7\nрезюме\n', 'utf8');
  const input = (extra: Partial<Record<string, string>> = {}) => ({
    fullName: `${marker} Иванова Мария Петровна`,
    email: 'maria@example.org',
    phone: '+7 916 123-45-67',
    degree: 'Кандидат наук' as const,
    speciality: '5.2.3',
    fields: 'Экономика отраслевых рынков',
    experience: 'Руководство ВКР, рецензирование, 30 публикаций',
    links: undefined,
    academicTitle: 'Доцент' as const,
    workplace: 'Кафедра экономики',
    seniority: undefined,
    services: ['Научные статьи'] as ('Научные статьи')[],
    roles: [] as never[],
    elibrarySpin: '1234-5678',
    orcid: undefined,
    weeklyHours: undefined,
    consent: true as const,
    ...extra,
  });

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pd-experts-'));
    setStorage(new LocalStorage(root));
    const h = await prisma.user.create({
      data: { email: `ex-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD', status: 'SUSPENDED' },
    });
    const m = await prisma.user.create({
      data: { email: `ex-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER', status: 'SUSPENDED' },
    });
    users.push(h.id, m.id);
    head = actor(h.id, 'HEAD');
    manager = actor(m.id, 'MANAGER');
  });

  after(async () => {
    setStorage(null);
    if (root !== '') await rm(root, { recursive: true, force: true });
    await prisma.expertApplication.deleteMany({ where: { fullName: { startsWith: marker } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('анкета записывается с файлом и редакцией согласия; ключ файла — без исходного имени', async () => {
    const { id } = await service.createExpertApplication(input(), [
      { originalName: 'Иванова резюме.pdf', contentType: 'application/pdf', body: PDF },
    ]);
    const row = await prisma.expertApplication.findUniqueOrThrow({ where: { id }, include: { files: true } });
    assert.equal(row.status, 'NEW');
    assert.equal(row.consentVersion, EXPERT_CONSENT_VERSION);
    assert.equal(row.academicTitle, 'Доцент');
    assert.deepEqual(row.services, ['Научные статьи']);
    assert.deepEqual(row.roles, []);
    assert.equal(row.files.length, 1);
    assert.match(row.files[0]!.storageKey, new RegExp(`^experts/${id}/[0-9a-f-]{36}\\.pdf$`, 'u'));
    assert.ok(!row.files[0]!.storageKey.includes('Иванова'));
  });

  it('исполняемый файл под видом документа — отказ, анкета не записывается', async () => {
    const before = await prisma.expertApplication.count({ where: { fullName: { startsWith: marker } } });
    await assert.rejects(
      service.createExpertApplication(input(), [{ originalName: 'резюме.exe', contentType: 'application/pdf', body: PDF }]),
      (error: unknown) => error instanceof ExpertInputError,
    );
    assert.equal(await prisma.expertApplication.count({ where: { fullName: { startsWith: marker } } }), before);
  });

  it('анкеты видит и разбирает только руководитель', async () => {
    await assert.rejects(service.expertApplications(manager), AccessDenied);
    const list = await service.expertApplications(head, { status: 'NEW' });
    const mine = list.rows.find((row) => row.fullName.startsWith(marker));
    assert.ok(mine !== undefined, 'анкеты нет в перечне');
    assert.equal(mine.files, 1);
    await assert.rejects(service.reviewExpertApplication(manager, mine.id, { status: 'REVIEW', note: '' }), AccessDenied);
    await service.reviewExpertApplication(head, mine.id, { status: 'INVITED', note: 'Позвать на разговор' });
    const row = await prisma.expertApplication.findUniqueOrThrow({ where: { id: mine.id } });
    assert.equal(row.status, 'INVITED');
    assert.ok(row.statusChangedAt !== null);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { actorId: head.id, action: 'EXPERT_APPLICATION_REVIEWED', objectId: mine.id } });
    // В журнал — смена состояния, но не текст пометки.
    assert.ok(!JSON.stringify(audit.payload).includes('Позвать'));
  });

  it('файл выдаётся руководителю с записью в журнал; менеджеру — отказ', async () => {
    const app = await prisma.expertApplication.findFirstOrThrow({ where: { fullName: { startsWith: marker } }, include: { files: true } });
    const fileId = app.files[0]!.id;
    await assert.rejects(service.openExpertFile(manager, fileId, null), AccessDenied);
    const opened = await service.openExpertFile(head, fileId, '127.0.0.1');
    assert.ok(opened !== null);
    assert.equal(opened.contentType, 'application/pdf');
    assert.equal(opened.sizeBytes, PDF.byteLength);
    assert.ok(await prisma.auditEvent.findFirst({ where: { actorId: head.id, action: 'EXPERT_FILE_DOWNLOADED' } }));
  });

  it('таблица для Диска: почта, телефон и опыт затираются при обезличивании', async () => {
    const book = await service.expertsTable();
    const masked = anonymize(book);
    const at = (name: string) => masked.head.indexOf(name);
    const row = masked.data.find((cells) => String(cells[book.head.indexOf('Идентификатор')]).length > 0 && String(book.data[masked.data.indexOf(cells)]![1]).startsWith(marker));
    assert.ok(row !== undefined);
    for (const column of ['Имя', 'Почта', 'Телефон', 'Опыт', 'Сфера', 'Место работы', 'SPIN-код', 'ORCID', 'Виды работ']) {
      assert.notEqual(at(column), -1, `нет столбца «${column}»`);
    }
    assert.equal(row[at('Почта')], 'скрыто');
    assert.equal(row[at('Опыт')], 'скрыто');
    assert.equal(row[at('Место работы')], 'скрыто');
    assert.equal(row[at('SPIN-код')], 'скрыто');
    // Виды работ — выбор из перечня, человека не называют: остаются видны.
    assert.equal(row[at('Виды работ')], 'Научные статьи');
  });

  it('удаление снимает анкету и её файлы из хранилища', async () => {
    const { id } = await service.createExpertApplication(input({ fullName: `${marker} Удаляемый Кандидат` }), [
      { originalName: 'cv.pdf', contentType: 'application/pdf', body: PDF },
    ]);
    const key = (await prisma.expertApplicationFile.findFirstOrThrow({ where: { applicationId: id } })).storageKey;
    await assert.rejects(service.deleteExpertApplication(manager, id), AccessDenied);
    await service.deleteExpertApplication(head, id);
    assert.equal(await prisma.expertApplication.findUnique({ where: { id } }), null);
    const left = await readdir(path.join(root, path.dirname(key))).catch(() => [] as string[]);
    assert.ok(!left.includes(path.basename(key)), 'файл остался в хранилище');
  });

  it('запросы чистки анкет в retention.sh исполнимы на этой схеме', async () => {
    const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'retention.sh'), 'utf8');
    for (const name of ['SQL_EXPERT_KEYS', 'SQL_EXPERT_DELETE']) {
      const line = script.split('\n').find((text) => text.startsWith(`${name}="`));
      assert.ok(line !== undefined, `в скрипте нет ${name}`);
      const sql = line.slice(name.length + 2, -1).replace(/\\"/gu, '"').replace(/\$EXPERT_MONTHS/gu, '6');
      await prisma.$queryRawUnsafe(`EXPLAIN ${sql}`);
    }
    assert.match(script, /^EXPERT_MONTHS=6$/mu);
  });
});
