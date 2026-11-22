/**
 * Сверка файлов работ с хранилищем в отчёте цепочки выката (план доработки
 * 19.11.2026, К-5; решение Р-986) и вторая строка того же обращения —
 * вложения заявок и анкеты (решение Р-1007).
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
const start = script.indexOf('if [ -z "$(read_env CABINET_CRON_SECRET)" ]', script.indexOf('# Сверка файлов с хранилищем: версии материалов'));
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

const CLEAN = '"leadOrphans":0,"leadKept":0,"expertOrphans":0';

  it('без секрета рассылки — оба звена не включены', () => {
    assert.deepEqual(run({}, null).trim().split('\n'), [
      '[—] файлы работ: сверка с хранилищем не включена (CABINET_CRON_SECRET)',
      '[—] вложения заявок и анкеты: сверка с хранилищем не включена (CABINET_CRON_SECRET)',
    ]);
  });

  it('всё сходится — [ок] обеими строками', () => {
    const out = run(SECRET, `{"ok":true,"missing":0,"size":0,"purgedKept":0,"orphans":0,${CLEAN}}`);
    assert.deepEqual(out.trim().split('\n'), [
      '[ок] файлы работ: версии материалов и хранилище сходятся',
      '[ок] вложения заявок и анкеты: вложения заявок, файлы анкет и хранилище сходятся',
    ]);
  });

  it('расхождения — [!] с числами по видам, без ключей и путей', () => {
    const out = run(SECRET, `{"ok":true,"missing":2,"size":1,"purgedKept":0,"orphans":3,${CLEAN}}`);
    assert.match(out, /^\[!\] файлы работ: версий без файла — 2, размер расходится — 1, изъятых с файлом — 0, файлов без версии — 3/u);
    assert.match(out, /\n\[ок\] вложения заявок и анкеты/u);
    assert.doesNotMatch(out, /projects\/|storage|s{40}/u, 'в отчёт попал путь или секрет');
  });

  it('вложения и анкеты: [!] с числами по трём видам; файлы работ при этом сходятся (Р-1007)', () => {
    const out = run(SECRET, '{"ok":true,"missing":0,"size":0,"purgedKept":0,"orphans":0,"leadOrphans":1,"leadKept":2,"expertOrphans":3}');
    assert.deepEqual(out.trim().split('\n'), [
      '[ок] файлы работ: версии материалов и хранилище сходятся',
      '[!] вложения заявок и анкеты: вложений без записи — 1, изъятых или перенесённых с файлом после срока чистки — 2, файлов анкет без записи — 3 (кабинет → «Сводка» руководителя)',
    ]);
    assert.doesNotMatch(out, /leads\/|experts\/|storage|№|s{40}/u, 'в отчёт попал путь, номер заявки или секрет');
    // Каждое поле читается своим именем: «orphans» не цепляет «leadOrphans».
    const only = run(SECRET, `{"ok":true,"leadOrphans":5,"expertOrphans":6,"leadKept":0,"missing":0,"size":0,"purgedKept":0,"orphans":0}`);
    assert.match(only, /^\[ок\] файлы работ/u);
    assert.match(only, /вложений без записи — 5, изъятых или перенесённых с файлом после срока чистки — 0, файлов анкет без записи — 6/u);
  });

  it('ответ без чисел вложений (прежнее приложение) — вторая строка [!], первая по-прежнему', () => {
    const out = run(SECRET, '{"ok":true,"missing":0,"size":0,"purgedKept":0,"orphans":0}');
    assert.deepEqual(out.trim().split('\n'), [
      '[ок] файлы работ: версии материалов и хранилище сходятся',
      '[!] вложения заявок и анкеты: сверка с хранилищем не выполнена — приложение не ответило (журнал сервера: [storage-check])',
    ]);
  });

  it('сбой сверки и молчание приложения — [!] обеими строками, а не падение отчёта', () => {
    for (const answer of ['{"ok":false}', null, 'Не найдено']) {
      const lines = run(SECRET, answer).trim().split('\n');
      assert.equal(lines.length, 2);
      assert.match(lines[0]!, /^\[!\] файлы работ: сверка с хранилищем не выполнена/u);
      assert.match(lines[1]!, /^\[!\] вложения заявок и анкеты: сверка с хранилищем не выполнена/u);
    }
  });
});
