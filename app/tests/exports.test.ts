/**
 * Выгрузки кабинета (решение Р-235).
 *
 * Выгрузка заявок держала своё экранирование: без защиты от формул и с
 * запятой вместо точки с запятой, хотя имя и сообщение приходят с открытой
 * формы сайта. Выгрузка журнала просила 5000 строк и молча получала
 * экранные 500. Проверки держат обе выгрузки на общих правилах.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { toCsv } from '../src/lib/cabinet/csv.ts';

const MANAGE = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');
const read = (...parts: string[]) => readFileSync(path.join(MANAGE, ...parts), 'utf8');

describe('выгрузки', () => {
  it('заявки выгружаются общей выгрузкой, без своего экранирования', () => {
    const route = read('leads', 'export', 'route.ts');
    assert.match(route, /toCsv\(/u);
    assert.doesNotMatch(route, /function cell\(/u);
  });

  it('имя-формула из формы сайта не исполняется', () => {
    const csv = toCsv([['Имя'], ['=HYPERLINK("http://x","Открыть")']]);
    assert.match(csv, /"'=HYPERLINK/u);
    // Поля делятся точкой с запятой: русский Excel иначе кладёт строку в
    // одну колонку.
    assert.match(toCsv([['Имя', 'Контакт']]), /"Имя";"Контакт"/u);
  });

  it('выгрузка журнала берёт свою границу и помечает обрезку', () => {
    const route = read('audit', 'export', 'route.ts');
    assert.match(route, /forExport: true/u);
    assert.match(route, /Выгрузка обрезана/u);
    const journals = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'lib', 'cabinet', 'journals.ts'),
      'utf8',
    );
    assert.match(journals, /EXPORT_MAX_ROWS = 20_000/u);
  });
});
