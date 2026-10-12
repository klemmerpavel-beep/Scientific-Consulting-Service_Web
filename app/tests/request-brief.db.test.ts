/**
 * Документ в «Новой заявке» клиента на настоящей базе (решение Р-559):
 * временный объект под ключом клиента, чужой ключ не открывается, документ
 * ложится вложением заявки в счёт пяти файлов, после отправки объект
 * убирается.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { makeDocx } from './helpers/make-docx.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('документ в новой заявке клиента', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const intake = await import('../src/lib/cabinet/brief/intake.ts');
  const { createCabinetRequest } = await import('../src/lib/cabinet/queries.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  let root = '';

  const client = (id: string, profile: string): Actor => ({ id, role: 'CLIENT', status: 'ACTIVE', clientProfileId: profile, expertNdaSignedAt: null });
  const first = () => client(ids.client!, ids.profile!);
  const second = () => client(ids.other!, ids.otherProfile!);
  const manager = (): Actor => ({ id: ids.manager!, role: 'MANAGER', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });

  const doc = makeDocx([
    'Анкета для заявки',
    {
      table: [
        ['ФИО автора', 'Анкетова Анна Андреевна'],
        ['Тема', 'Тема из анкеты клиента'],
        ['Цель работы', 'Цель из анкеты.'],
      ],
    },
  ]);
  const draft = (files: { originalName: string; contentType: string; body: Buffer }[]) => ({
    topic: 'Тема из анкеты клиента',
    need: null,
    deadline: null,
    message: 'Цель: Цель из анкеты.',
    applicantName: null,
    supervisorName: null,
    organization: null,
    speciality: null,
    phone: null,
    files,
    ip: '203.0.113.9',
  });

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pd-request-brief-'));
    setStorage(new LocalStorage(root));
    // Менеджер заводится приостановленным: уведомления о заявке ставятся
    // действующим сотрудникам, и набор не растит общую очередь (Р-195).
    ids.manager = (
      await prisma.user.create({ data: { email: `rb-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER', status: 'SUSPENDED' } })
    ).id;
    for (const [user, profile, mail] of [
      ['client', 'profile', 'rb-cli'],
      ['other', 'otherProfile', 'rb-oth'],
    ] as const) {
      const row = await prisma.user.create({
        data: { email: `${mail}-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT', consentVersion: 'v1', consentAcceptedAt: new Date() },
      });
      ids[user] = row.id;
      ids[profile] = (await prisma.clientProfile.create({ data: { userId: row.id, fullName: 'Клиент', normalizedName: `${mail}-${stamp}` } })).id;
    }
  });

  after(async () => {
    setStorage(null);
    if (root !== '') await rm(root, { recursive: true, force: true });
    const users = [ids.manager!, ids.client!, ids.other!];
    await prisma.lead.deleteMany({ where: { contact: { in: [`rb-cli-${stamp}@example.org`, `rb-oth-${stamp}@example.org`] } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.profile!, ids.otherProfile!] } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('клиент кладёт документ под своим ключом; другой клиент и сотрудник его не открывают', async () => {
    const ref = await intake.stageBrief(first(), 'REQUEST_CREATE', 'Анкета.docx', doc);
    assert.match(ref, /^[0-9a-f-]{36}\.docx$/u);
    assert.equal((await intake.loadBrief(first(), 'REQUEST_CREATE', ref))?.brief.fields.topic, 'Тема из анкеты клиента');
    assert.equal(await intake.loadBrief(second(), 'REQUEST_CREATE', ref), null);
    assert.equal(await intake.briefAttachment(second(), 'REQUEST_CREATE', ref, 'Анкета для заявки'), null);
    await assert.rejects(intake.stageBrief(manager(), 'REQUEST_CREATE', 'Анкета.docx', doc), AccessDenied);
    await assert.rejects(intake.loadBrief(manager(), 'REQUEST_CREATE', ref), AccessDenied);
  });

  it('документ — вложением заявки; после отправки временный объект убран', async () => {
    const ref = await intake.stageBrief(first(), 'REQUEST_CREATE', 'Анкета.docx', doc);
    const attachment = await intake.briefAttachment(first(), 'REQUEST_CREATE', ref, 'Анкета для заявки');
    assert.ok(attachment !== null);
    assert.equal(attachment.originalName, 'Анкета для заявки.docx');
    const lead = await createCabinetRequest(first(), draft([attachment]), 'v1');
    const files = await prisma.leadAttachment.findMany({ where: { leadId: lead.id }, select: { originalName: true, sizeBytes: true } });
    assert.deepEqual(files, [{ originalName: 'Анкета для заявки.docx', sizeBytes: BigInt(doc.byteLength) }]);

    await intake.dropBrief(first(), ref);
    assert.equal(existsSync(path.join(root, 'briefs', ids.client!, ref)), false);
    assert.equal(await intake.briefAttachment(first(), 'REQUEST_CREATE', ref, 'Анкета для заявки'), null, 'повторно документ не прикладывается');
  });

  it('документ занимает одно из пяти мест: пять файлов и документ — отказ до заявки', async () => {
    const ref = await intake.stageBrief(first(), 'REQUEST_CREATE', 'Анкета.docx', doc);
    const attachment = await intake.briefAttachment(first(), 'REQUEST_CREATE', ref, 'Анкета для заявки');
    assert.ok(attachment !== null);
    const five = Array.from({ length: 5 }, (_, index) => ({ originalName: `черновик-${index}.txt`, contentType: 'text/plain', body: Buffer.from(`черновик ${index}`) }));
    const before = await prisma.lead.count({ where: { contact: `rb-cli-${stamp}@example.org` } });
    await assert.rejects(createCabinetRequest(first(), draft([attachment, ...five]), 'v1'), /не больше 5 файлов, выбрано 6/u);
    assert.equal(await prisma.lead.count({ where: { contact: `rb-cli-${stamp}@example.org` } }), before, 'заявка не заведена');
    // Документ остаётся для повторной отправки.
    assert.ok((await intake.loadBrief(first(), 'REQUEST_CREATE', ref)) !== null);
  });
});
