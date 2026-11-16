/**
 * Разбор замечаний выгрузки 16.11.2026 миграцией (решение Р-952, порядок
 * Р-583 и Р-832): состав, состояния и тексты без базы. Прогон на базе —
 * `feedback-release-review-1116.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { NOTE_MAX } from '../src/lib/feedback.ts';

const APP = path.join(import.meta.dirname, '..');
const SQL = readFileSync(
  path.join(APP, 'prisma', 'migrations', '20261116200000_feedback_review_release_1116', 'migration.sql'),
  'utf8',
);
const SUMMARY = readFileSync(path.join(APP, '..', 'docs', 'DECISIONS-SUMMARY.md'), 'utf8');

/** Строки перечня: идентификатор, состояние, «что сделано», дата закрытия. */
const rows = [...SQL.matchAll(/\('(cm[a-z0-9]+)', '(FIXED|IN_WORK)',\s*'([^']*)',\s*(NULL(?:::timestamp)?|'[^']*')\)/gu)].map((m) => ({
  id: m[1]!,
  status: m[2]!,
  note: m[3]!,
  resolved: m[4]!.startsWith('NULL') ? null : m[4]!.slice(1, -1),
}));

/** Отработанные выпуском замечания выгрузки 16.11.2026: просветы и портреты. */
const DONE = ['cmwgwyrz1000001pgvzwy47p8', 'cmw6x7z1d000001n3o2fmmiru'];
/** «Новые» замечания той же выгрузки, которые ждут снимка или решения владельца. */
const WAITING = ['cmwgx719j000301pgbw4d3qp1', 'cmwgx3qge000201pgkmmuy5o0', 'cmwgx1h4l000101pgnu72docj'];

describe('разбор замечаний выгрузки 16.11.2026 (Р-952)', () => {
  it('разобраны два отработанных замечания, без повторов; ждущие решения не тронуты', () => {
    assert.deepEqual(rows.map((row) => row.id).sort(), [...DONE].sort());
    for (const id of WAITING) assert.ok(!SQL.includes(`'${id}'`), `ждущее решения замечание ${id} попало в разбор`);
  });

  it('оба — «исправлено», дата закрытия — время выката', () => {
    for (const row of rows) {
      assert.equal(row.status, 'FIXED', row.id);
      assert.equal(row.resolved, null, row.id);
    }
    assert.match(SQL, /"resolvedAt" = CASE WHEN v\.status = 'FIXED' THEN COALESCE\(v\.resolved, now\(\) AT TIME ZONE 'UTC'\) END/u);
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
    assert.match(SQL, /'to', done\.status/u);
  });

  it('одна инструкция: проверка на базе прогоняет файл целиком', () => {
    const code = SQL.replace(/--[^\n]*/gu, '').replace(/'[^']*'/gu, "''");
    assert.equal(code.split(';').length - 1, 1);
    assert.ok(code.trimEnd().endsWith(';'));
  });
});
