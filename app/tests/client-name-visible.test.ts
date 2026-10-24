/**
 * Карточка работы называет клиента в видимой части, а не только в
 * свёрнутом «Управлении работой» (решение Р-748; Р-298, Р-189, Р-721).
 *
 * Прежде ФИО клиента стояло на карточке только в нижней свёртке и у его
 * сообщений, а в «Моих работах» — в конце строки фактов после «чек-лист 0
 * из 11»: открыв одну из одноимённых работ, менеджер не видел, чья она.
 *
 * Запуск: node --test tests/client-name-visible.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { staffClientLine, staffExpertLine } from '../src/lib/cabinet/access.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

describe('клиент под шкалой — тем же приёмом, что куратор (Р-748)', () => {
  it('подпись', () => {
    assert.equal(staffClientLine('Иванова Мария Петровна'), 'клиент — Иванова Мария Петровна');
    assert.equal(staffExpertLine(null, null), 'куратор не назначен');
  });

  it('панель выводит клиента перед куратором', () => {
    const ui = source('src/components/cabinet/ui.tsx');
    const start = ui.indexOf('export function ProgressPanel(');
    const body = ui.slice(start, ui.indexOf('\nexport function Disclosure', start));
    assert.match(body, /\{client == null \? null : <span>\{client\}<\/span>\}\s*\{executor == null \? null : <span>\{executor\}<\/span>\}/u);
  });

  it('карточка передаёт клиента только практике; «О работе» — строка «Клиент» практике', () => {
    const page = source('src/app/cabinet/projects/[code]/page.tsx');
    assert.match(page, /client=\{practice \? staffClientLine\(project\.client\.fullName\) : null\}/u);
    assert.match(page, /practice \? \{ term: 'Клиент', value: project\.client\.fullName \} : null,/u);
    assert.match(page, /const practice = actor\.role === 'MANAGER' \|\| actor\.role === 'HEAD';/u);
  });
});

describe('«Мои работы»: ФИО клиента — первым в строке фактов (Р-748)', () => {
  it('первый элемент строки фактов — клиент; клиенту — не выводится', () => {
    const list = source('src/app/cabinet/projects/page.tsx');
    const start = list.indexOf('const facts = [');
    const facts = list.slice(start, list.indexOf('].filter((fact) => fact !== null);', start));
    const first = facts.replace(/\/\/[^\n]*\n/gu, '').match(/const facts = \[\s*([^\n]+)/u)?.[1];
    assert.equal(first, 'forClient ? null : project.client.fullName,');
    assert.equal((facts.match(/project\.client\.fullName/gu) ?? []).length, 1, 'ФИО в строке один раз');
  });
});
