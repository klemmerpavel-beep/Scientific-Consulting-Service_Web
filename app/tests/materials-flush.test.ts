/**
 * Перечень материалов в свёрнутом блоке — без линии сразу под шапкой
 * (решение Р-683).
 *
 * `MaterialRows` проводит линию над каждой строкой. В отдельной карточке
 * `MaterialsList` линия над первой строкой отделяет пояснение от перечня;
 * в свёртке «Чек-листы и материалы» на «Управлении» она удваивала кромку
 * раскрытой шапки — у соседних групп разделителя под шапкой нет.
 * Проверка — по исходникам, как `checklists.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const list = readFileSync(path.join(SRC, 'components', 'cabinet', 'MaterialsList.tsx'), 'utf8');
const tools = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'tools', 'page.tsx'), 'utf8');

describe('MaterialRows: первая строка без линии по выбору', () => {
  it('необязательный признак flushTop', () => {
    assert.match(list, /export function MaterialRows\(\{\s*rows,\s*flushTop = false,?\s*\}: \{[^}]*flushTop\?: boolean;/u);
  });

  it('у первой строки при flushTop нет ни линии, ни отступа над ней', () => {
    const start = list.indexOf('export function MaterialRows(');
    const body = list.slice(start);
    assert.match(body, /rows\.map\(\(row, index\) =>/u);
    assert.match(body, /\.\.\.\(flushTop && index === 0 \? \{\} : \{ paddingTop: 12, borderTop: '1px solid var\(--pd-divider\)' \}\)/u);
  });

  it('отдельная карточка перечня оставляет линию над первой строкой', () => {
    const start = list.indexOf('export default function MaterialsList(');
    const body = list.slice(start, list.indexOf('\nexport function ', start));
    assert.match(body, /<MaterialRows rows=\{rows\} \/>/u);
  });

  it('свёртка «Чек-листы и материалы» на «Управлении» — без линии под шапкой', () => {
    assert.match(tools, /<FoldCard\s+id="materials"[\s\S]*?<MaterialRows rows=\{materials\} flushTop \/>/u);
  });
});
