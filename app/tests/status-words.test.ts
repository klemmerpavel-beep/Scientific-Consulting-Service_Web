/**
 * Одно слово для отменённой работы (улучшение УК-10, решение Р-366):
 * строка перечня работ, метка состояния и история называют её
 * «отменена», а не «остановлена».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PROJECT_STATUS_LABEL } from '../src/lib/cabinet/project-status.ts';

const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');

describe('отменённая работа — одним словом (УК-10)', () => {
  it('метка состояния — «Отменена»', () => {
    assert.equal(PROJECT_STATUS_LABEL.CANCELLED, 'Отменена');
  });
  it('строка перечня работ — «Работа отменена», без «остановлена»', () => {
    assert.ok(page.includes("'Работа отменена.'"));
    assert.ok(!page.includes('Работа остановлена'));
  });
});
