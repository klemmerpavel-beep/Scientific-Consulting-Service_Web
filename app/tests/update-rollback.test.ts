/**
 * Откат выката возвращает версию, работавшую в контейнере (решение Р-441).
 *
 * Звено отката вырезается из deploy/update.sh и выполняется в sh на
 * временном хранилище git из двух коммитов: W (работала) и X (упала).
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'update.sh'), 'utf8');
const start = script.indexOf('ROLLBACK="${DEPLOYED:-$BEFORE}"');
const block = script.slice(start, script.indexOf('\n', script.indexOf('> "$DIR/.deployed"', start)));

function scenario(deployed: 'W' | ''): { head: string; mark: string; w: string; x: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pd-rollback-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.org', '-c', 'user.name=t', ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'W');
    const w = git('rev-parse', '--short', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'X');
    const x = git('rev-parse', '--short', 'HEAD');
    // Повтор упавшего выката: рабочая копия уже на X, контейнер — на W.
    const env = { ...process.env, DIR: dir, BEFORE: x, DEPLOYED: deployed === 'W' ? w : '' };
    execFileSync('sh', ['-c', `set -eu; cd "$DIR"; ${block}`], { env });
    return { head: git('rev-parse', '--short', 'HEAD'), mark: readFileSync(path.join(dir, '.deployed'), 'utf8').trim(), w, x };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('откат выката (Р-441)', () => {
  it('возвращает работавшую версию и записывает её выкаченной', () => {
    const run = scenario('W');
    assert.equal(run.head, run.w, 'рабочая копия осталась на упавшей версии');
    assert.equal(run.mark, run.w, 'выкаченной записана упавшая версия');
  });

  it('без отметки — первая установка — версия до запуска', () => {
    const run = scenario('');
    assert.equal(run.head, run.x);
    assert.equal(run.mark, run.x);
  });
});
