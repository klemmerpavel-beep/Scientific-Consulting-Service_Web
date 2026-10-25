/**
 * Дела «Сегодня» и «Поручения» называют клиента; поручение ведёт на свою
 * работу (решение Р-721). У менеджера несколько работ с одним
 * названием («Сопровождение диссертационного исследования»), и дела
 * «непрочитанное», «замечание», «версия», «куратор сдал этап», «этап
 * принят», «поручение» не говорили, какая из них. На «Поручениях
 * руководителя» сотрудника работа стояла текстом, без ссылки и клиента.
 * Код работы на экран не выводится (Р-189); работа, которую сотрудник
 * больше не видит, не называется (Р-420).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const page = read('app', 'cabinet', 'manage', 'page.tsx');
const assignmentsPage = read('app', 'cabinet', 'assignments', 'page.tsx');
const assignments = read('lib', 'cabinet', 'assignments.ts');

/**
 * Части «Требует внимания», не связанные с работой: вопрос сотрудника,
 * ответ руководителя (Р-739), заявки, очередь, календарь, договор куратора.
 */
const NOT_WORK = new Set(['staff', 'headReply', 'lateLeads', 'reviewLeads', 'outbox', 'calendar', 'ndaWaiting']);

describe('дела «Требует внимания» называют клиента (Р-721)', () => {
  const blocks = [...page.matchAll(/\.\.\.parts\.(\w+)\.map\(([\s\S]*?)\n    \}\)\)?,/gu)].map((match) => ({
    part: match[1]!,
    body: match[2]!,
  }));

  it('перечень частей разобран', () => {
    assert.ok(blocks.length >= 15, `частей: ${blocks.length}`);
  });

  for (const { part, body } of blocks) {
    if (NOT_WORK.has(part)) continue;
    it(`дело «${part}» — с клиентом в пояснении`, () => {
      const detail = /\n\s+detail:([\s\S]*?)\n\s+todo:/u.exec(body);
      assert.ok(detail !== null, 'нет пояснения');
      assert.match(detail[1]!, /client/u, `пояснение без клиента: ${detail[1]!.trim()}`);
    });
  }

  it('код работы в пояснениях не печатается', () => {
    assert.doesNotMatch(page, /detail:[^\n]*project\.code/u);
    assert.doesNotMatch(page, /`\$\{check\.project\.code\}, /u);
  });
});

describe('«Поручения руководителя» сотрудника — ссылка на работу и клиент (Р-721)', () => {
  it('работа — ссылкой на её экран, рядом клиент', () => {
    assert.match(
      assignmentsPage,
      /<a href=\{`\/cabinet\/projects\/\$\{row\.project\.code\}`\}>работа «\{row\.project\.title\}»<\/a>/u,
    );
    assert.match(assignmentsPage, /\{` · клиент \$\{row\.project\.client\}`\}/u);
  });

  it('без доступа к работе — ни названия, ни кода (Р-420)', () => {
    assert.doesNotMatch(assignmentsPage, /`работа \$\{row\.project\.code\}`/u);
    assert.match(assignmentsPage, /row\.project\.title === null \? \(\s*' · работа вам недоступна'/u);
    assert.match(assignments, /client: visible \? project\.client\.fullName : null,/u);
    assert.match(assignments, /title: visible \? project\.title : null,/u);
  });
});
