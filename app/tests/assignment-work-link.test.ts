/**
 * «Управление → Поручения» (решение Р-708): работа в строке поручения —
 * ссылкой на её экран и с именем клиента. Код работы на экран не выводится
 * (Р-189): он остаётся в адресе ссылки.
 *
 * Перенос книги называет работу по виду, и у разных работ одно название:
 * «работа «Сопровождение диссертационного исследования»» не говорила, о
 * какой из них поручение, и перейти к ней было нельзя. Экран сотрудника
 * «Поручения» не меняется: там название видно, только пока он ведёт работу (Р-420).
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`: экран
 * собирается на сервере из выборки базы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const head = readFileSync(path.join(root, 'manage', 'assignments', 'page.tsx'), 'utf8');

describe('поручение называет работу ссылкой и именем клиента (Р-708)', () => {
  it('у строки с работой — ссылка на экран работы', () => {
    assert.match(head, /<a href=\{`\/cabinet\/projects\/\$\{row\.project\.code\}`\}>работа «\{row\.project\.title\}»<\/a>/u);
  });

  it('рядом с названием — имя клиента, а не код работы', () => {
    assert.match(head, /\{` · клиент \$\{row\.project\.client\.fullName\} · `\}/u);
    assert.doesNotMatch(head, /\{` · \$\{row\.project\.code\} · `\}/u);
  });

  it('название работы не уходит в строку без ссылки', () => {
    assert.doesNotMatch(head, /`работа «\$\{row\.project\.title\}»`/u);
  });
});
