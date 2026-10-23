/**
 * Подпись последнего прогона моста «Диск → база» на экране «Зеркало на
 * облачном диске» (решение Р-662).
 *
 * Мост передаёт удержанные на разбор строки в исключённые, а фиксация
 * считает исключённые в пропущенных. Подпись выводила «уже было» по всем
 * пропущенным и отдельно «требуют разбора»: каждая удержанная строка
 * считалась дважды. Отклонённые фиксацией строки мост пишет в журнал, но
 * подпись о них молчала.
 *
 * Модуль экрана с JSX тестом не загружается, поэтому проверка — по тексту
 * экрана: выражения подписи вычисляются на прогоне из сценария находки.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'disk', 'page.tsx'),
  'utf8',
);
const start = page.indexOf('Последний прогон');
const caption = page.slice(start, page.indexOf('</Text>', start));

/** Книга из 56 строк: одна удержана на разбор, одна отклонена фиксацией. */
const pull = { rows: 56, created: 0, updated: 0, skipped: 55, held: 1, rejected: 1 };

function valueAfter(label: string): unknown {
  const expression = caption.match(new RegExp(`${label} \\{([^}]+)\\}`, 'u'))?.[1];
  assert.ok(expression !== undefined, `в подписи нет «${label}»`);
  return new Function('pull', `return ${expression};`)(pull);
}

describe('подпись прогона моста «Диск → база»', () => {
  it('удержанная на разбор строка не считается ещё и в «уже было»', () => {
    assert.ok(start >= 0, 'подпись прогона не найдена');
    assert.equal(valueAfter('уже было'), 54);
  });

  it('отклонённые строки названы со ссылкой на отчёт переноса', () => {
    assert.equal(valueAfter('отклонено'), 1);
    assert.match(caption, /pull\.rejected === 0/u);
    const tail = caption.slice(caption.indexOf('отклонено'));
    assert.match(tail, /причины в\{' '\}\s*<a href="\/cabinet\/manage\/import">отчёте переноса<\/a>/u);
  });
});
