/**
 * Строка книги заказов — частью «О работе» (улучшение УМ-01, решение
 * Р-372): отдельным блоком она давала карточке работы из книги шесть
 * блоков вместо пяти (Р-183).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
  'utf8',
);

describe('строка книги заказов на карточке работы (УМ-01)', () => {
  it('нет отдельного блока «Строка книги заказов»', () => {
    assert.doesNotMatch(page, /<Disclosure title="Строка книги заказов"/u);
  });
  it('строка — внутри «О работе», с датой загрузки книги', () => {
    const about = page.indexOf('<Disclosure title="О работе"');
    const end = page.indexOf('</Disclosure>', about);
    const block = page.slice(about, end);
    assert.match(block, /как в книге на \$\{formatDay\(bookRow\.appliedAt\)\}/u);
    assert.match(block, /bookFacts\.map/u);
  });
});
