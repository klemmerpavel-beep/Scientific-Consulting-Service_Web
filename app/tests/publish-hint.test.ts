/**
 * Подсказка о комментариях практики к неопубликованной версии куратора
 * (решение владельца, Р-546): комментарий менеджера к такой версии клиент
 * увидит вместе с ней. Подсказка стоит у поля комментария и у кнопки
 * «Опубликовать клиенту» на экране этапа и на «Материалах работы».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');
const stage = readFileSync(path.join(SCREENS, 'stages', '[id]', 'page.tsx'), 'utf8');
const materials = readFileSync(path.join(SCREENS, 'projects', '[code]', 'materials', 'page.tsx'), 'utf8');

describe('подсказка о публикации комментариев менеджера (Р-546)', () => {
  it('у поля комментария практики к неопубликованной версии', () => {
    assert.match(stage, /version\.moderation\?\.status === 'PENDING'\s*\?[^']*'Версия куратора ещё не опубликована\. Когда её опубликуют, клиент увидит и этот комментарий/u);
    assert.match(stage, /Замечание только для куратора напишите в причине «Не публиковать»\./u);
  });

  it('у кнопки «Опубликовать клиенту» — на экране этапа и на «Материалах работы»', () => {
    for (const [name, code] of [['этап', stage], ['материалы', materials]] as const) {
      const at = code.indexOf('Вместе с версией клиент увидит комментарии менеджера к ней');
      const button = code.indexOf('Опубликовать клиенту</Button>', at);
      assert.ok(at > 0 && button > at, `${name}: подсказка не стоит перед кнопкой`);
    }
  });

  it('куратору подсказка прежняя', () => {
    assert.match(stage, /curatorView\s*\?\s*'Клиент увидит замечание после проверки менеджером\.'/u);
  });
});
