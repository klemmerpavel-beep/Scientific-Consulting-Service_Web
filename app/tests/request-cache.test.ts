/**
 * Тяжёлые выборки руководителя — один раз на запрос (решение Р-476):
 * строки витрины и рекомендации обёрнуты в `cache`, а число у пункта меню,
 * «Сводка» и раздел «Рекомендации» берут один расчёт.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(import.meta.dirname, '../src');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('выборки руководителя — один раз на запрос', () => {
  it('строки витрины и рекомендации обёрнуты в cache', () => {
    assert.match(read('lib/cabinet/analytics/data.ts'), /export const loadRows = cache\(/u);
    assert.match(read('lib/cabinet/recommendations.ts'), /export const recommendationsNow = cache\(/u);
    assert.match(read('lib/cabinet/recommendations.ts'), /await recommendationsNow\(actor\)\)\.unmarked/u);
  });

  it('экраны берут общий расчёт, а не считают заново', () => {
    for (const file of ['app/cabinet/manage/page.tsx', 'app/cabinet/manage/recommendations/page.tsx']) {
      const source = read(file);
      assert.doesNotMatch(source, /recommendationsFor\(/u, `${file}: свой расчёт рекомендаций`);
      assert.match(source, /recommendationsNow\(actor\)/u);
    }
  });
});
