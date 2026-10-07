/**
 * Имя файла в заголовке выдачи — по RFC 8187 (решение Р-432).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { attachmentDisposition } from '../src/lib/cabinet/disposition.ts';

/** Разбор filename* так, как его разбирает браузер: кодировка'язык'значение. */
function decodedName(header: string): string {
  const value = /filename\*=([^;]+)/u.exec(header)![1]!;
  const [charset, , encoded] = value.split("'");
  assert.equal(charset, 'UTF-8');
  return decodeURIComponent(encoded!);
}

describe('заголовок выдачи файла (Р-432)', () => {
  it('апостроф, скобки, звёздочка и восклицательный знак закодированы', () => {
    for (const name of ["O'Brien.pdf", 'Отзыв на главу (2).docx', 'итог*!.xlsx']) {
      const header = attachmentDisposition(name);
      const star = /filename\*=([^;]+)/u.exec(header)![1]!;
      assert.equal(star.split("'").length, 3, `в значении лишний апостроф: ${star}`);
      assert.doesNotMatch(star.slice("UTF-8''".length), /[!'()*]/u, star);
      assert.equal(decodedName(header), name);
    }
  });

  it('запасное имя — ASCII без кавычек и управляющих знаков', () => {
    const header = attachmentDisposition('Глава "1"\r\n.docx');
    const fallback = /filename="([^"]*)"/u.exec(header)![1]!;
    assert.match(fallback, /^[\x20-\x7e]+$/u);
    assert.doesNotMatch(fallback, /["\\]/u);
    assert.match(attachmentDisposition('Замечания.xlsx', 'zamechaniya.xlsx'), /filename="zamechaniya\.xlsx"/u);
  });

  it('все выдачи файлов берут общий заголовок', () => {
    const APP = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
    for (const route of ['files/[versionId]/route.ts', 'lead-files/[attachmentId]/route.ts', 'manage/feedback/export/route.ts', 'manage/leads/export/route.ts']) {
      const source = readFileSync(path.join(APP, route), 'utf8');
      assert.match(source, /attachmentDisposition\(/u, route);
      assert.doesNotMatch(source, /filename\*=UTF-8''\$\{encodeURIComponent/u, route);
    }
  });
});
