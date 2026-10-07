/**
 * Сверка переноса книги читает разобранные значения только у последней
 * строки каждой работы (решение Р-477): первый запрос по всем прежним
 * версиям — без столбца `parsed`, второй — по отобранным идентификаторам.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(path.join(import.meta.dirname, '../src/lib/cabinet/import/apply.ts'), 'utf8');
const start = source.indexOf('async function knownWorks(');
const body = source.slice(start, source.indexOf('\n}\n', start));

describe('сверка переноса книги — лёгкий первый запрос', () => {
  it('первый запрос без разобранных значений, второй — по последним строкам', () => {
    assert.ok(start >= 0, 'knownWorks не найдена');
    const first = body.slice(body.indexOf('db.importRow.findMany('), body.indexOf('const ordered'));
    assert.doesNotMatch(first, /parsed: true/u, 'разобранные значения всех версий читаются первым запросом');
    const second = body.slice(body.indexOf('const details'));
    assert.match(second, /where: \{ id: \{ in: /u);
    assert.match(second, /parsed: true/u);
  });
});
