/**
 * Объекта нет в хранилище — понятный ответ, а не ошибка 500 (решение
 * Р-907; аудит 15.11.2026, находка Ф-5).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { LocalStorage, OBJECT_MISSING_TEXT, ObjectMissing, openObject, type Storage } from '../src/lib/cabinet/storage.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]): string => readFileSync(path.join(SRC, ...parts), 'utf8');

describe('openObject без объекта (Р-907)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pd-missing-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('диск: отсутствующий файл — ObjectMissing с ключом и прежним кодом ENOENT', async () => {
    const store = new LocalStorage(dir);
    await assert.rejects(openObject(store, 'projects/p/materials/m/v1/none.bin'), (error: unknown) => {
      assert.ok(error instanceof ObjectMissing);
      assert.equal(error.key, 'projects/p/materials/m/v1/none.bin');
      assert.equal(error.code, 'ENOENT');
      return true;
    });
  });

  it('хранилище без потокового чтения: тот же отказ', async () => {
    const store = {
      get: async () => {
        throw Object.assign(new Error('нет файла'), { code: 'ENOENT' });
      },
    } as unknown as Storage;
    await assert.rejects(openObject(store, 'k'), ObjectMissing);
  });

  it('прочие ошибки хранилища не маскируются', async () => {
    const store = {
      get: async () => {
        throw Object.assign(new Error('диск не отвечает'), { code: 'EIO' });
      },
    } as unknown as Storage;
    await assert.rejects(openObject(store, 'k'), /диск не отвечает/u);
  });

  it('существующий объект открывается как прежде', async () => {
    const store = new LocalStorage(dir);
    await store.put('a/b.bin', Buffer.from('данные'));
    const opened = await openObject(store, 'a/b.bin');
    assert.equal(opened.sizeBytes, Buffer.byteLength('данные'));
  });
});

describe('выдача файла без объекта (Р-907)', () => {
  it('журнал доступа пишется после открытия объекта, а не до', () => {
    const materials = read('lib', 'cabinet', 'materials.ts');
    const start = materials.indexOf('export async function readVersion(');
    const body = materials.slice(start, materials.indexOf('\n}\n', start));
    assert.ok(body.indexOf('openObject(storage(), version.storageKey)') < body.indexOf('prisma.fileAccessLog.create('));
  });

  for (const route of [
    ['files', '[versionId]', 'route.ts'],
    ['lead-files', '[attachmentId]', 'route.ts'],
  ]) {
    it(`${route.join('/')}: ответ 404 с текстом для человека`, () => {
      const body = read('app', 'cabinet', ...route);
      assert.match(body, /if \(error instanceof ObjectMissing\) \{[\s\S]{0,160}return new NextResponse\(OBJECT_MISSING_TEXT, \{\s*status: 404,/u);
    });
  }

  it('текст называет, что делать', () => {
    assert.match(OBJECT_MISSING_TEXT, /Напишите менеджеру работы/u);
  });
});
