/**
 * Одно слово для отменённой работы (улучшение УК-10, решение Р-366):
 * строка перечня работ, метка состояния и история называют её
 * «отменена», а не «остановлена». Один глагол для Telegram (УК-17, Р-368).
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

describe('один глагол для Telegram (УК-17, Р-368)', () => {
  const read = (...parts: string[]) => readFileSync(path.join(import.meta.dirname, '..', 'src', ...parts), 'utf8');
  it('настройки, первый вход и ответ бота — «Подключить Telegram»', () => {
    for (const text of [read('app', 'cabinet', 'settings', 'page.tsx'), read('app', 'api', 'telegram', 'route.ts'), page]) {
      assert.ok(text.includes('Подключить Telegram'));
      assert.ok(!text.includes('Привязать Telegram'));
    }
  });
});

describe('корректировка суммы — и руководителю (УМ-07, Р-376)', () => {
  it('строка корректировки не скрыта от того, кто ведёт оплаты', () => {
    const payments = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
      'utf8',
    );
    assert.doesNotMatch(payments, /mayEdit \|\| money\.adjustment === 0n/u);
    assert.match(payments, /списано и сторнировано по траншам ниже/u);
  });
});
