/**
 * Поручение по работе — выбором работы, а не «Кодом работы» (решение
 * Р-731): код на экраны не выводится (Р-189), подпись — название,
 * клиент и менеджер (как в Р-708), совпадающим — срок работы. С работой
 * из адреса («Должники», карточка работы) работа выбрана при любом
 * состоянии, кроме отменённой, «Кому» — её менеджер; отказ называет,
 * кто ведёт работу; с карточки работы руководителю — «Поручить».
 *
 * Экраны с JSX тест не загружает: разметка проверяется по тексту, отказ —
 * вызовом функции.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { assignableWorkLabels, whoLeads } from '../src/lib/cabinet/staff-texts.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

describe('поручение по работе', () => {
  const page = read('app', 'cabinet', 'manage', 'assignments', 'page.tsx');
  const lib = read('lib', 'cabinet', 'assignments.ts');

  it('отказ называет менеджера и куратора работы', () => {
    assert.equal(
      whoLeads('Нечаева Ксения Ильинична', 'Григорьев Антон Эдуардович'),
      'Сотрудник не ведёт эту работу и не увидит её. Работу ведёт менеджер Нечаева Ксения Ильинична, куратор Григорьев Антон Эдуардович',
    );
    assert.match(whoLeads('Нечаева Ксения Ильинична', null), /куратор не назначен$/u);
  });

  it('поле работы — выбор, код только значением; «Кода работы» на экране нет', () => {
    assert.doesNotMatch(page, /Код работы/u);
    assert.match(page, /<Select\s+label="Работа, если поручение по работе"\s+name="project"\s+defaultValue=\{work\?\.code \?\? ''\}/u);
    assert.match(page, /<option key=\{row\.code\} value=\{row\.code\}>\s*\{row\.label\}/u);
    // Подпись работы собирается без кода: код в подпись не передаётся.
    const facts = lib.slice(lib.indexOf('assignableWorkLabels('), lib.indexOf('return rows.map((row, index)'));
    assert.match(facts, /title: row\.title,\s*client: row\.client\.fullName,\s*manager: row\.manager\.fullName,/u);
    assert.doesNotMatch(facts, /code/u);
  });

  it('подпись — название · клиент · менеджер; состояние в конце; совпадающим — срок работы', () => {
    const work = { title: 'Сопровождение диссертационного исследования', client: 'Заказчик Т.2', manager: 'Нечаева Ксения Ильинична' };
    assert.deepEqual(
      assignableWorkLabels([
        { ...work, status: 'ACTIVE', dueOn: null },
        { ...work, title: 'Научные публикации', status: 'PAUSED', dueOn: null },
        { ...work, title: 'Рецензирование', status: 'COMPLETED', dueOn: null },
      ]),
      [
        'Сопровождение диссертационного исследования · Заказчик Т.2 · Нечаева Ксения Ильинична',
        'Научные публикации · Заказчик Т.2 · Нечаева Ксения Ильинична · приостановлена',
        'Рецензирование · Заказчик Т.2 · Нечаева Ксения Ильинична · завершена',
      ],
    );
    // Две работы одного вида у одного клиента и менеджера — различаются сроком.
    assert.deepEqual(
      assignableWorkLabels([
        { ...work, status: 'ACTIVE', dueOn: new Date(Date.UTC(2026, 11, 20)) },
        { ...work, status: 'COMPLETED', dueOn: null },
        { ...work, client: 'Заказчик И.', status: 'ACTIVE', dueOn: new Date(Date.UTC(2026, 11, 20)) },
      ]),
      [
        'Сопровождение диссертационного исследования · Заказчик Т.2 · Нечаева Ксения Ильинична · срок 20 декабря 2026',
        'Сопровождение диссертационного исследования · Заказчик Т.2 · Нечаева Ксения Ильинична · без срока · завершена',
        'Сопровождение диссертационного исследования · Заказчик И. · Нечаева Ксения Ильинична',
      ],
    );
  });

  it('работа из адреса — в выборе при любом состоянии, кроме отменённой: «Должники» показывают и завершённые', () => {
    // Правило «Должников» — одно место, `PAYMENT_CLOSED_STATUSES` (Р-257, Р-447):
    // выбор берёт его же, а не свой перечень.
    assert.match(lib, /export async function assignableWorks\(actor: Actor, picked\?: string \| null\)/u);
    assert.match(lib, /\{ status: \{ in: \['ACTIVE', 'PAUSED'\] \} \},\s*\.\.\.\(code === '' \? \[\] : \[\{ code, status: \{ notIn: \[\.\.\.PAYMENT_CLOSED_STATUSES\] \} \}\]\),/u);
    assert.match(page, /const picked = draft\.project \?\? flags\.project \?\? '';/u);
    assert.match(page, /assignableWorks\(actor, picked\)/u);
  });

  it('работа из адреса выбрана, «Кому» — её менеджер', () => {
    assert.match(page, /const work = works\.find\(\(row\) => row\.code === picked\) \?\? null;/u);
    assert.match(page, /draft\.assigneeId \?\? \(work !== null && people\.some\(\(person\) => person\.id === work\.managerId\) \? work\.managerId : ''\)/u);
    assert.match(page, /<Select label="Кому" name="assigneeId" required defaultValue=\{assignee\}>/u);
    // «Должники» передают работу в адресе, как прежде.
    assert.match(read('app', 'cabinet', 'manage', 'finance', 'debtors', 'page.tsx'), /project: row\.code,/u);
  });

  it('с карточки работы — «Поручить» руководителю одним нажатием', () => {
    const card = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
    assert.match(card, /const mayInstruct = can\(actor, 'ASSIGNMENT_CREATE'\) && !\(PAYMENT_CLOSED_STATUSES as readonly string\[\]\)\.includes\(project\.status\);/u);
    assert.match(card, /href=\{`\/cabinet\/manage\/assignments\?project=\$\{encodeURIComponent\(project\.code\)\}#new`\}>\s*Поручить/u);
  });
});
