/**
 * Причина отказа в загрузке книги заказов (решение Р-713).
 *
 * Разборщик ставит код EMPTY любому файлу короче 22 байт и называет
 * причину точно: «Файл пуст или слишком мал для книги Excel». Экран
 * подменял её строкой «Файл пуст.», и непустой файл не в формате Excel
 * отклонялся причиной, которая неверна. Совсем пустой файл до разбора
 * не доходит: его отклоняет действие загрузки кодом `empty`.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана, как в `outbox-failed-note.test.ts`; файл в 13 байт проходит
 * через настоящий разборщик.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { ImportError, unzip } from '../src/lib/cabinet/import/zip.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'import', 'page.tsx'),
  'utf8',
);

function reason(code: string): string {
  const text = page.match(new RegExp(`^\\s*${code}: '([^']+)',$`, 'mu'))?.[1];
  assert.ok(text !== undefined, `у кода ${code} нет причины на экране`);
  return text;
}

describe('причина отказа в загрузке книги заказов', () => {
  it('файл в 13 байт отклоняется кодом EMPTY', () => {
    assert.throws(
      () => unzip(Buffer.from('not an excel!', 'utf8')),
      (error: unknown) => error instanceof ImportError && error.code === 'EMPTY',
    );
  });

  it('экран называет причину EMPTY так же точно, как разборщик', () => {
    const text = reason('EMPTY');
    assert.notEqual(text, 'Файл пуст.');
    assert.match(text, /слишком мал для книги Excel/u);
    assert.match(text, /\.xlsx/u);
  });

  it('пустой или не выбранный файл — прежняя причина', () => {
    assert.equal(reason('empty'), 'Файл не выбран или пуст.');
  });
});
