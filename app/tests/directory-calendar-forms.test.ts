/**
 * Формы «Срок реакции» и «Дата начала учёта / Пороги уверенности» на
 * вкладке «Производственный календарь» справочников (решение Р-715).
 *
 * Обе формы стояли рядом `inline`: ряд выравнивается по низу, и кнопка
 * «Сохранить» вставала напротив подсказки, на 27 px ниже середины поля.
 * Во второй форме два поля уходили одно под другое, а кнопка — только
 * рядом со вторым, хотя сохраняет оба. Кнопка стоит отдельной строкой
 * под полями, как в остальных формах «Справочников».
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `outbox-failed-note.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'directory', 'page.tsx'),
  'utf8',
);

function form(action: string): string {
  const start = page.indexOf(`<Form action={${action}}`);
  assert.ok(start >= 0, `формы ${action} нет`);
  return page.slice(start, page.indexOf('</Form>', start));
}

describe('формы вкладки «Производственный календарь»', () => {
  for (const action of ['saveReaction', 'saveAnalyticsSettings']) {
    it(`${action}: кнопка отдельной строкой под полями`, () => {
      const code = form(action);
      assert.doesNotMatch(code.slice(0, code.indexOf('>')), /\binline\b/u);
      assert.match(code, /<FormActions>\s*<Button tone="quiet">Сохранить<\/Button>\s*<\/FormActions>\s*$/u);
      // Кнопка — после последнего поля, а не между ними.
      assert.ok(code.lastIndexOf('<Field') < code.indexOf('<FormActions>'));
    });
  }
});
