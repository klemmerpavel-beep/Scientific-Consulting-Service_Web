/**
 * Сверка версий материалов с хранилищем на настоящей базе и временном
 * каталоге хранилища (план доработки 19.11.2026, К-5; решение Р-986):
 * всё сходится, пропавший файл, чужой размер, изъятая версия с файлом,
 * сирота с материалом и без; сверка только читает; перечень «Сводки» —
 * только руководителю.
 *
 * База общая с другими проверками: сверка обходит все версии, поэтому
 * утверждения — о своих версиях и своих файлах.
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

describe('сверка версий материалов с хранилищем (Р-986)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { LocalStorage, setStorage } = await import('../src/lib/cabinet/storage.ts');
  const { checkStorage, StorageCheckFailed } = await import('../src/lib/cabinet/storage-check.ts');
  const { storageGaps } = await import('../src/lib/cabinet/head-checks.ts');

  const stamp = Date.now();
  const root = mkdtempSync(path.join(tmpdir(), 'pd-r986-'));
  const store = new LocalStorage(root);
  const ids: Record<string, string> = {};
  const keys: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-10T00:00:00Z') : null,
    ...extra,
  });
  const put = (key: string, bytes: number) => {
    mkdirSync(path.dirname(path.join(root, key)), { recursive: true });
    writeFileSync(path.join(root, key), Buffer.alloc(bytes, 1));
  };
  const files = () => readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
  const mine = async () => (await checkStorage(prisma, store)).gaps.filter((gap) => gap.key.includes(ids.work!));

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `r986-${suffix}-${stamp}@example.org`, fullName: `Р-986 ${suffix}`, role } });
    const [head, manager, curator, client] = [await make('head', 'HEAD'), await make('mgr', 'MANAGER'), await make('cur', 'EXPERT'), await make('cli', 'CLIENT')];
    Object.assign(ids, { head: head.id, manager: manager.id, curator: curator.id, client: client.id });
    ids.profile = (await prisma.clientProfile.create({ data: { userId: client.id, fullName: 'Р-986 Клиент', normalizedName: `r986 ${stamp}` } })).id;
    ids.type = (await prisma.serviceType.create({ data: { code: `r986-${stamp}`, name: `Тип Р-986 ${stamp}` } })).id;
    ids.work = (
      await prisma.project.create({
        data: {
          code: `PD-R986-${String(stamp).slice(-6)}`,
          clientId: ids.profile,
          serviceTypeId: ids.type,
          title: 'Работа сверки',
          managerId: manager.id,
          expertId: curator.id,
        },
      })
    ).id;
    const material = (title: string) =>
      prisma.material.create({ data: { projectId: ids.work!, title, createdById: manager.id } });
    ids.whole = (await material('Сходится')).id;
    ids.broken = (await material('Глава с расхождениями')).id;
    const key = (materialId: string, number: number) => `projects/${ids.work}/materials/${materialId}/v${number}/${stamp}.docx`;
    const version = (materialId: string, number: number, size: number, purgedAt: Date | null = null) =>
      prisma.materialVersion.create({
        data: {
          materialId,
          number,
          storageKey: key(materialId, number),
          originalName: `v${number}.docx`,
          sizeBytes: BigInt(size),
          sha256: 'd'.repeat(64),
          contentType: 'application/octet-stream',
          uploadedById: manager.id,
          uploadedAt: new Date(Date.UTC(2026, 10, number)),
          purgedAt,
        },
      });
    // Сходится: строка и файл того же размера.
    await version(ids.whole, 1, 12);
    put(key(ids.whole, 1), 12);
    // Пропавший файл, чужой размер, изъятая версия с оставшимся файлом.
    await version(ids.broken, 1, 10);
    await version(ids.broken, 2, 10);
    put(key(ids.broken, 2), 9);
    await version(ids.broken, 3, 10, new Date(Date.UTC(2026, 10, 20)));
    put(key(ids.broken, 3), 10);
    // Изъятая версия без файла — так и должно быть, не расхождение.
    await version(ids.broken, 4, 10, new Date(Date.UTC(2026, 10, 21)));
    // Сироты: файл версии, которой нет, — у живого материала и у пропавшего.
    keys.orphan = key(ids.broken, 9);
    put(keys.orphan, 5);
    keys.lost = `projects/${ids.work}/materials/c${stamp}gone/v1/${stamp}.pdf`;
    put(keys.lost, 7);
    // Файлы не материалов — вне сверки.
    put(`leads/${stamp}/a.pdf`, 3);
    put(`templates/${stamp}.docx`, 3);
  });

  after(async () => {
    setStorage(null);
    await prisma.material.deleteMany({ where: { projectId: ids.work } });
    await prisma.project.deleteMany({ where: { id: ids.work } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!, ids.curator!, ids.client!] } } });
  });

  it('всё сходится — у материала расхождений нет', async () => {
    assert.deepEqual((await mine()).filter((gap) => gap.materialId === ids.whole), []);
  });

  it('пропавший файл, чужой размер, изъятая версия с файлом и сироты — с материалом, работой, версией и датой', async () => {
    const gaps = await mine();
    // Порядок — по видам: сперва то, что ломает скачивание.
    assert.deepEqual(gaps.map((gap) => gap.kind), ['MISSING', 'SIZE', 'PURGED_KEPT', 'ORPHAN', 'ORPHAN']);
    assert.deepEqual(
      gaps.filter((gap) => gap.kind !== 'ORPHAN').map((gap) => [gap.kind, gap.material, gap.work?.title ?? null, gap.version]),
      [
        ['MISSING', 'Глава с расхождениями', 'Работа сверки', 1],
        ['SIZE', 'Глава с расхождениями', 'Работа сверки', 2],
        ['PURGED_KEPT', 'Глава с расхождениями', 'Работа сверки', 3],
      ],
    );
    // Сироте подпись — по ключу: материал, если жива его строка, иначе работа.
    const orphans = gaps.filter((gap) => gap.kind === 'ORPHAN');
    assert.deepEqual(
      orphans.map((gap) => [gap.key === keys.orphan ? 'живой' : 'пропавший', gap.material, gap.work?.title, gap.version]).sort(),
      [
        ['живой', 'Глава с расхождениями', 'Работа сверки', 9],
        ['пропавший', null, 'Работа сверки', 1],
      ],
    );
    assert.equal(gaps.find((gap) => gap.kind === 'MISSING')?.at?.toISOString(), '2026-11-01T00:00:00.000Z', 'дата приёма версии');
    assert.equal(gaps.find((gap) => gap.kind === 'PURGED_KEPT')?.at?.toISOString(), '2026-11-20T00:00:00.000Z', 'дата изъятия');
    assert.ok(orphans.every((gap) => gap.at instanceof Date), 'дата записи файла');
    // Вложения заявок и шаблоны практики сиротами не считаются.
    assert.ok(!(await checkStorage(prisma, store)).gaps.some((gap) => /^(?:leads|templates)\//u.test(gap.key)));
  });

  it('сверка только читает: строки версий и файлы остаются как были', async () => {
    const rows = await prisma.materialVersion.count({ where: { material: { projectId: ids.work } } });
    const before = files();
    await checkStorage(prisma, store);
    await checkStorage(prisma, store);
    assert.equal(await prisma.materialVersion.count({ where: { material: { projectId: ids.work } } }), rows);
    assert.equal(files(), before);
  });

  it('хранилище без перечня — отказ сверки, а не «расхождений нет»', async () => {
    const blind = { put: store.put.bind(store), get: store.get.bind(store), remove: store.remove.bind(store), signedUrl: store.signedUrl.bind(store) };
    await assert.rejects(checkStorage(prisma, blind), StorageCheckFailed);
  });

  it('перечень «Сводки» — только руководителю; клиенту, куратору и менеджеру — ничего', async () => {
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
    const rows = view.rows.filter((row) => row.work?.title === 'Работа сверки');
    assert.deepEqual(
      rows.map((row) => row.label),
      ['нет файла в хранилище', 'размер файла не совпадает', 'версия изъята, файл остался', 'файл без версии в базе', 'файл без версии в базе'],
    );
    // Ключ объекта до экрана не доходит.
    assert.ok(rows.every((row) => !('key' in row)));
    assert.ok(!JSON.stringify(view.rows).includes('projects/'));

    // Отказ хранилища «Сводку» не роняет: перечень говорит, что сверка не выполнена.
    setStorage({ put: store.put.bind(store), get: store.get.bind(store), remove: store.remove.bind(store), signedUrl: store.signedUrl.bind(store) });
    assert.deepEqual(await storageGaps(who(ids.head!, 'HEAD')), { failed: true });
    setStorage(null);
  });
});
