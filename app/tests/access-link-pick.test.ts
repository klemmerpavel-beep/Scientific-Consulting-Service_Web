/**
 * Выдача ссылки входа (решение Р-704): после выдачи список «Кому открыть
 * вход» остаётся на выбранном человеке.
 *
 * Форма работает на `useActionState`, и React 19 после действия
 * возвращает неуправляемые поля к начальным значениям. Список вставал на
 * первую строку, а кнопка «Выдать новую ссылку» выдавала вход первому в
 * списке, а не тому, кому выдали только что.
 *
 * Проверка ходит по исходнику, как `cabinet-markup.test.ts`: поведение
 * держится на состоянии в браузере, которого отрисовка на сервере не видит.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'AccessLink.tsx'),
  'utf8',
);

describe('выдача ссылки входа помнит, кому выдали (Р-704)', () => {
  it('список «Кому открыть вход» управляемый', () => {
    const select = source.match(/<select\b[\s\S]*?\n\s*>/u)?.[0] ?? '';
    assert.match(select, /\sid="access-link-user"/u, 'список не найден');
    assert.match(select, /\svalue=\{picked\}/u);
    assert.match(select, /\sonChange=\{\(event\) => setPicked\(event\.target\.value\)\}/u);
  });

  it('выбор начинается с первого человека в списке', () => {
    assert.match(source, /const \[picked, setPicked\] = useState\(people\[0\]\?\.id \?\? ''\);/u);
  });

  // Сброс формы после действия — родной `form.reset()`: он ставит строку
  // «по умолчанию», а управляемого значения не знает. Одного `value` мало:
  // проверка в браузере показала первую строку и с ним.
  it('строка по умолчанию — выбранная: сброс формы после выдачи её не меняет', () => {
    assert.match(source, /ref=\{pickRef\}/u);
    assert.match(
      source,
      /useEffect\(\(\) => \{\s*for \(const option of pickRef\.current\?\.options \?\? \[\]\) option\.defaultSelected = option\.value === picked;\s*\}, \[picked, people\]\);/u,
    );
  });
});
