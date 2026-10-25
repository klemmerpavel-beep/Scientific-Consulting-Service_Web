/**
 * Цели нажатия после доработки взаимодействия (решение Р-761).
 *
 * Аудит облика снимков (Р-214) нашёл две ссылки меньше 44 px: «в материалах
 * работы» в подсказке поля переписки (Р-722) и «N версий ждут публикации» в
 * строке фактов экрана этапа (Р-723). Подсказка — строка текста, и ссылка в
 * ней строчная (правило Р-57 для ссылок внутри абзаца); ссылка в строке
 * фактов — отдельная цель и получает 44 px классом `cab-mark`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const ui = readFileSync(path.join(SRC, 'components', 'cabinet', 'ui.tsx'), 'utf8');
const stage = readFileSync(path.join(SRC, 'app', 'cabinet', 'stages', '[id]', 'page.tsx'), 'utf8');

describe('цели нажатия после доработки взаимодействия (Р-761)', () => {
  it('подсказка поля — абзацем без полей: ссылка в ней строчная', () => {
    assert.match(ui, /<p id=\{hintId\} style=\{\{ margin: 0, fontFamily: SANS, fontSize: 13, color: 'var\(--pd-ink-muted\)' \}\}>\s*\{hint\}\s*<\/p>/u);
  });

  it('ссылка «N версий ждут публикации» в строке фактов — цель 44 px', () => {
    assert.match(stage, /<a className="cab-mark" href=\{`#version-\$\{pendingVersions\[0\]\.id\}`\} style=\{FACT_LINK\}>/u);
  });
});
