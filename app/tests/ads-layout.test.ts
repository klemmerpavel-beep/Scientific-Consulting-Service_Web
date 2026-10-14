/**
 * Раздел «Реклама» руководителя: замечания владельца 12.10.2026
 * (решения Р-577…Р-579).
 *
 * Проверка ходит по исходнику экрана, как `cabinet-markup.test.ts`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'ads', 'page.tsx'),
  'utf8',
);

describe('«Реклама»: метки состояния (Р-577)', () => {
  it('метки состояния в таблицах — в одну строку', () => {
    const chips = [...page.matchAll(/<Chip\b[^>]*>/gu)].map((match) => match[0]);
    assert.ok(chips.length >= 3, `меток в экране: ${chips.length}`);
    for (const chip of chips) assert.match(chip, /\bnowrap\b/u, `метка переносится: ${chip}`);
  });
});

describe('«Реклама»: ближайшие шаги (Р-578)', () => {
  it('шаги владельца — отдельно и целиком, у шага — срок, инструкция и состояние', () => {
    assert.match(page, /const OWNER = 'Владелец';/u);
    assert.match(page, /`Ваши шаги · \$\{mine\.length\}`/u);
    assert.match(page, /`Шаги команды · \$\{team\.length\}`/u);
    for (const column of ['Срок', 'Что сделать', 'Инструкция', 'Состояние']) {
      assert.match(page, new RegExp(`>${column}</th>`, 'u'), `нет столбца «${column}»`);
    }
    // Прежняя строка «14.10 · Счётчик… · Владелец» снята.
    assert.doesNotMatch(page, /\$\{work\.title\} · \$\{work\.owner\}/u);
  });
});

describe('«Реклама»: ключевые выводы (Р-579)', () => {
  it('по две плашки в ряд, уверенность — меткой, «Подробнее» у нижнего края', () => {
    const start = page.indexOf('Ключевые выводы');
    const block = page.slice(start, page.indexOf('Ближайшие шаги', start));
    assert.match(block, /minmax\(min\(100%, 440px\), 1fr\)/u);
    assert.match(block, /<Chip nowrap tone=\{row\.confidence === 'sure'/u);
    assert.doesNotMatch(block, /<Mono>/u);
    assert.match(block, /marginTop: 'auto'[\s\S]{0,80}label="Подробнее"/u);
  });
});
