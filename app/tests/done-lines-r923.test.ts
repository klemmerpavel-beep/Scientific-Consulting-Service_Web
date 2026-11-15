/**
 * Короткое подтверждение исхода после действия (решение Р-923).
 *
 * Аудит 15.11.2026, находка Ф-12: десять действий — добавить этап,
 * назначить куратора, сменить состояние заявки и этапа, сохранить
 * договор, добавить и удалить транш, сменить его состояние, начислить и
 * отметить выплату — перерисовывали экран без единого слова.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DONE_LINES, doneLine, trancheDoneCode } from '../src/lib/cabinet/outcome-lines.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const actions = read('app', 'cabinet', 'actions.ts');

/** Тело действия по имени. */
function body(name: string): string {
  const start = actions.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, name);
  const end = actions.indexOf('\nexport async function ', start + 1);
  return actions.slice(start, end < 0 ? undefined : end);
}

describe('строки подтверждения (Р-923)', () => {
  it('знакомый признак даёт строку, незнакомый и пустой — ничего', () => {
    assert.equal(doneLine('tranche-added'), 'Транш добавлен.');
    assert.equal(doneLine('payout-paid'), 'Выплата отмечена.');
    assert.equal(doneLine(undefined), null);
    assert.equal(doneLine('<script>'), null);
    assert.equal(doneLine('constructor'), null);
  });

  it('строка называет род действия: имён, сумм и названий в ней нет', () => {
    for (const line of Object.values(DONE_LINES)) {
      assert.doesNotMatch(line, /\d|«|₽|PD-/u, line);
      assert.deepEqual(findForbidden(line), [], line);
      assert.ok(line.endsWith('.'), line);
    }
  });

  it('смена состояния транша названа по новому состоянию', () => {
    assert.equal(trancheDoneCode('INVOICED'), 'tranche-invoiced');
    assert.equal(trancheDoneCode('PAID'), 'tranche-paid');
    assert.equal(trancheDoneCode('REVERSED'), 'tranche-reversed');
    assert.equal(trancheDoneCode('WRITTEN_OFF'), 'tranche-written-off');
    assert.equal(trancheDoneCode('ЧТО-ТО'), 'tranche-status');
  });
});

describe('десять действий возвращают признак исхода (Р-923)', () => {
  for (const [name, code] of [
    ['createStage', "'stage-added'"],
    ['setExpert', "expertId === '' ? 'curator-unset' : 'curator-set'"],
    ['saveProjectContract', "'contract-saved'"],
    ['addContractTranche', "'tranche-added'"],
    ['changeTrancheStatus', "trancheDoneCode(String(form.get('status') ?? ''))"],
    ['dropTranche', "'tranche-dropped'"],
    ['accruePayout', "'payout-accrued'"],
    ['payPayout', "'payout-paid'"],
    ['changeStageState', "'stage-state'"],
  ] as const) {
    it(name, () => {
      assert.ok(body(name).includes(`'done', ${code})`), `${name}: нет признака ${code}`);
    });
  }

  it('switchLeadStatus — через общий шаг заявки', () => {
    assert.match(body('switchLeadStatus'), /'Не удалось сменить состояние', 'lead-status'\)/u);
    assert.match(actions, /redirect\(done === undefined \? back : withOutcome\(back, 'done', done\)\);/u);
  });

  it('отказ действия идёт прежним путём — с причиной, без подтверждения', () => {
    for (const name of ['createStage', 'saveProjectContract', 'dropTranche', 'payPayout']) {
      assert.match(body(name), /if \(failure !== null\) redirect\(await withError\(/u, name);
    }
  });
});

describe('экраны показывают подтверждение и убирают признак из адреса (Р-923)', () => {
  for (const file of [
    ['app', 'cabinet', 'projects', '[code]', 'page.tsx'],
    ['app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'],
    ['app', 'cabinet', 'manage', 'leads', '[id]', 'page.tsx'],
    ['app', 'cabinet', 'stages', '[id]', 'page.tsx'],
  ]) {
    it(file.slice(2).join('/'), () => {
      const page = read(...file);
      assert.match(page, /doneLine\(/u);
      assert.match(page, /<Outcome id=\{OUTCOME_ANCHOR\}>/u);
      assert.match(page, /<DropFlag names=\{OUTCOME_FLAGS\} \/>/u);
    });
  }
});
