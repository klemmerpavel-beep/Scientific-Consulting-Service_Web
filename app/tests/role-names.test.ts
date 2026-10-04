/**
 * Названия ролей в интерфейсе, письмах и сигналах Telegram (требование
 * Э-01, решение В-12).
 *
 * Переименование идёт в два шага, чтобы не смешать значения слова
 * «куратор». Шаг 1: прежнее «куратор» (роль `MANAGER`) стало «менеджером»,
 * и в строках кабинета слова «куратор» не осталось. Проверяются строковые
 * литералы и текст разметки `src`, без комментариев; страницы сайта
 * (`components/pages`) называют куратором учёного со степенью и в проверку
 * не входят.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (full.includes(`${path.sep}components${path.sep}pages`)) continue;
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/u.test(name)) out.push(full);
  }
  return out;
}

/** Строки кода без комментариев: `//`, `/* … *\/` и строки JSDoc. */
function codeLines(text: string): { line: number; code: string }[] {
  const out: { line: number; code: string }[] = [];
  let inBlock = false;
  text.split('\n').forEach((raw, index) => {
    let code = raw;
    if (inBlock) {
      const end = code.indexOf('*/');
      if (end < 0) return;
      code = code.slice(end + 2);
      inBlock = false;
    }
    code = code.replace(/\/\*.*?\*\//gu, '');
    const open = code.indexOf('/*');
    if (open >= 0) {
      inBlock = true;
      code = code.slice(0, open);
    }
    const trimmed = code.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    code = code.replace(/(^|[^:'"`])\/\/.*$/u, '$1');
    out.push({ line: index + 1, code });
  });
  return out;
}

function hits(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    for (const { line, code } of codeLines(readFileSync(file, 'utf8'))) {
      if (pattern.test(code)) found.push(`${path.relative(SRC, file)}:${line}`);
    }
  }
  return found;
}

describe('названия ролей (Э-01, В-12)', () => {
  it('шаг 1: прежнее «куратор» в строках кабинета стало «менеджером»', () => {
    assert.deepEqual(hits(/куратор/iu), [], 'в строках кабинета осталось слово «куратор»');
  });
});
