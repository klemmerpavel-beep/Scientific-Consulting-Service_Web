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

describe('причина приостановки в шапке карточки (УК-13, Р-379)', async () => {
  const { pauseReasonOf } = await import('../src/lib/cabinet/project-status.ts');
  const events = [
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'ACTIVE', to: 'PAUSED', reason: 'Ждём решения диссовета' } },
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'PAUSED', to: 'ACTIVE' } },
    { kind: 'PROJECT_STATUS_CHANGED', payload: { from: 'ACTIVE', to: 'PAUSED', reason: 'Старая причина' } },
  ];
  it('последняя причина — клиенту и сотрудникам', () => {
    assert.equal(pauseReasonOf('PAUSED', events, false), 'Ждём решения диссовета');
  });
  it('куратору и у не приостановленной работы — ничего', () => {
    assert.equal(pauseReasonOf('PAUSED', events, true), null);
    assert.equal(pauseReasonOf('ACTIVE', events, false), null);
  });
});

describe('«Мои работы» с карточки клиента — на перечень (УК-20, Р-380)', async () => {
  const { soleWorkTarget } = await import('../src/lib/cabinet/nav.ts');
  it('карточка клиента ведёт пункт меню на перечень с отбором «Все»', () => {
    const card = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
      'utf8',
    );
    assert.match(card, /listHref=\{forClient \? '\/cabinet\/projects\?state=all' : undefined\}/u);
  });
  it('с отбором в адресе перечень не уводит на единственную карточку', () => {
    const rows = [{ code: 'PD-1', status: 'ACTIVE' }];
    assert.equal(soleWorkTarget({ role: 'CLIENT', welcomeOpen: false, asked: false, all: 1, rows }), '/cabinet/projects/PD-1');
    assert.equal(soleWorkTarget({ role: 'CLIENT', welcomeOpen: false, asked: true, all: 1, rows }), null);
  });
});
