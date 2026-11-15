/**
 * Дата из формы — строго существующий день (решение Р-908; аудит
 * 15.11.2026, находка Ф-10).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DATE_WRONG, DATE_YEAR_WRONG, formDate } from '../src/lib/cabinet/form-date.ts';

describe('formDate (Р-908)', () => {
  it('обычный день — полночь UTC', () => {
    assert.equal(formDate('2026-11-15')?.toISOString(), '2026-11-15T00:00:00.000Z');
    assert.equal(formDate(' 2028-02-29 ')?.toISOString(), '2028-02-29T00:00:00.000Z');
  });

  it('пустое значение — отсутствие даты', () => {
    assert.equal(formDate(''), null);
    assert.equal(formDate('   '), null);
    assert.equal(formDate(null), null);
  });

  it('несуществующий день — отказ, а не соседний день', () => {
    for (const raw of ['2026-02-31', '2027-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-06-00']) {
      assert.throws(() => formDate(raw), new RegExp(DATE_WRONG, 'u'), raw);
    }
  });

  it('нечитаемое значение — отказ, а не «без срока»', () => {
    for (const raw of ['15.11.2026', '2026-1-5', 'завтра', '2026-11-15T10:00', '20261115']) {
      assert.throws(() => formDate(raw), new RegExp(DATE_WRONG, 'u'), raw);
    }
  });

  it('год двумя цифрами и год вне пределов — отказ', () => {
    for (const raw of ['0026-11-15', '1999-12-31', '2101-01-01']) {
      assert.throws(() => formDate(raw), new RegExp(DATE_YEAR_WRONG, 'u'), raw);
    }
    assert.ok(formDate('2000-01-01'));
    assert.ok(formDate('2100-12-31'));
  });

  it('действия кабинета разбирают дату этой функцией, и каждый вызов стоит внутри try', () => {
    const actions = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'actions.ts'), 'utf8');
    assert.match(actions, /function dateOrNull\(value: FormDataEntryValue \| null\): Date \| null \{\s*return formDate\(value\);\s*\}/u);
    assert.doesNotMatch(actions, /new Date\(`\$\{raw\}T00:00:00Z`\)/u);
    const lines = actions.split('\n');
    let calls = 0;
    lines.forEach((line, index) => {
      if (!line.includes('dateOrNull(') || line.includes('function dateOrNull')) return;
      calls += 1;
      let scope: string | null = null;
      for (let at = index; at >= 0 && scope === null; at -= 1) {
        if (/^(export )?(async )?function /u.test(lines[at]!)) scope = 'none';
        else if (/^\s*try \{/u.test(lines[at]!)) scope = 'try';
        else if (/^\s*\} catch/u.test(lines[at]!)) scope = 'after';
      }
      assert.equal(scope, 'try', `строка ${index + 1}: разбор даты вне try`);
    });
    assert.ok(calls >= 17, `вызовов ${calls}`);
  });
});
