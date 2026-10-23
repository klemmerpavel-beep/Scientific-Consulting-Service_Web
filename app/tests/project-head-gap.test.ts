/**
 * Экран работы (решение Р-709): причина отказа и блоки исхода не
 * прилипают к ряду кнопок шапки.
 *
 * Отступ под шапкой давала только свёртка «О работе» своим верхним полем,
 * и отказ «Правки этапа», «Карточка обновлена из документа», «Спасибо за
 * оценку» вставали между ними вплотную: зазор 0 px. Отступ теперь у самой
 * шапки, как у `ScreenHead` на остальных экранах; без отказа вид прежний.
 *
 * Проверка ходит по исходнику, как `book-row-view.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'page.tsx'),
  'utf8',
);

describe('шапка экрана работы отделена от исхода (Р-709)', () => {
  it('у шапки — нижний отступ 12 px', () => {
    const top = page.match(/<ScreenTop style=\{\{([^}]*)\}\}>/u)?.[1] ?? '';
    assert.notEqual(top, '', 'шапка не найдена');
    assert.match(top, /marginBottom: 12/u);
  });

  it('у «О работе» верхнего поля больше нет: отступ не удваивается', () => {
    const about = page.match(/<Disclosure title="О работе"[^>]*>/u)?.[0] ?? '';
    assert.notEqual(about, '', 'свёртка не найдена');
    assert.doesNotMatch(about, /marginTop/u);
  });
});
