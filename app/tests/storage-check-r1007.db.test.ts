/**
 * Сверка вложений заявок и файлов анкет экспертов с хранилищем на
 * настоящей базе и временном каталоге (ответ владельца 22.11.2026
 * «Расширить в выпуске 4»; решение Р-1007): по каждому виду — есть
 * расхождение и нет; срок еженедельной чистки для изъятых и перенесённых
 * вложений; сверка только читает; перечень «Сводки» — только руководителю,
 * с номером заявки и датой анкеты, без ФИО, контактов и ключей.
 *
 * База общая с другими проверками: сверка обходит все строки, поэтому
 * утверждения — о своих заявках, анкетах и файлах.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'k'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const DAY = 24 * 60 * 60 * 1000;

describe('сверка вложений заявок и файлов анкет с хранилищем (Р-1007)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');
  const { checkStorage } = await import('../src/lib/cabinet/storage-check.ts');
  const { LEAD_PURGE_GRACE_DAYS } = await import('../src/lib/cabinet/storage-gaps.ts');
  const { storageGaps } = await import('../src/lib/cabinet/head-checks.ts');

  const stamp = Date.now();
  const at = new Date();
  const root = mkdtempSync(path.join(tmpdir(), 'pd-r1007-'));
  const store = new LocalStorage(root);
  const ids: Record<string, string> = {};
  const keys: Record<string, string> = {};
  const dates: Record<string, Date> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-10T00:00:00Z') : null,
    ...extra,
  });
  const put = (key: string, bytes = 3) => {
    mkdirSync(path.dirname(path.join(root, key)), { recursive: true });
    writeFileSync(path.join(root, key), Buffer.alloc(bytes, 1));
  };
  const files = () => readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
  const ours = (key: string) => key.includes(ids.lead!) || key.includes(ids.application!) || key.includes(String(stamp));
  const mine = async (moment: Date = at) => (await checkStorage(prisma, store, moment)).gaps.filter((gap) => ours(gap.key));

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `r1007-${suffix}-${stamp}@example.org`, fullName: `Р-1007 ${suffix}`, role } });
    const [head, manager, curator, client] = [await make('head', 'HEAD'), await make('mgr', 'MANAGER'), await make('cur', 'EXPERT'), await make('cli', 'CLIENT')];
    Object.assign(ids, { head: head.id, manager: manager.id, curator: curator.id, client: client.id });
    ids.profile = (await prisma.clientProfile.create({ data: { userId: client.id, fullName: 'Р-1007 Клиент', normalizedName: `r1007 ${stamp}` } })).id;

    // Заявка с вложениями: живое, перенесённое вчера и давно, изъятое
    // давно — с файлом и без.
    const lead = await prisma.lead.create({
      data: { source: 'cabinet', form: 'request', name: 'Заявитель Сверкин', contactKind: 'email', contact: `r1007-lead-${stamp}@example.org`, consentGiven: true, consentVersion: 'v1' },
    });
    ids.lead = lead.id;
    const attachment = (name: string, purgedAt: Date | null, materialId: string | null, withFile: boolean) => {
      const key = `leads/${lead.id}/${name}-${stamp}.pdf`;
      keys[name] = key;
      if (withFile) put(key);
      return prisma.leadAttachment.create({
        data: { leadId: lead.id, storageKey: key, originalName: `Сверкин ${name}.pdf`, sizeBytes: 3n, sha256: 'a'.repeat(64), contentType: 'application/pdf', purgedAt, materialId },
      });
    };
    dates.fresh = new Date(at.getTime() - DAY);
    dates.moved = new Date(at.getTime() - 9 * DAY);
    dates.erased = new Date(at.getTime() - 20 * DAY);
    await attachment('live', null, null, true);
    await attachment('fresh', dates.fresh, `cmoved${stamp}a`, true);
    await attachment('moved', dates.moved, `cmoved${stamp}b`, true);
    await attachment('erased', dates.erased, null, true);
    await attachment('gone', dates.erased, null, false);
    // Файлы без записи: под живой заявкой и под заявкой, которой нет.
    keys.leadOrphan = `leads/${lead.id}/orphan-${stamp}.pdf`;
    put(keys.leadOrphan);
    keys.leadLost = `leads/c${stamp}gone/orphan.pdf`;
    put(keys.leadLost);

    // Анкета с файлом; файл без записи под ней и под удалённой анкетой.
    const application = await prisma.expertApplication.create({
      data: { fullName: 'Кандидат Сверкин', email: `r1007-app-${stamp}@example.org`, degree: 'к. т. н.', fields: 'Сфера', experience: 'Опыт', consentVersion: 'v1', createdAt: new Date('2026-11-12T09:00:00Z') },
    });
    ids.application = application.id;
    keys.cv = `experts/${application.id}/cv-${stamp}.pdf`;
    put(keys.cv);
    await prisma.expertApplicationFile.create({
      data: { applicationId: application.id, storageKey: keys.cv, originalName: 'Сверкин резюме.pdf', sizeBytes: 3n, sha256: 'b'.repeat(64), contentType: 'application/pdf' },
    });
    keys.expertOrphan = `experts/${application.id}/extra-${stamp}.pdf`;
    put(keys.expertOrphan);
    keys.expertLost = `experts/c${stamp}gone/cv.pdf`;
    put(keys.expertLost);
  });

  after(async () => {
    setStorage(null);
    await prisma.lead.deleteMany({ where: { id: ids.lead } });
    await prisma.expertApplication.deleteMany({ where: { id: ids.application } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!, ids.curator!, ids.client!] } } });
  });

  it('нет расхождения: вложение и файл анкеты с записью, изъятое без файла, изъятое в сроке чистки', async () => {
    const found = new Set((await mine()).map((gap) => gap.key));
    for (const name of ['live', 'fresh', 'gone', 'cv'] as const) assert.ok(!found.has(keys[name]!), name);
  });

  it('вложения: файл без записи и изъятое после срока чистки с файлом — с номером заявки и датой', async () => {
    const gaps = (await mine()).filter((gap) => gap.section === 'LEADS');
    const number = (await prisma.lead.findUniqueOrThrow({ where: { id: ids.lead }, select: { number: true } })).number;
    // Порядок: изъятые с файлом, затем сироты; внутри — свежие сверху.
    assert.deepEqual(
      gaps.filter((gap) => gap.kind === 'PURGED_KEPT').map((gap) => [gap.key, gap.lead?.number, gap.at?.toISOString()]),
      [
        [keys.moved, number, dates.moved!.toISOString()],
        [keys.erased, number, dates.erased!.toISOString()],
      ],
    );
    const orphans = gaps.filter((gap) => gap.kind === 'ORPHAN');
    assert.deepEqual(orphans.map((gap) => gap.key).sort(), [keys.leadLost, keys.leadOrphan].sort());
    assert.deepEqual(orphans.find((gap) => gap.key === keys.leadOrphan)?.lead, { id: ids.lead, number });
    assert.equal(orphans.find((gap) => gap.key === keys.leadLost)?.lead, null, 'заявки нет — без номера');
    assert.ok(orphans.every((gap) => gap.at instanceof Date), 'дата записи файла');
    assert.ok(gaps.every((gap) => gap.material === null && gap.work === null && gap.application === null));
  });

  it('срок чистки: вчерашнее изъятие — расхождение, только когда срок вышел', async () => {
    const fresh = async (moment: Date) => (await mine(moment)).some((gap) => gap.key === keys.fresh && gap.kind === 'PURGED_KEPT');
    assert.equal(await fresh(new Date(dates.fresh!.getTime() + 7 * DAY)), false, 'неделя — чистка могла не дойти');
    assert.equal(await fresh(new Date(dates.fresh!.getTime() + LEAD_PURGE_GRACE_DAYS * DAY - 1000)), false, 'за секунду до срока');
    assert.equal(await fresh(new Date(dates.fresh!.getTime() + LEAD_PURGE_GRACE_DAYS * DAY)), true, 'срок вышел');
    // Изъятое без файла не становится расхождением ни в какой срок.
    assert.ok(!(await mine(new Date(at.getTime() + 365 * DAY))).some((gap) => gap.key === keys.gone));
  });

  it('анкеты: файл без записи — с датой живой анкеты; у удалённой анкеты — без неё', async () => {
    const gaps = (await mine()).filter((gap) => gap.section === 'EXPERTS');
    assert.deepEqual(gaps.map((gap) => gap.kind), ['ORPHAN', 'ORPHAN']);
    assert.deepEqual(gaps.find((gap) => gap.key === keys.expertOrphan)?.application, { id: ids.application, createdAt: new Date('2026-11-12T09:00:00Z') });
    assert.equal(gaps.find((gap) => gap.key === keys.expertLost)?.application, null);
    assert.ok(gaps.every((gap) => gap.lead === null && gap.material === null && gap.at instanceof Date));
  });

  it('числа по разделам видят свои расхождения; сверка только читает', async () => {
    const rows = await prisma.leadAttachment.count({ where: { leadId: ids.lead } });
    const before = files();
    const check = await checkStorage(prisma, store, at);
    // Во временном каталоге только эти файлы — числа точные.
    assert.deepEqual(
      { leads: check.counts.LEADS, experts: check.counts.EXPERTS },
      {
        leads: { MISSING: 0, SIZE: 0, PURGED_KEPT: 2, ORPHAN: 2 },
        experts: { MISSING: 0, SIZE: 0, PURGED_KEPT: 0, ORPHAN: 2 },
      },
    );
    assert.equal(check.files, 9);
    await checkStorage(prisma, store, at);
    assert.equal(await prisma.leadAttachment.count({ where: { leadId: ids.lead } }), rows);
    assert.equal(await prisma.expertApplicationFile.count({ where: { applicationId: ids.application } }), 1);
    assert.equal(files(), before);
  });

  it('перечень «Сводки» — только руководителю; в строках номер заявки и дата анкеты, без ФИО, контактов и ключей', async () => {
    setStorage(store);
    for (const actor of [
      who(ids.client!, 'CLIENT', { clientProfileId: ids.profile! }),
      who(ids.curator!, 'EXPERT'),
      who(ids.manager!, 'MANAGER'),
      who(ids.head!, 'HEAD', { status: 'SUSPENDED' }),
    ]) {
      assert.equal(await storageGaps(actor), null, `${actor.role} ${actor.status}`);
    }
    const view = await storageGaps(who(ids.head!, 'HEAD'));
    assert.ok(view !== null && !view.failed);
    const rows = view.rows.filter((row) => row.lead?.id === ids.lead || row.application?.id === ids.application);
    assert.deepEqual(
      rows.map((row) => [row.section, row.label]),
      [
        ['LEADS', 'вложение изъято или перенесено, файл остался'],
        ['LEADS', 'вложение изъято или перенесено, файл остался'],
        ['LEADS', 'файл без записи вложения'],
        ['EXPERTS', 'файл без записи анкеты'],
      ],
    );
    const text = JSON.stringify(view.rows);
    assert.doesNotMatch(text, /Сверкин|r1007-(?:lead|app)-|@example\.org|leads\/|experts\/|резюме/u);
    assert.ok(view.rows.every((row) => !('key' in row)));
    setStorage(null);
  });
});
