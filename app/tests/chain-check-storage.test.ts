/**
 * Сверка файлов работ с хранилищем в отчёте цепочки выката (план доработки
 * 19.11.2026, К-5; решение Р-986).
 *
 * Звено проверяется на деле, как секреты (Р-431): из скрипта вырезается его
 * блок и выполняется в sh с подменённым чтением deploy/.env; ответ
 * приложения подставляется файлом (`file://`) — curl читает его тем же
 * вызовом, что и адрес приложения на сервере.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const script = readFileSync(path.join(ROOT, 'deploy', 'chain-check.sh'), 'utf8');
const start = script.indexOf('if [ -z "$(read_env CABINET_CRON_SECRET)" ]', script.indexOf('# Сверка версий материалов с хранилищем'));
const block = script.slice(start, script.indexOf('\nfi\n', start) + '\nfi\n'.length);
const dir = mkdtempSync(path.join(tmpdir(), 'pd-chain-storage-'));

/** Прогнать звено: значения deploy/.env и ответ приложения (`null` — не ответило). */
function run(env: Record<string, string>, answer: string | null): string {
  const file = path.join(dir, `answer-${Math.random().toString(36).slice(2)}.json`);
  if (answer !== null) writeFileSync(file, answer);
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n');
  const harness = [
    `read_env() { printf '%s\\n' "$ENV_LINES" | sed -n "s/^$1=//p" | head -n 1; }`,
    `ok() { echo "[ок] $*"; }`,
    `off() { echo "[—] $*"; }`,
    `bad() { echo "[!] $*"; }`,
    `STORAGE_CHECK="file://${file}"`,
    block,
  ].join('\n');
  return execFileSync('sh', ['-c', harness], { encoding: 'utf8', env: { ...process.env, ENV_LINES: lines } });
}

const SECRET = { CABINET_CRON_SECRET: 's'.repeat(40) };

describe('сверка файлов работ в отчёте цепочки (Р-986)', () => {
  it('блок вырезан целиком и обращается к приложению, а не к хранилищу напрямую', () => {
    assert.ok(start > 0);
    assert.match(block, /-H @- "\$STORAGE_CHECK"/u);
    assert.match(script, /STORAGE_CHECK="\$\{CHAIN_STORAGE_CHECK:-http:\/\/127\.0\.0\.1:3000\/cabinet\/api\/storage-check\}"/u);
    // Секрет — через ввод curl, не аргументом (Р-454).
    assert.doesNotMatch(block, /-H "x-cabinet-cron/u);
  });

  it('без секрета рассылки — звено не включено', () => {
    assert.match(run({}, null), /^\[—\] файлы работ: сверка с хранилищем не включена/u);
  });

  it('всё сходится — [ок]', () => {
    const out = run(SECRET, '{"ok":true,"missing":0,"size":0,"purgedKept":0,"orphans":0}');
    assert.equal(out.trim(), '[ок] файлы работ: версии материалов и хранилище сходятся');
  });

  it('расхождения — [!] с числами по видам, без ключей и путей', () => {
    const out = run(SECRET, '{"ok":true,"missing":2,"size":1,"purgedKept":0,"orphans":3}');
    assert.match(out, /^\[!\] файлы работ: версий без файла — 2, размер расходится — 1, изъятых с файлом — 0, файлов без версии — 3/u);
    assert.doesNotMatch(out, /projects\/|storage|s{40}/u, 'в отчёт попал путь или секрет');
  });

  it('сбой сверки и молчание приложения — [!], а не падение отчёта', () => {
    assert.match(run(SECRET, '{"ok":false}'), /^\[!\] файлы работ: сверка с хранилищем не выполнена/u);
    assert.match(run(SECRET, null), /^\[!\] файлы работ: сверка с хранилищем не выполнена/u);
    assert.match(run(SECRET, 'Не найдено'), /^\[!\] файлы работ: сверка с хранилищем не выполнена/u);
  });
});
