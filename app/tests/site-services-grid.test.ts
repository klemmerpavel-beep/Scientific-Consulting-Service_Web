/**
 * «Аспирантам», «Сопровождаем диссертацию…»: шесть карточек услуг — одна
 * сетка (Р-941). Пока карточки стояли двумя сетками по три, на 481—768 px
 * (две колонки) каждая сетка ломалась 2 + 1 и оставляла пустую ячейку:
 * ряды шли 2, 1, 2, 1. Одна сетка даёт три ровных ряда.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const MAIN = readFileSync(path.join(ROOT, 'design', 'MainPage.dc.html'), 'utf8');

/** Сетки `.pd-services` раздела услуг: содержимое каждой до закрывающего `</div>` на своей строке. */
export function grids(html: string): string[] {
  const start = html.indexOf('<section id="services"');
  assert.ok(start >= 0, 'раздела #services нет');
  const section = html.slice(start, html.indexOf('</section>', start));
  return section.split('<div class="pd-services"').slice(1);
}

describe('«Аспирантам»: карточки услуг — одна сетка (Р-941)', () => {
  it('списки offerTop и offerMid стоят в одной сетке, ссылки — во второй', () => {
    const list = grids(MAIN);
    assert.equal(list.length, 2, 'сеток в разделе услуг должно быть две: карточки и ссылки');
    assert.match(list[0], /list="\{\{ offerTop \}\}"/u);
    assert.match(list[0], /list="\{\{ offerMid \}\}"/u, 'вторая тройка карточек вынесена в отдельную сетку — на 481—768 px вернутся пустые ячейки');
    assert.match(list[1], /list="\{\{ offerRest \}\}"/u);
  });

  it('карточек в сетке шесть: по три в каждом списке', () => {
    for (const name of ['offerTop', 'offerMid']) {
      const start = MAIN.indexOf(`const ${name} = [`);
      assert.ok(start > 0, `нет данных ${name}`);
      const rows = MAIN.slice(start, MAIN.indexOf('].map', start)).match(/^\s*\[/gmu) ?? [];
      assert.equal(rows.length, 3, `в ${name} не три карточки — пересчитайте ряды сетки`);
    }
  });

  it('проба: две сетки по три карточки не проходят', () => {
    const probe = '<section id="services"><div class="pd-services"><sc-for list="{{ offerTop }}"></sc-for></div>\n<div class="pd-services"><sc-for list="{{ offerMid }}"></sc-for></div>\n<div class="pd-services"><sc-for list="{{ offerRest }}"></sc-for></div></section>';
    assert.equal(grids(probe).length, 3);
    assert.doesNotMatch(grids(probe)[0], /offerMid/u);
  });
});
