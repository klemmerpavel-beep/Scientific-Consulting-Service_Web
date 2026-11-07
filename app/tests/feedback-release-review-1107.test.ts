/**
 * Разбор замечаний выгрузки 07.11.2026 миграцией (решение Р-832, порядок
 * Р-583): состав, состояния и тексты без базы. Прогон на базе —
 * `feedback-release-review-1107.db.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { NOTE_MAX } from '../src/lib/feedback.ts';

const APP = path.join(import.meta.dirname, '..');
const SQL = readFileSync(
  path.join(APP, 'prisma', 'migrations', '20261107190000_feedback_review_release_1107', 'migration.sql'),
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

/** «Новые» замечания выгрузки 07.11.2026 — все 28. */
const EXPORTED = [
  'cmw4yp9mm000601qb2j4rj8cv', 'cmw4yoj5j000501qbj8noxgze', 'cmw4ymkrs000401qblx31i4ml', 'cmw4ylnuh000301qbgujzo8nd',
  'cmw4yld1x000201qbnunpk9ai', 'cmvr7u4mg000501lts5zvicd8', 'cmvr7spfq000401lttelarz3p', 'cmvr7rutj000301ltlxuqv095',
  'cmvr7r90r000201ltu8c5xj19', 'cmvl81b1p000501mtfzjh0o68', 'cmvcvwous000801miw7gvny8t', 'cmvcvvwl7000701miv1a18nos',
  'cmvcvuybr000601miliz3216j', 'cmvcvsy9h000501mir0rn69kh', 'cmvcvr5dc000401miugbo35ny', 'cmvcvp9z0000301mi9d890v5b',
  'cmvcvo262000201mikyrmdobb', 'cmvcvmj98000101mi2vdenffa', 'cmvcovexr000001mi49wvrp5e', 'cmvcb8q05000601p6i1i249cr',
  'cmvcb7wv8000501p6upjh9yys', 'cmva245cy000301p65sngtnbq', 'cmva231t7000201p6ror3rro3', 'cmva21peo000101p67yg09wwq',
  'cmva20fq2000001p69k2nnzrn', 'cmv8ky0aj000101npgr6mjsic', 'cmv8kv2oc000001npcr7jl1jd', 'cmuu41ec2000001r5lnf6b6i5',
];
/** Фото реальных людей в отзывах: заглушка стоит, фото — от авторов. */
const PHOTOS = ['cmva231t7000201p6ror3rro3', 'cmva20fq2000001p69k2nnzrn', 'cmuu41ec2000001r5lnf6b6i5'];

describe('разбор замечаний выгрузки 07.11.2026 (Р-832)', () => {
  it('разобраны все 28 «новых» замечаний выгрузки, без повторов', () => {
    assert.equal(rows.length, 28);
    assert.deepEqual(rows.map((row) => row.id).sort(), [...EXPORTED].sort());
  });

  it('фото реальных людей — «в работе» без даты закрытия, остальное — «исправлено»', () => {
    for (const row of rows) {
      const photo = PHOTOS.includes(row.id);
      assert.equal(row.status, photo ? 'IN_WORK' : 'FIXED', row.id);
      if (photo) {
        assert.equal(row.resolved, null, row.id);
        assert.match(row.note, /ждёт снимков от авторов/u, row.id);
        assert.match(row.note, /Р-590, Р-617/u, row.id);
      }
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

  it('дата закрытия — время слияния выпуска (UTC) или время выката', () => {
    const merges = new Set(['2026-10-14 21:44:19', '2026-10-17 13:29:12', '2026-10-17 13:44:52', '2026-10-17 14:47:48', '2026-10-18 00:00:07', '2026-10-18 11:53:15']);
    for (const row of rows) if (row.resolved !== null) assert.ok(merges.has(row.resolved), `${row.id}: ${row.resolved}`);
    // Выпуск 07.11.2026 закрывается временем выката.
    for (const row of rows.filter((r) => /^Р-82[3-9]|^Р-83[01]/u.test(r.note) && r.status === 'FIXED')) assert.equal(row.resolved, null, row.id);
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
