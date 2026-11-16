/**
 * Посадочная: просветы между разделами (Р-934). Замечание владельца
 * 15.11.2026: «между блоками … увеличить расстояние на 10—15 %, чтобы они не
 * были слипнутые; элементы в самих блоках не менять». Отступы разделов —
 * 70, 80, 80 и 70 px (было 62, 70, 70, 62), блок заявки — 122 px (было 106).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const START = readFileSync(path.join(ROOT, 'design', 'StartPage.dc.html'), 'utf8');

/** Отступы разделов внутри <main>: верхнее поле раздела (margin или padding первого значения). */
export function gaps(html: string): number[] {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return [...main.matchAll(/<section\b[^>]*style="([^"]*)"/gu)].slice(1).map(([, style]) => {
    const margin = /(?:^|;)margin:(\d+)px auto 0/u.exec(style);
    const padding = /(?:^|;)padding:(\d+)px 30px 0/u.exec(style);
    return Number(margin?.[1] ?? padding?.[1] ?? Number.NaN);
  });
}

describe('посадочная: просветы между разделами (Р-934)', () => {
  it('отступы разделов — 70, 80, 80, 70 и 122 px', () => {
    assert.deepEqual(gaps(START), [70, 80, 80, 70, 122]);
  });

  it('проба: прежние отступы не проходят', () => {
    const probe = '<main><section style="padding:56px 30px 0"></section><section style="x:1;margin:62px auto 0;padding:0 30px"></section></main>';
    assert.deepEqual(gaps(probe), [62]);
  });
});
