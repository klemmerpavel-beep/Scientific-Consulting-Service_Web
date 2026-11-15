/**
 * Письмо практике о заявке из кабинета — сигнал без имени и темы
 * (решение Р-901; аудит 15.11.2026, находка П-3).
 *
 * Письмо уходит всем действующим менеджерам и руководителям, а не тому,
 * кто поведёт клиента: ФИО клиента и тема в нём расходились по ящикам
 * людей, которые с этим клиентом не работают. Заявку открывает ссылка в
 * кабинете — там действуют права.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const queries = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet', 'queries.ts'),
  'utf8',
);

describe('письмо о заявке из кабинета без персональных данных (Р-901)', () => {
  const start = queries.indexOf("eventKind: 'REQUEST_CREATED'");
  const letter = queries.slice(start, queries.indexOf('});', start));

  it('письмо найдено', () => {
    assert.ok(start > 0);
  });

  it('тело — постоянная строка: ни имени, ни темы, ни текста заявки', () => {
    assert.match(letter, /body: 'Заявка ждёт в очереди модерации\.',/u);
    assert.doesNotMatch(letter, /body:[^\n]*(fullName|draft\.|topic|message)/u);
  });

  it('тема называет заявку номером, а не человеком', () => {
    assert.match(letter, /subject: `Новая заявка \$\{leadNumberLabel\(lead\.number\)\} из кабинета`/u);
    assert.doesNotMatch(letter, /subject:[^\n]*fullName/u);
  });

  it('заявка открывается ссылкой в кабинете', () => {
    assert.match(letter, /path: `\/cabinet\/manage\/leads\/\$\{lead\.id\}`/u);
  });
});
