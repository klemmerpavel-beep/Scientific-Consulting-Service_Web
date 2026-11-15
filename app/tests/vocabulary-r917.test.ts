/**
 * Единый словарь экранов кабинета (решение Р-917).
 *
 * Аудит 15.11.2026, находка В-4: одно понятие называлось на разных экранах
 * по-разному — заявка и обращение, работа и проект, тип сопровождения и
 * вид работ, состояние и статус. Владелец утвердил словарь 15.11.2026.
 * Здесь он закреплён по исходникам экранов: слово вне словаря не проходит.
 *
 * Экраны книги заказов говорят словами книги — «заказчик», «тип работы»,
 * «стоимость», «дедлайн», «статус»: это названия её столбцов, и форма
 * нового заказа повторяет их («Поля — как в книге заказов»).
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');

/** Экраны книги заказов: перенос книги, новый заказ, таблица заказов, строка книги на карточке работы. */
const BOOK = [
  'app/cabinet/manage/import/page.tsx',
  'app/cabinet/manage/import/[batchId]/page.tsx',
  'app/cabinet/manage/orders/new/page.tsx',
  'app/cabinet/manage/orders/page.tsx',
  'app/cabinet/projects/[code]/page.tsx',
];

const screens = ['app/cabinet', 'components/cabinet'].flatMap((dir) =>
  readdirSync(path.join(SRC, dir), { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/u.test(name))
    .map((name) => path.join(dir, name).split(path.sep).join('/')),
);

/** Строки файла без комментариев: словарь — о том, что читает человек. */
function visible(file: string): string[] {
  const lines: string[] = [];
  let inside = false;
  for (const line of readFileSync(path.join(SRC, file), 'utf8').split('\n')) {
    const text = line.trim();
    if (inside) {
      if (text.includes('*/')) inside = false;
      continue;
    }
    if (text.startsWith('/*') || text.startsWith('{/*')) {
      if (!text.includes('*/')) inside = true;
      continue;
    }
    if (text.startsWith('//') || text.startsWith('*')) continue;
    lines.push(line.replace(/\s\/\/.*$/u, ''));
  }
  return lines;
}

/** Где слово встречается: `файл: строка`. */
function found(pattern: RegExp, skip: readonly string[] = []): string[] {
  return screens
    .filter((file) => !skip.includes(file))
    .flatMap((file) => visible(file).filter((line) => pattern.test(line)).map((line) => `${file}: ${line.trim().slice(0, 90)}`));
}

describe('единый словарь экранов (Р-917)', () => {
  it('экраны найдены', () => {
    assert.ok(screens.length > 80, `файлов ${screens.length}`);
    for (const file of BOOK) assert.ok(screens.includes(file), file);
  });

  it('«обращение» — нигде: это заявка', () => {
    assert.deepEqual(found(/[Оо]бращени/u), []);
  });

  it('«проект» — нигде: это работа', () => {
    assert.deepEqual(found(/[Пп]роект(?!н)/u), []);
  });

  it('«вид работ» — нигде: это тип сопровождения', () => {
    assert.deepEqual(found(/[Вв]ид(?:а|у|ом|е|ы|ов)? работ/u), []);
  });

  it('кнопка денег работы называется как её экран — «Оплаты и документы»', () => {
    assert.deepEqual(found(/Деньги по заказу/u), []);
  });

  it('слова книги заказов — только на её экранах', () => {
    assert.deepEqual(found(/[Зз]аказчик|[Сс]тоимост|[Дд]едлайн|[Тт]ип(?:а|у|ом|е|ы|ов)? работ/u, BOOK), []);
  });

  it('«статус» — только о тексте столбца книги; ход работы и транша — «состояние»', () => {
    assert.deepEqual(found(/[Сс]татус/u, [...BOOK, 'app/cabinet/manage/directory/page.tsx']), []);
    const directory = visible('app/cabinet/manage/directory/page.tsx').filter((line) => /[Сс]татус/u.test(line));
    assert.equal(directory.length, 1);
    assert.match(directory[0]!, /текст статуса/u);
  });

  it('файл к работе прикладывают: «Загрузить» — только у шаблонов и книги', () => {
    const upload = found(/>\s*Загрузить[^<]*<|title="Загрузить|`Загрузить/u, ['app/cabinet/manage/checklists/page.tsx']);
    assert.deepEqual(upload, []);
  });

  it('плитка «Управления» названа так же, как её экран', () => {
    const tools = readFileSync(path.join(SRC, 'app/cabinet/manage/tools/page.tsx'), 'utf8');
    const tiles = [...tools.matchAll(/href: '(\/cabinet\/manage\/[^']+)',\s*title: '([^']+)'/gu)];
    assert.ok(tiles.length >= 12, `плиток ${tiles.length}`);
    for (const [, href, title] of tiles) {
      const page = readFileSync(path.join(SRC, 'app', `${href}/page.tsx`), 'utf8');
      const tab = /metadata: Metadata = \{ title: '([^']+)'/u.exec(page)?.[1];
      assert.equal(tab, title, href);
    }
  });

  it('отзыв о кабинете не путается с замечанием к материалу', () => {
    const feedback = readFileSync(path.join(SRC, 'app/cabinet/manage/feedback/page.tsx'), 'utf8');
    assert.match(feedback, /title="Отзывы о кабинете"/u);
  });
});
