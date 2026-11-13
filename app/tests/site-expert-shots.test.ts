/**
 * Снимки кабинета куратора на «Экспертам» (Р-837, Р-589, Р-619): главный
 * снимок первого экрана и пять снимков вкладок лежат в обеих папках ассетов
 * одинаковыми, их размер в точках совпадает с размером в разметке (иначе
 * снимок растягивается или страница прыгает при загрузке), а подпись каждого
 * говорит, что данные вымышленные, у «Вознаграждения» — что суммы размыты
 * (Р-205, Р-03).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const design = readFileSync(path.join(ROOT, 'design', 'ExpertsPage.dc.html'), 'utf8');

/** Размер изображения WebP по заголовку: VP8 (с потерями), VP8L и VP8X. */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${file}: не RIFF`);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${file}: не WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: неизвестный блок ${chunk}`);
}

const HERO = /<img src="\.\/assets\/art\/ex-cabinet\.webp" alt="([^"]+)" width="(\d+)" height="(\d+)"/u;
// Снимки вкладок — стопкой (Р-881): один шаблон img в цикле по tabShots.
const TAB_IMG = /<img src="\{\{ shot\.src \}\}" alt="\{\{ shot\.alt \}\}" aria-hidden="\{\{ shot\.hidden \}\}" width="(\d+)" height="(\d+)"/u;
const TABS = [...design.matchAll(/img: '\.\/assets\/art\/(ex-tab-[a-z]+)\.webp', alt: '([^']+)'/gu)].map((m) => ({ name: m[1]!, alt: m[2]! }));

function bothFolders(name: string): string {
  const files = [
    path.join(ROOT, 'design', 'assets', 'art', `${name}.webp`),
    path.join(ROOT, 'app', 'public', 'assets', 'art', `${name}.webp`),
  ];
  assert.ok(readFileSync(files[0]!).equals(readFileSync(files[1]!)), `${name}.webp в папках ассетов различается`);
  return files[0]!;
}

describe('«Экспертам»: снимки кабинета куратора (Р-837)', () => {
  it('главный снимок: размер файла — как в разметке, подпись о вымышленных данных', () => {
    const hero = design.match(HERO);
    assert.ok(hero, 'нет главного снимка ex-cabinet на первом экране');
    const size = webpSize(bothFolders('ex-cabinet'));
    assert.deepEqual(size, { width: Number(hero[2]), height: Number(hero[3]) }, 'размер ex-cabinet.webp не совпадает с разметкой');
    assert.match(hero[1]!, /Данные вымышленные\.$/u);
  });

  it('пять снимков вкладок: размер — как в разметке, подписи честные', () => {
    const tag = design.match(TAB_IMG);
    assert.ok(tag, 'нет снимка вкладки с размерами в разметке');
    const declared = { width: Number(tag[1]), height: Number(tag[2]) };
    assert.deepEqual(TABS.map((t) => t.name), ['ex-tab-stage', 'ex-tab-materials', 'ex-tab-checklist', 'ex-tab-works', 'ex-tab-payout']);
    for (const t of TABS) {
      assert.deepEqual(webpSize(bothFolders(t.name)), declared, `размер ${t.name}.webp не совпадает с разметкой`);
      const tail = t.name === 'ex-tab-payout' ? /Суммы на снимке размыты\.$/u : /Данные вымышленные\.$/u;
      assert.match(t.alt, tail, `подпись ${t.name}: ${t.alt}`);
    }
  });

  it('снимок этапа показывает сдачу этапа: подпись называет кнопку «Сдать этап менеджеру»', () => {
    const stage = TABS.find((t) => t.name === 'ex-tab-stage');
    assert.ok(stage);
    assert.match(stage.alt, /«Сдать этап менеджеру»/u);
    assert.match(stage.alt, /«Чек-лист сдачи»/u);
  });
});
