/**
 * Картинка превью ссылки (Р-68, Р-632): одна на весь сайт, PNG 1200 × 630,
 * файл лежит в public под тем именем, что объявлено в описателе, и та же
 * картинка указана в разметке организации.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { OG_COVER } from '../src/components/og-cover.ts';

const APP = path.join(import.meta.dirname, '..');

describe('картинка превью ссылки (Р-68, Р-632)', () => {
  it('файл из описателя есть в public и это PNG заявленного размера', () => {
    const file = path.join(APP, 'public', OG_COVER.url);
    assert.ok(existsSync(file), `нет файла ${OG_COVER.url} в app/public`);
    const png = readFileSync(file);
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', 'превью должно быть PNG: WebP часть мессенджеров не разбирает');
    assert.equal(png.readUInt32BE(16), OG_COVER.width);
    assert.equal(png.readUInt32BE(20), OG_COVER.height);
  });

  it('разметка организации берёт картинку из описателя, а не из своего адреса', () => {
    const source = readFileSync(path.join(APP, 'src', 'components', 'OrgSchema.tsx'), 'utf8');
    assert.match(source, /image: `\$\{url\}\$\{OG_COVER\.url\}`/u);
    assert.doesNotMatch(source, /og-cover\.png/u);
  });
});
