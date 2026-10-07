/**
 * Короткие секреты машинных адресов в отчёте цепочки (решение Р-431).
 *
 * Звено проверяется на деле: из скрипта вырезается его цикл и выполняется
 * в sh с подменённым чтением deploy/.env.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const script = readFileSync(path.join(ROOT, 'deploy', 'chain-check.sh'), 'utf8');
const loop = script.slice(
  script.indexOf('for name in CABINET_CRON_SECRET'),
  script.indexOf('done', script.indexOf('for name in CABINET_CRON_SECRET')) + 'done'.length,
);

/** Прогнать звено с заданными значениями переменных окружения развёртывания. */
function run(env: Record<string, string>): string {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n');
  const harness = [
    `read_env() { printf '%s\\n' "$ENV_LINES" | sed -n "s/^$1=//p" | head -n 1; }`,
    `bad() { echo "[!] $*"; }`,
    loop,
  ].join('\n');
  return execFileSync('sh', ['-c', harness], { encoding: 'utf8', env: { ...process.env, ENV_LINES: lines } });
}

describe('секреты машинных адресов в отчёте цепочки (Р-431)', () => {
  it('короткий секрет — предупреждение без значения', () => {
    const out = run({ CABINET_CRON_SECRET: 'short-secret', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(64) });
    assert.match(out, /секрет CABINET_CRON_SECRET короче 32 знаков/u);
    assert.doesNotMatch(out, /TELEGRAM_WEBHOOK_SECRET/u);
    assert.doesNotMatch(out, /short-secret/u, 'значение секрета попало в отчёт');
  });

  it('незаданный и длинный секреты — молчание', () => {
    assert.equal(run({ FEEDBACK_EXPORT_TOKEN: 'x'.repeat(32) }), '');
  });
});
