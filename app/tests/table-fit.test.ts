/**
 * Таблицы кабинета в ширину своей области (аудит кабинета руководителя
 * 23.10.2026).
 *
 * Проверка идёт по исходникам, как в `cabinet-ui-p34.test.ts`: обход
 * снимков меряет страницу с сомкнутыми свёртками и таблицу в раскрытой
 * свёртке не видит. Каждое правило запирает одну находку, и в имени
 * проверки она названа.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const SCREENS = path.join(SRC, 'app', 'cabinet');
const COMPONENTS = path.join(SRC, 'components', 'cabinet');

function read(...parts: string[]): string {
  return readFileSync(path.join(...parts), 'utf8');
}

function sources(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => path.join(root, name));
}

/**
 * Исходник без комментариев: правила касаются кода, а не пояснений к нему.
 * Переводы строк остаются — номер строки в отказе совпадает с файлом.
 */
function code(text: string): string {
  const blank = (part: string) => part.replace(/[^\n]/gu, '');
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, blank)
    .replace(/\/\*[\s\S]*?\*\//gu, blank)
    .replace(/^[ \t]*\/\/.*$/gmu, '');
}

/** Тело функции-компонента: от объявления до следующего объявления верхнего уровня. */
function component(text: string, name: string): string {
  const start = text.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `компонент ${name} не найден`);
  const next = text.slice(start + 1).search(/\n(?:export )?(?:async )?function /u);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/**
 * Таблицы, стоящие в свёртке без своей области прокрутки: номер строки
 * каждой. Область — `TableScroll` или `TableCard` внутри той же свёртки.
 */
function bareFoldTables(text: string): number[] {
  const found: number[] = [];
  const folds: number[] = [];
  let scroll = 0;
  for (const match of text.matchAll(/<\/?(?:Disclosure|TableScroll|TableCard)\b|<table\b/gu)) {
    const tag = match[0];
    if (tag === '<Disclosure') folds.push(scroll);
    else if (tag === '</Disclosure') folds.pop();
    else if (tag === '<TableScroll' || tag === '<TableCard') scroll += 1;
    else if (tag === '</TableScroll' || tag === '</TableCard') scroll -= 1;
    else if (folds.length > 0 && scroll <= folds.at(-1)!) {
      found.push(text.slice(0, match.index).split('\n').length);
    }
  }
  return found;
}

describe('Р-688. таблица в свёртке прокручивается в своей области', () => {
  it('«Числа» графика аналитики стоят в TableScroll', () => {
    const card = code(component(read(SCREENS, 'manage', 'analytics', 'shared.tsx'), 'ChartCard'));
    const fold = card.slice(card.indexOf('<Disclosure title="Числа"'));
    assert.match(fold, /<Disclosure title="Числа"[^>]*>\s*<TableScroll\b[^>]*>\s*\{numbers\}\s*<\/TableScroll>/u);
  });

  it('ни одна таблица кабинета не стоит в свёртке голой', () => {
    const bare = [...sources(SCREENS), ...sources(COMPONENTS)].flatMap((file) =>
      bareFoldTables(code(read(file))).map((line) => `${path.relative(SRC, file)}:${line}`),
    );
    assert.deepEqual(bare, []);
  });
});

/** Шапки таблицы, стоящей в `TableCard` с этим именем: разметка `<th>` подряд. */
function tableHeads(text: string, label: string): string[] {
  const start = text.indexOf(`<TableCard label="${label}"`);
  assert.ok(start >= 0, `таблица «${label}» не найдена`);
  const head = text.slice(start, text.indexOf('</thead>', start));
  return [...head.matchAll(/<th\b[^>]*>([^<]*)<\/th>/gu)].map((match) => match[1]!.trim());
}

describe('Р-689. «Виды работ» календаря — в ширину карточки', () => {
  const page = code(read(SCREENS, 'manage', 'recommendations', 'calendar', 'page.tsx'));

  it('«Заказ около» и окно — один столбец, пика в таблице нет', () => {
    const heads = tableHeads(page, 'Виды работ');
    assert.ok(heads.includes('Окно — заказ около'), heads.join(' | '));
    assert.equal(heads.some((head) => /^Заказ около|^Пик заказов/u.test(head)), false, heads.join(' | '));
  });

  it('пик заказов — в «На чём основано»', () => {
    const basis = page.slice(page.indexOf('<Disclosure title="На чём основано"'));
    assert.match(basis, /пик заказов/u);
    assert.match(basis, /row\.peak/u);
  });

  it('многословные шапки переносятся', () => {
    const start = page.indexOf('<TableCard label="Виды работ"');
    const head = page.slice(start, page.indexOf('</thead>', start));
    for (const title of ['Месяц сдачи (сроков / сезонов)', 'Медиана, дней', 'Окно — заказ около']) {
      assert.match(head, new RegExp(`whiteSpace: 'normal' \\}\\} scope="col">${title.replace(/[()]/gu, '\\$&')}<`, 'u'), title);
    }
  });

  it('кнопки отметки стоят в строку с переносом', () => {
    const marks = code(read(COMPONENTS, 'RecommendationMarks.tsx'));
    assert.match(marks, /const ROW: CSSProperties = \{[^}]*display: 'flex'[^}]*flexWrap: 'wrap'/u);
  });
});
