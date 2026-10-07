/**
 * Секрет рассылки не виден в списке процессов (решение Р-454).
 *
 * deploy/outbox.sh запускается в sh с подменённым curl: подмена пишет свои
 * аргументы и ввод в файл, по ним видно, как передан секрет.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, '..', '..', 'deploy', 'outbox.sh');

function run(answer: string): { args: string; input: string; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pd-outbox-'));
  try {
    copyFileSync(SCRIPT, path.join(dir, 'outbox.sh'));
    writeFileSync(path.join(dir, '.env'), 'CABINET_CRON_SECRET=s3cr3t-value-for-test\n');
    const fake = path.join(dir, 'curl');
    writeFileSync(
      fake,
      `#!/bin/sh\nprintf '%s\\n' "$*" > "${dir}/args"\ncat > "${dir}/input"\nprintf '%s' '${answer}'\n`,
    );
    chmodSync(fake, 0o755);
    const out = execFileSync('sh', [path.join(dir, 'outbox.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    return {
      args: readFileSync(path.join(dir, 'args'), 'utf8'),
      input: readFileSync(path.join(dir, 'input'), 'utf8'),
      out,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const QUIET = '{"ok":true,"reminders":0,"approvalReminders":0,"deadlinesStarted":0,"autoAccepted":0,"stepsFailed":[],"sent":0,"failed":0}';

describe('скрипт рассылки (Р-454)', () => {
  it('секрет идёт через ввод curl, а не аргументом', () => {
    const { args, input } = run(QUIET);
    assert.doesNotMatch(args, /s3cr3t/u, 'секрет виден в аргументах процесса');
    assert.match(args, /-H @-/u);
    assert.equal(input, 'x-cabinet-cron: s3cr3t-value-for-test\n');
  });

  it('тихий прогон молчит, упавший шаг пишется в журнал', () => {
    assert.equal(run(QUIET).out, '');
    assert.match(run(QUIET.replace('"stepsFailed":[]', '"stepsFailed":["enqueueHeadDigest"]')).out, /рассылка: .*enqueueHeadDigest/u);
  });
});
