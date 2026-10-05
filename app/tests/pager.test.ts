/**
 * Постраничность — одна общая часть (улучшение УМ-08, решение Р-390):
 * экраны не набирают её вручную, а шесть перечней берут `Pager`.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const APP = path.join(import.meta.dirname, '..', 'src', 'app');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? pages(full) : name.endsWith('.tsx') ? [full] : [];
  });
}

describe('постраничность — общей частью (УМ-08)', () => {
  const files = pages(APP);
  it('ни один экран не набирает «Предыдущие» и «Следующие» вручную', () => {
    const manual = files.filter((file) => /Предыдущие/u.test(readFileSync(file, 'utf8')));
    assert.deepEqual(manual.map((file) => path.relative(APP, file)), []);
  });
  it('шесть перечней берут общую часть', () => {
    const users = files.filter((file) => /<Pager\b/u.test(readFileSync(file, 'utf8')));
    assert.equal(users.length, 6, users.map((file) => path.relative(APP, file)).join(', '));
  });
});
