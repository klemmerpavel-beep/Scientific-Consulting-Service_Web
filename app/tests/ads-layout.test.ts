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
