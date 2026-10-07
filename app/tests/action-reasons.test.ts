/**
 * Причина отказа действия кабинета (`reasonOf` в `actions.ts`): нарушение
 * уникальности — одновременное действие из второй вкладки — получает
 * понятную причину до общей фразы о системной ошибке (решение Р-469).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(path.join(import.meta.dirname, '../src/app/cabinet/actions.ts'), 'utf8');
const start = source.indexOf('function reasonOf(');
const body = source.slice(start, source.indexOf('\n}\n', start));

describe('причина отказа действия', () => {
  it('нарушение уникальности — «обновите страницу», раньше общей фразы', () => {
    assert.ok(start >= 0, 'reasonOf не найдена');
    const unique = body.indexOf("code === 'P2002'");
    const system = body.indexOf('const system');
    assert.ok(unique >= 0, 'нарушение уникальности не разобрано');
    assert.ok(unique < system, 'проверка уникальности стоит после общей фразы');
    assert.match(body, /обновите страницу/u);
  });
});
