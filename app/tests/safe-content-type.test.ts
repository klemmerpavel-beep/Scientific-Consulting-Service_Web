/**
 * Опасный тип содержимого заменяется нейтральным на всех выдачах файлов
 * (решения Р-165, Р-902; аудит 15.11.2026, находка П-8).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { safeContentType } from '../src/lib/cabinet/disposition.ts';

const CABINET = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const read = (...parts: string[]): string => readFileSync(path.join(CABINET, ...parts), 'utf8');

describe('safeContentType (Р-902)', () => {
  it('разметка, сценарии и стили отдаются нейтральным типом', () => {
    for (const type of [
      'text/html',
      'TEXT/HTML; charset=utf-8',
      ' text/html',
      'image/svg+xml',
      'application/xhtml+xml',
      'text/xml',
      'application/xml',
      'text/css',
      'application/javascript',
      'text/javascript',
    ]) {
      assert.equal(safeContentType(type), 'application/octet-stream', type);
    }
  });

  it('обычные типы документов не меняются', () => {
    for (const type of [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'text/plain; charset=utf-8',
    ]) {
      assert.equal(safeContentType(type), type);
    }
  });

  it('пустой тип и тип со знаками вне печатного ASCII в заголовок не идут', () => {
    assert.equal(safeContentType(''), 'application/octet-stream');
    assert.equal(safeContentType(null), 'application/octet-stream');
    assert.equal(safeContentType('application/pdf\r\nx-evil: 1'), 'application/octet-stream');
    assert.equal(safeContentType('текст/документ'), 'application/octet-stream');
  });
});

describe('выдачи файлов, загруженных людьми, берут тип через общее правило (Р-902)', () => {
  for (const route of [
    ['files', '[versionId]', 'route.ts'],
    ['lead-files', '[attachmentId]', 'route.ts'],
    ['downloads', '[file]', 'route.ts'],
    ['manage', 'experts', 'files', '[fileId]', 'route.ts'],
  ]) {
    it(route.join('/'), () => {
      const body = read(...route);
      assert.match(body, /'content-type': safeContentType\(/u);
      assert.doesNotMatch(body, /const RISKY\b/u);
    });
  }
});
