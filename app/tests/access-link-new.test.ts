/**
 * Ссылка входа после заведения учётной записи — новому человеку (решение
 * Р-727). «Завести» возвращает на «Учётные записи» с заведённой записью
 * в адресе; без почты раздел «Выдать ссылку входа» раскрыт, в нём выбран
 * заведённый человек, сообщение ведёт к разделу якорем. Без явного выбора
 * поле начинается со строки «Выберите человека», а не с первого в списке;
 * выбор держится после выдачи, как прежде (Р-704).
 *
 * Модули с JSX тест не загружает: правила проверяются по тексту исходников.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

describe('ссылка входа — заведённому человеку', () => {
  const actions = read('app', 'cabinet', 'actions.ts');
  const page = read('app', 'cabinet', 'manage', 'users', 'page.tsx');
  const link = read('components', 'cabinet', 'AccessLink.tsx');

  it('«Завести» возвращает с заведённой записью в адресе', () => {
    const start = actions.indexOf('export async function inviteUser(');
    const body = actions.slice(start, actions.indexOf('\nexport ', start + 1));
    assert.match(body, /createdId = \(await createUser\(actor, input\)\)\.id;/u);
    assert.match(body, /\?created=\$\{role === 'EXPERT' \? 'curator' : '1'\}&link=\$\{encodeURIComponent\(createdId\)\}/u);
  });

  it('раздел раскрыт без почты, человек выбран, сообщение ведёт якорем', () => {
    assert.match(
      page,
      /const fresh =\s*flags\.link === undefined \|\| flags\.created === undefined\s*\? undefined\s*: active\.find\(\(user\) => user\.id === flags\.link\);/u,
    );
    assert.match(page, /const linkOpen = fresh !== undefined && !mailReady;/u);
    assert.match(page, /<Disclosure title="Выдать ссылку входа" id="access-link" open=\{linkOpen\}/u);
    assert.match(page, /<a href="#access-link"/u);
    assert.match(page, /placeholder="Выберите человека"\s*initial=\{fresh\?\.id\}/u);
  });

  it('без явного выбора — пустая строка; чужой идентификатор не выбирает; выбор держится (Р-704)', () => {
    assert.match(
      link,
      /initial !== undefined && people\.some\(\(person\) => person\.id === initial\)\s*\? initial\s*: placeholder !== undefined\s*\? ''\s*: \(people\[0\]\?\.id \?\? ''\)/u,
    );
    assert.match(link, /<option value="" disabled>\s*\{placeholder\}/u);
    assert.match(link, /option\.defaultSelected = option\.value === picked/u);
    // Выбор обязателен: пустая строка форму не отправит.
    assert.match(link, /name=\{field\}\s*required\s*value=\{picked\}/u);
  });
});
