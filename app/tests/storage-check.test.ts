/**
 * Сверка версий материалов с хранилищем без базы (план доработки
 * 19.11.2026, К-5; решение Р-986): сравнение строк с объектами, разбор
 * ключа, перечень локального хранилища, маршрут отчёта цепочки и экран.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { compareVersions, materialKeyParts, STORAGE_GAP_KINDS, STORAGE_GAP_LABEL, type VersionRow } from '../src/lib/cabinet/storage-gaps.ts';
import { LocalStorage } from '../src/lib/cabinet/storage.ts';

const APP = path.join(import.meta.dirname, '..');
const at = new Date('2026-11-20T10:00:00Z');
const version = (id: string, key: string, size: number, purged = false): VersionRow => ({
  id,
  number: 1,
  storageKey: key,
  sizeBytes: BigInt(size),
  uploadedAt: at,
  purgedAt: purged ? at : null,
});
const object = (key: string, size: number) => ({ key, sizeBytes: size, modifiedAt: at });

describe('сверка версий с хранилищем: сравнение (Р-986)', () => {
  it('всё сходится — расхождений нет', () => {
    const key = 'projects/p/materials/m/v1/a.docx';
    assert.deepEqual(compareVersions([version('v1', key, 10)], [object(key, 10)]), []);
  });

  it('пропавший файл, чужой размер, изъятая версия с файлом и сирота различаются', () => {
    const gaps = compareVersions(
      [
        version('gone', 'projects/p/materials/m/v1/a', 10),
        version('size', 'projects/p/materials/m/v2/b', 10),
        version('kept', 'projects/p/materials/m/v3/c', 10, true),
        version('purged', 'projects/p/materials/m/v4/d', 10, true),
      ],
      [object('projects/p/materials/m/v2/b', 11), object('projects/p/materials/m/v3/c', 10), object('projects/p/materials/m/v9/z', 5)],
    );
    assert.deepEqual(
      gaps.map((gap) => [gap.kind, gap.version?.id ?? gap.key]),
      [
        ['MISSING', 'gone'],
        ['SIZE', 'size'],
        ['PURGED_KEPT', 'kept'],
        ['ORPHAN', 'projects/p/materials/m/v9/z'],
      ],
    );
  });

  it('версия с ключом вне префикса ищется поштучно и сиротой не считается', () => {
    const key = 'legacy/file.pdf';
    assert.deepEqual(compareVersions([version('old', key, 4)], [], new Map([[key, { sizeBytes: 4, modifiedAt: at }]])), []);
    assert.equal(compareVersions([version('old', key, 4)], [], new Map([[key, null]]))[0]?.kind, 'MISSING');
  });

  it('ключ версии разбирается на работу, материал и номер; чужой ключ — нет', () => {
    assert.deepEqual(materialKeyParts('projects/p1/materials/m1/v12/0b6e.docx'), { projectId: 'p1', materialId: 'm1', version: 12 });
    assert.equal(materialKeyParts('leads/l1/x.pdf'), null);
    assert.equal(materialKeyParts('projects/p1/materials/m1/v1/a/b'), null);
  });

  it('у каждого вида есть подпись, и порядок видов полон', () => {
    assert.deepEqual([...STORAGE_GAP_KINDS].sort(), ['MISSING', 'ORPHAN', 'PURGED_KEPT', 'SIZE']);
    for (const kind of STORAGE_GAP_KINDS) assert.ok(STORAGE_GAP_LABEL[kind].length > 0);
  });
});

describe('локальное хранилище: перечень и размер (Р-986)', () => {
  it('перечень под префиксом — ключами от корня, с размером; нет каталога — пусто', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pd-list-'));
    const store = new LocalStorage(root);
    assert.deepEqual(await store.list('projects/'), []);
    mkdirSync(path.join(root, 'projects', 'p', 'materials', 'm', 'v1'), { recursive: true });
    writeFileSync(path.join(root, 'projects', 'p', 'materials', 'm', 'v1', 'a.docx'), 'abc');
    mkdirSync(path.join(root, 'leads', 'l'), { recursive: true });
    writeFileSync(path.join(root, 'leads', 'l', 'b.pdf'), 'x');
    const listed = await store.list('projects/');
    assert.deepEqual(listed.map((item) => [item.key, item.sizeBytes]), [['projects/p/materials/m/v1/a.docx', 3]]);
    assert.equal((await store.stat('leads/l/b.pdf'))?.sizeBytes, 1);
    assert.equal(await store.stat('leads/l/none.pdf'), null);
    // Выход за корень по-прежнему запрещён.
    await assert.rejects(store.list('../'), /за пределы/u);
  });
});

describe('отчёт цепочки и экран руководителя: состав и права (Р-986)', () => {
  it('маршрут сверки закрыт секретом рассылки и отдаёт только числа по видам', () => {
    const route = readFileSync(path.join(APP, 'src/app/cabinet/api/storage-check/route.ts'), 'utf8');
    assert.match(route, /sameSecret\(request\.headers\.get\('x-cabinet-cron'\), secret\)/u);
    assert.match(route, /status: 404/u);
    const answer = route.slice(route.indexOf('NextResponse.json({'), route.indexOf('});', route.indexOf('NextResponse.json({')));
    assert.deepEqual([...answer.matchAll(/^\s+(\w+):/gmu)].map((m) => m[1]), ['ok', 'missing', 'size', 'purgedKept', 'orphans']);
    assert.doesNotMatch(route, /gaps|key:|title/u);
    assert.doesNotMatch(route, /\b(?:remove|delete|update|create)\w*\(/u, 'сверка только читает');
  });

  it('служба сверки ничего не пишет и не удаляет', () => {
    for (const file of ['storage-check.ts', 'storage-gaps.ts']) {
      const source = readFileSync(path.join(APP, 'src/lib/cabinet', file), 'utf8');
      assert.doesNotMatch(source, /\.(?:remove|put|delete|deleteMany|update|updateMany|upsert|create|createMany)\(/u, file);
    }
  });

  it('«Сводка»: перечень — только из службы, отвечающей руководителю; кнопок и форм в нём нет', () => {
    const service = readFileSync(path.join(APP, 'src/lib/cabinet/head-checks.ts'), 'utf8');
    const fn = service.slice(service.indexOf('export async function storageGaps('));
    assert.match(fn, /if \(actor\.role !== 'HEAD' \|\| actor\.status !== 'ACTIVE'\) return null;\n\s+ensure\(actor, 'AUDIT_VIEW'\);/u);
    // Ключ объекта до экрана не доходит.
    const row = fn.slice(fn.indexOf('rows: check.gaps.map('), fn.indexOf('})),'));
    assert.doesNotMatch(row, /\bkey\b/u);

    const page = readFileSync(path.join(APP, 'src/app/cabinet/manage/page.tsx'), 'utf8');
    const block = page.slice(page.indexOf('<Block id="storage"'), page.indexOf('</Block>', page.indexOf('<Block id="storage"')));
    assert.match(page, /const storage = await storageGaps\(actor\);/u);
    assert.match(page, /\{storage === null \? null : \(\n\s+<Block id="storage"/u);
    assert.match(block, /Расхождений нет/u);
    assert.doesNotMatch(block, /<Form|<Button|action=|Удалить|удалить</u);
  });
});
