/**
 * Выдача файла потоком (решение Р-247): локальное хранилище открывает
 * объект на чтение потоком и называет размер; хранилище без потокового
 * чтения отдаёт прочитанное тем же видом; ключ вне каталога не открывается.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { LocalStorage, openObject } from '../src/lib/cabinet/storage.ts';

const APP = path.join(import.meta.dirname, '..');

describe('выдача файла потоком', () => {
  it('локальное хранилище отдаёт поток и размер', async () => {
    const store = new LocalStorage(mkdtempSync(path.join(tmpdir(), 'pd-stream-')));
    const body = Buffer.alloc(3 * 1024 * 1024, 7);
    await store.put('projects/p/materials/m/v1/file.bin', body);
    const opened = await openObject(store, 'projects/p/materials/m/v1/file.bin');
    assert.equal(opened.sizeBytes, body.byteLength);
    const read = Buffer.from(await new Response(opened.stream).arrayBuffer());
    assert.ok(read.equals(body));
  });

  it('хранилище без потока отдаёт прочитанное тем же видом', async () => {
    const opened = await openObject(
      {
        put: () => Promise.reject(new Error('не нужно')),
        get: () => Promise.resolve(Buffer.from('глава')),
        remove: () => Promise.resolve(),
        signedUrl: () => Promise.resolve(null),
      },
      'k',
    );
    assert.equal(await new Response(opened.stream).text(), 'глава');
    assert.equal(opened.sizeBytes, Buffer.byteLength('глава'));
  });

  it('ключ вне каталога не открывается', async () => {
    const store = new LocalStorage(mkdtempSync(path.join(tmpdir(), 'pd-stream-')));
    await assert.rejects(() => store.open('../etc/passwd'), /за пределы каталога/u);
  });

  it('маршруты выдачи отдают поток с длиной, а не буфер', () => {
    for (const file of ['src/app/cabinet/files/[versionId]/route.ts', 'src/app/cabinet/lead-files/[attachmentId]/route.ts']) {
      const source = readFileSync(path.join(APP, file), 'utf8');
      assert.match(source, /new NextResponse\(file\.stream,/u, file);
      assert.match(source, /'content-length': String\(file\.sizeBytes\)/u, file);
    }
  });
});
