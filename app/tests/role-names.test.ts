/**
 * Названия ролей в интерфейсе, письмах и сигналах Telegram (требование
 * Э-01, решение В-12): «менеджер» — роль `MANAGER`, «куратор» — роль
 * `EXPERT`.
 *
 * Переименование шло в два шага, чтобы не смешать значения слова
 * «куратор» (решения Р-321, Р-322). После шага 1 в строках кабинета слова
 * «куратор» не было вовсе; шаг 2 вернул его только вместо названий роли
 * `EXPERT` — «эксперт», «исполнитель», «Специалист практики». Проверяются
 * строковые литералы и текст разметки `src`, без комментариев; страницы
 * сайта (`components/pages`) в проверку не входят — их тексты сверены
 * отдельно, и «экспертиза» там — не название роли.
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
  it('нет «эксперта» как названия роли', () => {
    // «Экспертиза» и «экспертный» — не роль.
    const role = /(?<!\p{L})эксперт(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?!\p{L})/iu;
    assert.deepEqual(hits(role), [], 'в строках кабинета осталось «эксперт» как название роли');
  });

  it('нет «исполнителя» и «Специалиста практики»', () => {
    assert.deepEqual(hits(/исполнител/iu), [], 'в строках кабинета осталось «исполнитель»');
    assert.deepEqual(hits(/специалист\p{L}*\s+практики/iu), [], 'в строках кабинета остался «Специалист практики»');
  });

  it('роль `EXPERT` подписана «куратор», `MANAGER` — «менеджер»', () => {
    const ui = readFileSync(path.join(SRC, 'components', 'cabinet', 'ui.tsx'), 'utf8');
    assert.match(ui, /EXPERT: 'куратор',/u);
    assert.match(ui, /MANAGER: 'менеджер',/u);
    const shell = readFileSync(path.join(SRC, 'components', 'cabinet', 'Shell.tsx'), 'utf8');
    assert.match(shell, /EXPERT: 'Куратор',/u);
  });
});
