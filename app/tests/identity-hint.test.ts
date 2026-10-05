/**
 * ФИО куратора в имени файла и в свойствах документа (улучшение УК-03,
 * решение Р-396): фамилия по-русски и латиницей; автор из
 * `docProps/core.xml` сжатого и несжатого ZIP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { documentAuthors, identityHint, latinSurname, zipEntry } from '../src/lib/cabinet/identity-hint.ts';

/** ZIP из записей: локальные заголовки, данные, центральный каталог. */
function zip(entries: readonly { name: string; data: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, eocd]);
}

const core = (creator: string, modified = '') =>
  Buffer.from(
    `<?xml version="1.0"?><cp:coreProperties><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${modified}</cp:lastModifiedBy></cp:coreProperties>`,
    'utf8',
  );

describe('ФИО куратора в документе (УК-03)', () => {
  it('автор и «кем изменён» читаются из сжатой и несжатой записи', () => {
    const docx = zip([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'docProps/core.xml', data: core('Ivanov I.I.', 'Петров &amp; Ко'), deflate: true },
    ]);
    assert.deepEqual(documentAuthors(docx), ['Ivanov I.I.', 'Петров & Ко']);
    assert.ok(zipEntry(zip([{ name: 'docProps/core.xml', data: core('x') }]), 'docProps/core.xml') !== null);
    assert.deepEqual(documentAuthors(Buffer.from('не zip')), []);
  });

  it('фамилия — по-русски и латиницей, в имени файла и в авторе', () => {
    const docx = zip([{ name: 'docProps/core.xml', data: core('Ivanov I.I.'), deflate: true }]);
    assert.equal(latinSurname('Щукина'), 'shchukina');
    assert.equal(identityHint('Глава_2.docx', docx, 'Иванов Иван Иванович'), true, 'автор латиницей');
    assert.equal(identityHint('Глава_2_Иванов.pdf', Buffer.from('%PDF'), 'Иванов Иван Иванович'), true, 'имя файла');
    assert.equal(identityHint('Глава_2.pdf', Buffer.from('%PDF'), 'Иванов Иван Иванович'), false);
    assert.equal(identityHint('Глава_Ли.pdf', Buffer.from('%PDF'), 'Ли Ан'), false, 'короткая фамилия не проверяется');
  });
});
