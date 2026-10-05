/**
 * Запрет исполняемых файлов (требование Т-22, решение Р-296): двойное
 * расширение, знак направления U+202E, регистр, поток NTFS, текст на «MZ»
 * без заголовка PE, документы Office разрешены, jar и apk — нет.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BLOCKED_EXAMPLES,
  BLOCKED_EXTENSIONS,
  BLOCKED_HINT,
  executableContent,
  fileRefusal,
  lastExtension,
  normalizeName,
} from '../src/lib/cabinet/file-guard.ts';

/** Минимальный ZIP с данными именами записей — только центральный каталог. */
function zipWith(names: readonly string[]): Buffer {
  const central: Buffer[] = [];
  for (const name of names) {
    const raw = Buffer.from(name, 'utf8');
    const entry = Buffer.alloc(46 + raw.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(raw.length, 28);
    raw.copy(entry, 46);
    central.push(entry);
  }
  const dir = Buffer.concat(central);
  const head = Buffer.from('PK\u0003\u0004', 'latin1');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(head.length, 16);
  return Buffer.concat([head, dir, eocd]);
}

/** Заголовок исполняемого PE: MZ и «PE\0\0» по смещению из 0x3C. */
function pe(): Buffer {
  const body = Buffer.alloc(0x100);
  body.write('MZ', 0, 'latin1');
  body.writeUInt32LE(0x80, 0x3c);
  body.writeUInt32LE(0x00004550, 0x80);
  return body;
}

const text = Buffer.from('Глава 2. Обзор литературы');

describe('исполняемые файлы', () => {
  it('имя нормализуется: регистр, хвостовые точки, поток, знаки направления', () => {
    assert.equal(normalizeName('Setup.EXE. . '), 'setup.exe');
    assert.equal(normalizeName('doc.pdf:payload.exe'), 'doc.pdf');
    assert.equal(lastExtension('invoice\u202Efdp.exe'), 'exe');
    assert.equal(lastExtension('C:\\Users\\a\\report.Bat'), 'bat');
    assert.equal(lastExtension('README'), '');
  });

  it('двойное расширение: решает последнее', () => {
    assert.notEqual(fileRefusal('otchet.pdf.exe', text), null);
    assert.equal(fileRefusal('installer.exe.pdf', text), null);
  });

  it('U+202E и регистр не обходят запрет', () => {
    assert.notEqual(fileRefusal('glava\u202Efdp.exe', text), null);
    assert.notEqual(fileRefusal('SCRIPT.PS1', text), null);
  });

  it('содержимое PE ловится и под чужим именем; текст на «MZ» — нет', () => {
    assert.notEqual(fileRefusal('glava.pdf', pe()), null);
    assert.equal(executableContent(Buffer.from('MZ — это не программа, а инициалы автора'.padEnd(200, '.'))), false);
  });

  it('ELF и Mach-O', () => {
    assert.equal(executableContent(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0])), true);
    assert.equal(executableContent(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0])), true);
  });

  it('docx и xlsx разрешены, jar и apk — нет', () => {
    const docx = zipWith(['[Content_Types].xml', 'word/document.xml', 'docProps/core.xml']);
    assert.equal(fileRefusal('glava.docx', docx), null);
    assert.equal(fileRefusal('tablica.xlsx', zipWith(['xl/workbook.xml'])), null);
    assert.notEqual(fileRefusal('lib.zip', zipWith(['META-INF/MANIFEST.MF', 'app/Main.class'])), null);
    assert.notEqual(fileRefusal('app.zip', zipWith(['AndroidManifest.xml', 'classes.dex'])), null);
    assert.notEqual(fileRefusal('app.apk', text), null);
  });

  it('отказ называет файл и говорит, что делать', () => {
    assert.match(fileRefusal('setup.msi', text) ?? '', /«setup\.msi» не принят.*напишите менеджеру/u);
  });
});

describe('подсказка поля файла (УК-16, Р-367)', () => {
  it('примеры — из перечня запрещённого и все названы в подсказке', () => {
    for (const ext of BLOCKED_EXAMPLES) {
      assert.ok(BLOCKED_EXTENSIONS.has(ext), ext);
      assert.ok(BLOCKED_HINT.includes(`.${ext}`), ext);
    }
  });
});
