/**
 * Копии базы не идут разом (решение Р-442).
 *
 * Звено блокировки вырезается из deploy/backup.sh и выполняется в sh:
 * пока первая копия держит блокировку, вторая ждёт, а не идёт рядом.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'backup.sh'), 'utf8');
const lockAt = script.indexOf('exec 8> "$DIR/backups/.lock"');
const lockBlock = script.slice(script.lastIndexOf('if command -v flock', lockAt), script.indexOf('\nfi\n', lockAt) + 4);
const hasFlock = (() => {
  try {
    execFileSync('sh', ['-c', 'command -v flock']);
    return true;
  } catch {
    return false;
  }
})();

describe('блокировка копии базы (Р-442)', () => {
  it('блокировка стоит до снятия дампа и ждёт, а не отказывает сразу', () => {
    assert.ok(lockAt > 0, 'в backup.sh нет блокировки');
    assert.ok(lockAt < script.indexOf('pg_dump'), 'блокировка после снятия дампа');
    assert.match(lockBlock, /flock -w \d+ 8/u);
  });

  it('вторая копия ждёт, пока первая держит блокировку', { skip: !hasFlock }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pd-backup-lock-'));
    mkdirSync(path.join(dir, 'backups'));
    try {
      // Первая «копия» держит блокировку полторы секунды.
      const first = spawn('sh', ['-c', `${lockBlock}\nsleep 1.5`], { env: { ...process.env, DIR: dir } });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const started = Date.now();
      execFileSync('sh', ['-c', `${lockBlock}\ntrue`], { env: { ...process.env, DIR: dir } });
      const waited = Date.now() - started;
      await new Promise((resolve) => first.on('exit', resolve));
      assert.ok(waited >= 900, `вторая копия не ждала: ${waited} мс`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
