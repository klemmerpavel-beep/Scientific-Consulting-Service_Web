/**
 * Проверка восстановления не подтверждает повреждённую копию (решение
 * Р-443). Звено проверки целостности вырезается из deploy/restore-check.sh
 * и выполняется в sh на временных файлах.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'restore-check.sh'), 'utf8');
const from = script.indexOf('if ! gzip -t "$FILE"');
const block = script.slice(from, script.indexOf('\ndone\n', from) + 6);

const DUMP = 'CREATE TABLE "Lead" (id text);\n'.repeat(200) + '--\n-- PostgreSQL database dump complete\n--\n';

function check(prepare: (dir: string) => string): number {
  const dir = mkdtempSync(path.join(tmpdir(), 'pd-restore-'));
  mkdirSync(path.join(dir, 'backups'));
  try {
    const file = prepare(dir);
    return spawnSync('sh', ['-c', `set -eu\n${block}`], { env: { ...process.env, DIR: dir, FILE: file }, stdio: 'ignore' }).status ?? -1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const dump = (dir: string, bytes: Buffer) => {
  const file = path.join(dir, 'backups', 'prodisser_2026-10-07_0300.sql.gz');
  writeFileSync(file, bytes);
  return file;
};

describe('целостность копии перед восстановлением (Р-443)', () => {
  it('полная копия проходит', () => {
    assert.equal(check((dir) => dump(dir, gzipSync(DUMP))), 0);
  });

  it('усечённый архив отклоняется', () => {
    const whole = gzipSync(DUMP);
    assert.notEqual(check((dir) => dump(dir, whole.subarray(0, Math.floor(whole.length / 2)))), 0);
  });

  it('дамп без отметки о завершении отклоняется', () => {
    assert.notEqual(check((dir) => dump(dir, gzipSync('CREATE TABLE "Lead" (id text);\n'.repeat(200)))), 0);
  });

  it('нечитаемый архив хранилища отклоняется, читаемый — нет', () => {
    const good = (dir: string) => {
      mkdirSync(path.join(dir, 'storage'));
      writeFileSync(path.join(dir, 'storage', 'a.txt'), 'файл');
      execFileSync('tar', ['-czf', path.join(dir, 'backups', 'storage_2026-10-07_0300_full.tar.gz'), '-C', dir, 'storage']);
      return dump(dir, gzipSync(DUMP));
    };
    assert.equal(check(good), 0);
    assert.notEqual(
      check((dir) => {
        writeFileSync(path.join(dir, 'backups', 'storage_2026-10-07_0300_diff.tar.gz'), Buffer.from('не архив'));
        return dump(dir, gzipSync(DUMP));
      }),
      0,
    );
  });
});
