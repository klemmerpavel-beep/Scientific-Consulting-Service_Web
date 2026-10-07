/**
 * Прогон рассылки отпускает остаток порции до конца аренды (решение Р-439).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { leaseRunningOut } from '../src/lib/cabinet/outbox-lease.ts';

describe('аренда порции рассылки (Р-439)', () => {
  it('до пяти минут прогон работает, после — отпускает остаток', () => {
    const start = Date.UTC(2026, 9, 7, 12, 0, 0);
    assert.equal(leaseRunningOut(start, start + 4 * 60_000), false);
    assert.equal(leaseRunningOut(start, start + 5 * 60_000 + 1), true);
  });

  it('цикл отправки проверяет аренду до каждой строки и возвращает остаток в очередь', () => {
    const source = readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet', 'outbox.ts'), 'utf8');
    const loop = source.slice(source.indexOf('for (const [index, item] of pending.entries())'));
    assert.ok(loop.length > 0, 'цикл отправки не найден');
    const head = loop.slice(0, loop.indexOf('isExpired('));
    assert.match(head, /leaseRunningOut\(now\.getTime\(\), Date\.now\(\)\)/u);
    assert.match(head, /scheduledAt: leaseUntil/u);
    assert.match(head, /break;/u);
  });
});
