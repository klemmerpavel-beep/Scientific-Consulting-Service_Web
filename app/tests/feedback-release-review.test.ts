/**
 * Разбор отработанных замечаний миграцией (решение Р-583): состав и тексты
 * без базы. Прогон на базе — `feedback-release-review.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { NOTE_MAX } from '../src/lib/feedback.ts';

const APP = path.join(import.meta.dirname, '..');
const SQL = readFileSync(
  path.join(APP, 'prisma', 'migrations', '20261014130000_feedback_review_release', 'migration.sql'),
  'utf8',
);
const SUMMARY = readFileSync(path.join(APP, '..', 'docs', 'DECISIONS-SUMMARY.md'), 'utf8');

/** Строки перечня: идентификатор замечания и «что сделано». */
const rows = [...SQL.matchAll(/\('(cm[a-z0-9]+)',\s*'([^']*)',/gu)].map((match) => ({ id: match[1]!, note: match[2]! }));

describe('разбор отработанных замечаний (Р-583)', () => {
  it('тридцать замечаний, без повторов, идентификаторы виджета', () => {
    assert.equal(rows.length, 30);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
    for (const row of rows) assert.match(row.id, /^cm[a-z0-9]{23}$/u);
  });

  it('неотработанное замечание о фотографиях в отзывах не трогается', () => {
    assert.ok(!SQL.includes('cmuu41ec2000001r5lnf6b6i5'));
  });

  it('«что сделано» начинается с решения, решение есть в своде, длина в пределе экрана', () => {
    for (const row of rows) {
      assert.match(row.note, /^Р-\d+/u, row.id);
      assert.ok(row.note.length <= NOTE_MAX, row.id);
      for (const [, number] of row.note.matchAll(/Р-(\d+)/gu)) {
        assert.ok(SUMMARY.includes(`| Р-${number} |`), `в своде нет Р-${number}`);
      }
    }
  });

  it('трогает только «новые» и пишет журнал: разбор руководителя не перетирается', () => {
    assert.match(SQL, /AND f\.status = 'NEW'/u);
    assert.match(SQL, /'FEEDBACK_REVIEWED'/u);
    assert.match(SQL, /'via', 'release'/u);
  });

  it('одна инструкция: проверка на базе прогоняет файл целиком', () => {
    const code = SQL.replace(/--[^\n]*/gu, '').replace(/'[^']*'/gu, "''");
    assert.equal(code.split(';').length - 1, 1);
    assert.ok(code.trimEnd().endsWith(';'));
  });
});
