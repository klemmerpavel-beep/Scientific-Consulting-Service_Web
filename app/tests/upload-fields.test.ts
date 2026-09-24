/**
 * Поле файла называется так, как его читает обработчик (решение Р-219).
 *
 * Приведение форм к одному строю переименовало поле версии на экране
 * материалов в `file-<id>`, чтобы развести подписи полей на странице, а
 * обработчик читал `file`: загрузка следующей версии со списка материалов
 * всегда кончалась ошибкой «Файл не выбран». Подписи разводит `scope`, а
 * имя поля — то, что читает сервер.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const APP = path.join(import.meta.dirname, '..');
const SCREENS = path.join(APP, 'src', 'app', 'cabinet');
const ACTIONS = readFileSync(path.join(SCREENS, 'actions.ts'), 'utf8');

const pages = readdirSync(SCREENS, { recursive: true })
  .map(String)
  .filter((name) => name.endsWith('.tsx'));

describe('поля файлов читаются обработчиками', () => {
  for (const page of pages) {
    const source = readFileSync(path.join(SCREENS, page), 'utf8');
    const fields = [...source.matchAll(/<FileField\b[\s\S]*?\/>/gu)].map((m) => m[0]);
    if (fields.length === 0) continue;
    it(page, () => {
      for (const field of fields) {
        const name = /\bname=(?:"([^"]+)"|\{([^}]+)\})/u.exec(field);
        assert.ok(name !== null, `поле без имени: ${field}`);
        assert.ok(name[1] !== undefined, `имя поля собирается выражением ${name[2]}: сервер его не прочтёт`);
        const read = new RegExp(`form\\s*\\.\\s*(get|getAll)\\('${name[1]}'\\)`, 'u');
        assert.match(ACTIONS, read, `поле «${name[1]}» не читает ни один обработчик`);
      }
    });
  }
});
