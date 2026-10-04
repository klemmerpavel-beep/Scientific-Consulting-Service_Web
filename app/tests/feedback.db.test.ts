/**
 * Замечания с виджета на настоящей базе (решение Р-277): запись через
 * службу, отказ снимка из кабинета, разбор руководителем, права и таблица
 * для Диска без адресов и строк браузера.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('замечания с виджета', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');
  const service = await import('../src/lib/cabinet/feedback.ts');
  const { feedbackTable } = await import('../src/lib/disk/registry.ts');
  const { anonymize } = await import('../src/lib/disk/sheet.ts');
  const { SCREENSHOT_IN_CABINET, SCREENSHOT_BAD_TYPE, FeedbackInputError } = await import('../src/lib/feedback.ts');

  const stamp = Date.now();
  const marker = `проверка-${stamp}`;
  const created: string[] = [];
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

  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

  const submit = async (fields: { text: string; path: string; width?: string; screenshot?: Uint8Array | null }) => {
    const { id } = await service.createFeedback({
      text: fields.text,
      path: fields.path,
      width: fields.width ?? '1280',
      screenshot: fields.screenshot ?? null,
    });
    created.push(id);
    return id;
  };

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pd-feedback-'));
    setStorage(new LocalStorage(root));
    // Служебные учётные записи — с закрытым доступом: уведомления о новых
    // заявках ставятся действующим сотрудникам, а набор их не ждёт
    // (решение Р-195). Право проверяется по переданному лицу, не по базе.
    const h = await prisma.user.create({
      data: { email: `fb-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD', status: 'SUSPENDED' },
    });
    const m = await prisma.user.create({
      data: { email: `fb-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER', status: 'SUSPENDED' },
    });
    users.push(h.id, m.id);
    head = actor(h.id, 'HEAD');
    manager = actor(m.id, 'MANAGER');
  });

  after(async () => {
    setStorage(null);
    if (root !== '') await rm(root, { recursive: true, force: true });
    await prisma.feedback.deleteMany({ where: { OR: [{ id: { in: created } }, { text: { contains: marker } }] } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('замечание с сайта записывается шаблоном, с устройством и критичностью', async () => {
    const id = await submit({
      text: `Форма не отправляется ${marker}`,
      path: '/main?utm_source=x#request',
      width: '390',
      screenshot: PNG,
    });
    const row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.area, 'SITE');
    assert.equal(row.pathTemplate, '/main');
    assert.equal(row.device, 'телефон');
    assert.equal(row.viewportWidth, 390);
    assert.equal(row.severityAuto, 'CRITICAL');
    assert.equal(row.severity, 'CRITICAL');
    assert.equal(row.status, 'NEW');
    assert.equal(row.resolvedAt, null);
    // Снимок — по ключу без исходного имени, тип по сигнатуре.
    assert.match(row.screenshotKey ?? '', /^feedback\/[0-9a-f-]{36}\.png$/u);
    assert.equal(row.screenshotType, 'image/png');
    assert.equal(row.screenshotSize, PNG.byteLength);
    const files = await readdir(path.join(root, 'feedback'));
    assert.equal(files.length, 1);
  });

  it('из кабинета — шаблон без ключа входа и идентификатора', async () => {
    const enter = await submit({ text: `Не пускает ${marker}`, path: '/cabinet/enter/SeCrEtToKeN_123456' });
    const stage = await submit({
      text: `Неясно, где срок ${marker}`,
      path: '/cabinet/stages/cmg1x2y3z4a5b6c7d8e9f0g1h',
      width: 'abc',
    });
    const rows = await prisma.feedback.findMany({ where: { id: { in: [enter, stage] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.equal(byId.get(enter)!.pathTemplate, '/cabinet/enter/[ссылка]');
    assert.equal(byId.get(enter)!.area, 'CABINET');
    assert.equal(byId.get(stage)!.pathTemplate, '/cabinet/stages/[id]');
    assert.equal(byId.get(stage)!.viewportWidth, null);
    assert.equal(byId.get(stage)!.device, 'не определено');
    assert.equal(byId.get(stage)!.severityAuto, 'MEDIUM');
  });

  it('снимок с экрана кабинета отвергается, и ничего не пишется', async () => {
    const before = await prisma.feedback.count();
    await assert.rejects(
      () => service.createFeedback({ text: `Кнопка съехала ${marker}`, path: '/cabinet/projects', width: '1280', screenshot: PNG }),
      (error: unknown) => error instanceof FeedbackInputError && error.message === SCREENSHOT_IN_CABINET,
    );
    assert.equal(await prisma.feedback.count(), before);
  });

  it('не картинка под видом снимка отвергается', async () => {
    const html = new Uint8Array(Buffer.from('<!doctype html><script>alert(1)</script>'));
    await assert.rejects(
      () => service.createFeedback({ text: `Опечатка ${marker}`, path: '/offer', width: '1280', screenshot: html }),
      (error: unknown) => error instanceof FeedbackInputError && error.message === SCREENSHOT_BAD_TYPE,
    );
  });

  it('разбор: критичность, состояние, что сделано и момент закрытия', async () => {
    const id = await submit({ text: `Опечатка в подвале ${marker}`, path: '/students' });
    let row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.severityAuto, 'LOW');

    await service.reviewFeedback(head, id, { severity: 'HIGH', status: 'IN_WORK', note: '' });
    row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.severity, 'HIGH');
    assert.equal(row.severityAuto, 'LOW', 'правило не переписывается разбором');
    assert.equal(row.status, 'IN_WORK');
    assert.equal(row.resolvedAt, null);
    assert.equal(row.note, null);

    await service.reviewFeedback(head, id, { severity: 'HIGH', status: 'FIXED', note: '  Поправлен текст подвала  ' });
    row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, 'FIXED');
    assert.equal(row.note, 'Поправлен текст подвала');
    assert.ok(row.resolvedAt instanceof Date);
    const closedAt = row.resolvedAt!.getTime();

    // Из «исправлено» в «отклонено» — момент закрытия прежний.
    await service.reviewFeedback(head, id, { severity: 'HIGH', status: 'REJECTED', note: 'Не ошибка' });
    row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.resolvedAt!.getTime(), closedAt);

    // Возврат в работу снимает момент закрытия.
    await service.reviewFeedback(head, id, { severity: 'MEDIUM', status: 'NEW', note: 'Не ошибка' });
    row = await prisma.feedback.findUniqueOrThrow({ where: { id } });
    assert.equal(row.resolvedAt, null);

    // В журнале — состояние и критичность, но не текст замечания и разбора.
    const events = await prisma.auditEvent.findMany({ where: { objectId: id, action: 'FEEDBACK_REVIEWED' } });
    assert.equal(events.length, 4);
    const journal = JSON.stringify(events.map((e) => e.payload));
    assert.doesNotMatch(journal, /Опечатка|подвал|Не ошибка/u);
    assert.match(journal, /"to":"FIXED"/u);
  });

  it('разбор отвергает неизвестные значения и длинный текст', async () => {
    const id = await submit({ text: `Хорошо бы крупнее ${marker}`, path: '/business' });
    await assert.rejects(() => service.reviewFeedback(head, id, { severity: 'URGENT', status: 'NEW', note: '' }));
    await assert.rejects(() => service.reviewFeedback(head, id, { severity: 'LOW', status: 'DONE', note: '' }));
    await assert.rejects(() => service.reviewFeedback(head, id, { severity: 'LOW', status: 'NEW', note: 'а'.repeat(2001) }));
    await assert.rejects(() => service.reviewFeedback(head, 'нет-такого', { severity: 'LOW', status: 'NEW', note: '' }));
  });

  it('не руководитель получает отказ в праве везде', async () => {
    const id = created[0]!;
    for (const who of [manager, actor('client-x', 'CLIENT'), actor('expert-x', 'EXPERT')]) {
      await assert.rejects(() => service.feedbackList(who), AccessDenied);
      await assert.rejects(() => service.feedbackDigest(who), AccessDenied);
      await assert.rejects(() => service.reviewFeedback(who, id, { severity: 'LOW', status: 'NEW', note: '' }), AccessDenied);
      await assert.rejects(() => service.openFeedbackScreenshot(who, id), AccessDenied);
      await assert.rejects(() => service.feedbackWorkbook(who, null), AccessDenied);
    }
  });

  it('перечень и плитки руководителя', async () => {
    const list = await service.feedbackList(head, { status: 'NEW' });
    assert.ok(list.rows.every((r) => r.status === 'NEW'));
    const digest = await service.feedbackDigest(head);
    assert.ok(digest.total >= created.length);
    assert.ok(digest.criticalOpen >= 1);
    // Неизвестный отбор — «любой», а не сбой.
    const any = await service.feedbackList(head, { status: 'НЕЧТО', severity: 'x', page: 999 });
    assert.equal(any.total, digest.total);
    assert.equal(any.page, any.pages);
  });

  it('снимок выдаётся руководителю с типом по сигнатуре', async () => {
    const withShot = await prisma.feedback.findFirstOrThrow({ where: { id: { in: created }, screenshotKey: { not: null } } });
    const file = await service.openFeedbackScreenshot(head, withShot.id);
    assert.ok(file !== null);
    assert.equal(file.contentType, 'image/png');
    assert.equal(file.sizeBytes, PNG.byteLength);
    assert.equal(file.fileName, `zamechanie-${withShot.id}.png`);
    await file.stream.cancel();
    const without = created.find((id) => id !== withShot.id)!;
    assert.equal(await service.openFeedbackScreenshot(head, without), null);
  });

  it('таблица для Диска: строка есть, адресов и строк браузера нет', async () => {
    const table = await feedbackTable();
    assert.equal(table.file, 'Замечания.xlsx');
    assert.equal(table.name, 'zamechaniya.csv');
    assert.deepEqual(table.head, [
      'Дата (МСК)', 'Область', 'Страница', 'Устройство', 'Ширина окна', 'Замечание',
      'Критичность (авто)', 'Критичность', 'Состояние', 'Что сделано', 'Закрыто (МСК)',
      'Снимок', 'Идентификатор',
    ]);
    const mine = table.data.filter((row) => String(row[5]).includes(marker));
    assert.equal(mine.length, created.length);
    const site = mine.find((row) => row[2] === '/main')!;
    assert.deepEqual(site.slice(1, 5), ['сайт', '/main', 'телефон', 390]);
    assert.equal(site[6], 'критично');
    assert.equal(site[11], 'есть');
    const enter = mine.find((row) => row[2] === '/cabinet/enter/[ссылка]')!;
    assert.equal(enter[1], 'кабинет');
    assert.equal(enter[11], 'нет');

    // Ни адреса, ни строки браузера, ни ключа входа.
    assert.doesNotMatch(table.csv, /\b\d{1,3}(?:\.\d{1,3}){3}\b/u);
    assert.doesNotMatch(table.csv, /Mozilla|AppleWebKit|Chrome\/|Safari\/|Gecko/u);
    assert.doesNotMatch(table.csv, /SeCrEtToKeN|cmg1x2y3z4a5b6c7d8e9f0g1h/u);
    assert.ok(!table.head.some((h) => /IP|адрес|браузер|User-Agent/iu.test(h)));
    assert.ok(table.xlsx.byteLength > 0);

    // На Диск без договора поручения свободный текст не уходит (Р-265).
    const anon = anonymize(table);
    assert.doesNotMatch(anon.csv, new RegExp(marker, 'u'));
  });

  it('книга руководителя — та же таблица, выгрузка в журнале', async () => {
    const book = await service.feedbackWorkbook(head, '127.0.0.1');
    assert.equal(book.file, 'Замечания.xlsx');
    const event = await prisma.auditEvent.findFirst({ where: { actorId: head.id, action: 'FEEDBACK_EXPORTED' } });
    assert.ok(event !== null);
    assert.equal((event.payload as { rows: number }).rows, book.rows);
  });
});
