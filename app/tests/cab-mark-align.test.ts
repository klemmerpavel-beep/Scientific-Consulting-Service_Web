/**
 * Ссылка с целью в 44 px не сдвигает текст (решение Р-679).
 *
 * `.cab-mark` центрирует строку в коробке 44 px. Соседние ячейки таблиц
 * выровнены по верху, соседние `dd` стоят плашмя, поэтому текст ссылки
 * опускался на 10–12 px и ряд величин шёл ступенькой; в строке текста
 * коробка раздвигала строки. Цель в 44 px остаётся (Р-57, Р-209, Р-567),
 * сдвига текста нет. Проверка ходит по исходникам, как
 * `cabinet-ui-p34.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS } from '../src/components/cabinet/tokens.ts';

const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');

/** Исходник без комментариев: правила касаются кода, а не пояснений к нему. */
function code(...parts: string[]): string {
  return readFileSync(path.join(SCREENS, ...parts), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('cab-mark в ячейке и в dd — текст на линии соседей', () => {
  it('в td, th и dd строка ссылки прижата к верху коробки', () => {
    assert.ok(CABINET_CSS.includes(':is(td,th,dd) .cab-mark{align-items:flex-start}'));
  });

  it('цель нажатия по-прежнему 44 px', () => {
    assert.match(CABINET_CSS, /\.cab-mark\{[^}]*min-height:44px/u);
  });
});

describe('«Сводка» — ближайшие сроки: название не получает пустоты снизу', () => {
  const page = code('manage', 'page.tsx');
  // Строка срока — одна разметка для первых строк и для раскрытия
  // остальных на месте (решение Р-724).
  const start = page.indexOf('const deadlineItem');
  const block = page.slice(start, page.indexOf('</li>', start));

  it('ссылка пункта — блок с отступом, который не трогает раскладку', () => {
    assert.match(
      block,
      /<a\s+href=\{row\.href\}\s+style=\{\{[^}]*display: 'block', padding: '12px 0', margin: '-12px 0'/u,
    );
    assert.doesNotMatch(block, /cab-mark/u);
  });
});

describe('«Работы» — ссылки в строке текста не раздвигают строки', () => {
  const page = code('projects', 'page.tsx');

  it('менеджер и куратор — строчные ссылки с целью, набранной отступом', () => {
    const start = page.indexOf('менеджер —');
    const block = page.slice(start, page.indexOf('</Text>', start));
    const links = [...block.matchAll(/<a\b[^>]*>/gu)].map((match) => match[0]);
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.doesNotMatch(link, /cab-mark/u);
      assert.match(link, /style=\{PERSON_LINK\}/u);
    }
    assert.match(page, /const PERSON_LINK = \{ position: 'relative', zIndex: 1, padding: '14px 0' \} as const;/u);
  });

  it('ссылка на ждущий этап — cab-mark в строке-ряду, хвост срока отдельным куском', () => {
    // Строка дела — одна разметка для всех ждущих этапов работы
    // (решения Р-728, Р-729).
    const start = page.indexOf('const waitingRow');
    const block = page.slice(start, page.indexOf('</Text>', start));
    assert.match(
      block,
      /<Text size=\{13\} style=\{\{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 \}\}>/u,
    );
    assert.match(block, /<a className="cab-mark" href=\{`\/cabinet\/stages\/\$\{waiting\.id\}`\}>/u);
    // Хвост срока — свой кусок ряда, а не текст вслед за коробкой.
    assert.match(block, /<\/a>\s*\{[^}]*\? \(\s*<span>\{`— срок согласования до /u);
    assert.match(block, /: \(\s*<span>\{`— до \$\{formatDate\(waiting\.dueOn\)\}`\}<\/span>/u);
  });
});
