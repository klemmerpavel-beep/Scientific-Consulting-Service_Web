/**
 * Поисковые признаки посадочных после SEO-аудита 02.11.2026
 * (`marketing/research/08-seo-аудит-сайта.md`). Проверка по исходникам:
 * макет — источник правды, перенесённый `.meta.ts` — то, что уходит в
 * `<title>` и `<meta name="description">`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** title и description макета, как их читает конвертер. */
function head(page: string): { title: string; description: string } {
  const html = read('design', `${page}.dc.html`);
  const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)">/u.exec(html)?.[1] ?? '';
  return { title, description };
}

describe('«Аспирантам» отвечает запросу «сопровождение диссертации» (Р-773)', () => {
  const { title, description } = head('MainPage');

  it('слово «диссертация» — в title и в description', () => {
    assert.match(title, /сопровождение диссертации/iu);
    assert.match(description, /диссертаци/iu);
  });

  it('title помещается в выдачу: до 60 знаков', () => {
    assert.ok(title.length <= 60, `title ${title.length} знаков: «${title}»`);
  });

  it('перенесённый код совпадает с макетом', () => {
    const meta = read('app', 'src', 'components', 'pages', 'PostgradPage.meta.ts');
    assert.ok(meta.includes(JSON.stringify(title)), 'title в PostgradPage.meta.ts не совпадает с макетом');
    assert.ok(meta.includes(JSON.stringify(description)), 'description в PostgradPage.meta.ts не совпадает с макетом');
  });
});
