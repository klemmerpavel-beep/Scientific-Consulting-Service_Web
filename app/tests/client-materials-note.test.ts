/**
 * Подсказка «Материалов» клиента (решение Р-653): заполненный
 * шаблон прикладывается к заявке или в «Материалах работы». Прежде она
 * велела прислать его менеджеру в переписке, а форма переписки файлов не
 * принимает и сама отсылает в материалы работы.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экранов, как в `moscow-day.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const read = (...parts: string[]) =>
  readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', ...parts), 'utf8');

describe('«Материалы» клиента не зовут прикладывать файл в переписке (Р-653)', () => {
  const screen = read('materials', 'page.tsx');

  it('подсказка не велит прислать шаблон в переписке', () => {
    assert.doesNotMatch(screen, /пришлите[^"]*в переписке/u);
  });

  it('подсказка ведёт в «Материалы работы»', () => {
    assert.match(screen, /note="Скачайте, заполните и приложите к заявке или в «Материалах работы» на карточке своей работы\."/u);
  });

  it('переписка по-прежнему отсылает файлы в материалы работы', () => {
    // Ссылка стоит в подсказке под полем, а не в ряду заготовок (Р-722).
    assert.match(
      read('projects', '[code]', 'messages', 'page.tsx'),
      /файлы — `\}\s*<a href=\{`\/cabinet\/projects\/\$\{project\.code\}\/materials`\}[^>]*>\s*в материалах работы/u,
    );
    assert.match(read('projects', '[code]', 'materials', 'page.tsx'), /title="Материалы работы"/u);
  });
});
