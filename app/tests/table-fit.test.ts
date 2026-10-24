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

/** Предел ширины таблицы, стоящей в `TableCard` с этим именем; `null` — предела нет. */
function tableMinWidth(text: string, label: string): number | null {
  const start = text.indexOf(`<TableCard label="${label}"`);
  assert.ok(start >= 0, `таблица «${label}» не найдена`);
  const table = /<table style=\{\{([^}]*)\}\}>/u.exec(text.slice(start))?.[1] ?? '';
  const width = /minWidth: (\d+)/u.exec(table)?.[1];
  return width === undefined ? null : Number(width);
}

describe('Р-690. предел ширины таблицы не шире карточки', () => {
  // Карточка на 1440 px — 1158 px; на телефоне область таблицы — 348 px.
  it('«Пользователи кабинета» помещаются в карточку настольного экрана', () => {
    const width = tableMinWidth(code(read(SCREENS, 'manage', 'users', 'page.tsx')), 'Пользователи кабинета');
    assert.ok(width !== null && width <= 1100, `minWidth ${width}`);
  });

  it('«Вне помесячного ряда» помещается в телефон', () => {
    const width = tableMinWidth(code(read(SCREENS, 'manage', 'finance', 'receipts', 'page.tsx')), 'Вне помесячного ряда');
    assert.ok(width === null || width <= 320, `minWidth ${width}`);
  });
});

describe('Р-691. пояснение таблицы — абзацем над областью прокрутки', () => {
  const report = code(read(SCREENS, 'manage', 'report', 'page.tsx'));
  const imports = code(read(SCREENS, 'manage', 'import', 'page.tsx'));

  it('подписи <caption> нет: она шириной с таблицу и режется краем области', () => {
    assert.doesNotMatch(report, /<caption\b/u);
    assert.doesNotMatch(imports, /<caption\b/u);
  });

  it('таблица отчёта ссылается на свой абзац, абзац стоит до области прокрутки', () => {
    for (const label of ['Договоры и оплаты по месяцу начала работы', 'Что заказывали']) {
      const region = report.indexOf(`<TableScroll label="${label}"`);
      assert.ok(region >= 0, label);
      const id = /<table\s+aria-describedby="([^"]+)"/u.exec(report.slice(region))?.[1];
      assert.ok(id !== undefined, `${label}: у таблицы нет aria-describedby`);
      const note = report.indexOf(`id="${id}"`);
      assert.ok(note >= 0 && note < region, `${label}: абзаца ${id} нет над таблицей`);
    }
  });

  it('пояснение «Загрузок» стоит над LongTable, а не в ней', () => {
    const table = imports.indexOf('<LongTable');
    assert.match(imports.slice(0, table), /История переносов: отчёт каждой загрузки открывается повторно\./u);
    assert.doesNotMatch(imports.slice(table), /caption=/u);
  });
});

describe('Р-692. таблицы «Команды» — в ширину карточки', () => {
  const team = code(read(SCREENS, 'manage', 'team', 'page.tsx'));

  for (const label of ['Менеджеры', 'Кураторы']) {
    it(`многословные шапки «${label}» переносятся`, () => {
      const start = team.indexOf(`<TableCard label="${label}"`);
      assert.ok(start >= 0, label);
      const head = team.slice(start, team.indexOf('</thead>', start));
      const cells = [...head.matchAll(/<th style=\{([^}]*\}?)\}[^>]*>([\s\S]*?)<\/th>/gu)];
      assert.ok(cells.length > 0, label);
      for (const [, style, title] of cells) {
        if (!title!.trim().includes(' ')) continue;
        assert.match(style!, /whiteSpace: 'normal'/u, title!.trim());
      }
    });
  }

  it('пометка роли не отрывается от точки', () => {
    assert.match(team, /<span style=\{\{ whiteSpace: 'nowrap' \}\}>· руководитель<\/span>/u);
    assert.doesNotMatch(team, /' · руководитель'/u);
  });
});

/** Стиль шапки столбца с этим заголовком: всё, что стоит в `style={…}`. */
function headStyle(text: string, title: string): string {
  const match = new RegExp(`<th style=\\{([^>]*)\\} scope="col">\\s*${title}\\s*</th>`, 'u').exec(text);
  assert.ok(match !== null, `шапки «${title}» нет`);
  return match[1]!;
}

describe('Р-693. шапка числового столбца — по правому краю, над числами', () => {
  const cases: [string[], string[]][] = [
    [['manage', 'import', 'page.tsx'], ['Строк']],
    [['manage', 'import', '[batchId]', 'page.tsx'], ['Строк', 'Стоимость', 'Оплачено']],
    [['manage', 'outbox', 'page.tsx'], ['Попыток']],
    [['manage', 'directory', 'page.tsx'], ['Проектов']],
  ];
  for (const [file, titles] of cases) {
    it(file.slice(0, -1).join('/'), () => {
      const text = code(read(SCREENS, ...file));
      for (const title of titles) assert.equal(headStyle(text, title), 'TABLE_NUM_HEAD', title);
    });
  }
});

describe('Р-694. «О работе» на телефоне: подпись встаёт над значением', () => {
  const card = code(read(SCREENS, 'projects', '[code]', 'page.tsx'));

  it('сетки с колонкой подписей в 170 px нет', () => {
    assert.doesNotMatch(card, /minmax\(0,170px\) minmax\(0,1fr\)/u);
  });

  it('строки обоих перечней переносятся, как на карточке заявки', () => {
    const rows = [...card.matchAll(/style=\{\{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2 \}\}/gu)];
    assert.equal(rows.length, 2);
    assert.equal([...card.matchAll(/<dt style=\{\{ margin: 0, flex: '0 0 170px', minWidth: 0 \}\}>/gu)].length, 2);
    assert.equal([...card.matchAll(/<dd style=\{\{ margin: 0, flex: '1 1 220px', minWidth: 0 \}\}>/gu)].length, 2);
  });
});
