/**
 * Шаблоны практики на настоящей базе (решение Р-558): загружает и убирает
 * руководитель; шаблон команды выдаётся сотрудникам, шаблон «всем» — и
 * клиенту; замена по названию удаляет прежний файл; запись в журнале.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { AccessDenied, type Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-templates-'));

const enabled = Boolean(process.env.DATABASE_URL);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('шаблоны практики', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const templates = await import('../src/lib/cabinet/owner-templates.ts');
  const { download } = await import('../src/lib/cabinet/downloads.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const saved: string[] = [];
  const who = (id: string, role: Actor['role'], clientProfileId: string | null = null): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const curator = () => who(ids.curator!, 'EXPERT');
  const client = () => who(ids.client!, 'CLIENT', ids.profile!);
  const file = (path: string) => existsSync(`${process.env.CABINET_STORAGE_DIR}/${path}`);
  const contract = `Договор ${stamp}`;
  const memo = `Памятка ${stamp}`;

  before(async () => {
    ids.head = (await prisma.user.create({ data: { email: `tpl-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' } })).id;
    ids.manager = (await prisma.user.create({ data: { email: `tpl-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' } })).id;
    ids.curator = (await prisma.user.create({ data: { email: `tpl-cur-${stamp}@example.org`, fullName: 'Куратор', role: 'EXPERT' } })).id;
    const user = await prisma.user.create({ data: { email: `tpl-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' } });
    ids.client = user.id;
    ids.profile = (await prisma.clientProfile.create({ data: { userId: user.id, fullName: 'Клиент', normalizedName: 'клиент' } })).id;
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { objectType: 'DocumentTemplate', objectId: { in: saved } } });
    await prisma.documentTemplate.deleteMany({ where: { id: { in: saved } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!, ids.curator!, ids.client!] } } });
  });

  const body = (text: string) => makeDocx([text]);

  it('загружает только руководитель', async () => {
    await assert.rejects(
      templates.saveOwnerTemplate(manager(), { title: contract, note: '', audience: 'STAFF', originalName: 'Договор.docx', contentType: DOCX, body: body('x') }),
      AccessDenied,
    );
    await assert.rejects(templates.removeOwnerTemplate(curator(), 'nope'), AccessDenied);
  });

  it('проверяет название, пустой и исполняемый файл', async () => {
    const base = { note: '', audience: 'STAFF', originalName: 'Договор.docx', contentType: DOCX, body: body('x') };
    await assert.rejects(templates.saveOwnerTemplate(head(), { ...base, title: ' ' }), templates.TemplateError);
    await assert.rejects(templates.saveOwnerTemplate(head(), { ...base, title: contract, body: Buffer.alloc(0) }), templates.TemplateError);
    await assert.rejects(
      templates.saveOwnerTemplate(head(), { ...base, title: contract, originalName: 'setup.exe', body: Buffer.from('MZ\x90\x00') }),
      templates.TemplateError,
    );
  });

  it('шаблон команды — сотрудникам, шаблон «всем» — и клиенту', async () => {
    const team = await templates.saveOwnerTemplate(
      head(),
      { title: contract, note: 'Подписывается до первой оплаты', audience: 'STAFF', originalName: 'Договор.DOCX', contentType: DOCX, body: body('Договор') },
      '203.0.113.5',
    );
    const all = await templates.saveOwnerTemplate(head(), {
      title: memo,
      note: '',
      audience: 'ALL',
      originalName: 'Памятка.docx',
      contentType: DOCX,
      body: body('Памятка'),
    });
    saved.push(team.id, all.id);
    assert.equal(team.replaced, false);

    const seenBy = async (actor: Actor) =>
      (await templates.ownerTemplates(actor)).map((row) => row.title).filter((title) => title.endsWith(String(stamp)));
    for (const actor of [head(), manager(), curator()]) assert.deepEqual((await seenBy(actor)).sort(), [contract, memo].sort());
    assert.deepEqual(await seenBy(client()), [memo]);

    const got = await download(manager(), `tpl-${team.id}`);
    assert.ok(got !== null);
    assert.equal(got.file, `${contract}.docx`, 'имя файла — название шаблона, расширение — строчными');
    assert.equal(got.ascii, `shablon-${team.id}.docx`);
    assert.equal(got.type, DOCX);
    assert.equal(await download(client(), `tpl-${team.id}`), null, 'шаблон команды клиенту не выдаётся');
    assert.ok((await download(client(), `tpl-${all.id}`)) !== null);

    const event = await prisma.auditEvent.findFirst({ where: { objectType: 'DocumentTemplate', objectId: team.id } });
    assert.equal(event?.action, 'TEMPLATE_UPLOADED');
    assert.equal(event?.actorIp, '203.0.113.5');
  });

  it('то же название заменяет файл: прежний объект удаляется, ссылка та же', async () => {
    const before = await prisma.documentTemplate.findFirstOrThrow({ where: { title: contract, deletedAt: null } });
    assert.ok(file(before.storageKey));
    const next = await templates.saveOwnerTemplate(head(), {
      title: `  ${contract} `,
      note: '',
      audience: 'ALL',
      originalName: 'Договор, редакция 2.docx',
      contentType: DOCX,
      body: body('Договор, редакция 2'),
    });
    assert.equal(next.id, before.id);
    assert.equal(next.replaced, true);
    const now = await prisma.documentTemplate.findUniqueOrThrow({ where: { id: before.id } });
    assert.notEqual(now.storageKey, before.storageKey);
    assert.equal(file(before.storageKey), false, 'прежний файл удалён');
    assert.ok(file(now.storageKey));
    assert.equal(now.audience, 'ALL');
    assert.equal(now.note, null);
    const actions = await prisma.auditEvent.findMany({ where: { objectType: 'DocumentTemplate', objectId: before.id }, select: { action: true } });
    assert.ok(actions.some((row) => row.action === 'TEMPLATE_REPLACED'));
  });

  it('убранный шаблон не виден и не выдаётся; файл удалён', async () => {
    const row = await prisma.documentTemplate.findFirstOrThrow({ where: { title: memo, deletedAt: null } });
    await templates.removeOwnerTemplate(head(), row.id);
    assert.equal(file(row.storageKey), false);
    assert.ok(!(await templates.ownerTemplates(head())).some((item) => item.id === row.id));
    assert.equal(await download(head(), `tpl-${row.id}`), null);
    await assert.rejects(templates.removeOwnerTemplate(head(), row.id), templates.TemplateError);
    // Название освободилось: новый шаблон с ним — новая строка.
    const again = await templates.saveOwnerTemplate(head(), {
      title: memo,
      note: '',
      audience: 'STAFF',
      originalName: 'Памятка.docx',
      contentType: DOCX,
      body: body('Памятка 2'),
    });
    saved.push(again.id);
    assert.notEqual(again.id, row.id);
  });

  it('приостановленная запись шаблонов не видит', async () => {
    assert.deepEqual(await templates.ownerTemplates({ ...manager(), status: 'SUSPENDED' }), []);
  });
});
