/**
 * «Аспирантам», «Кто сопровождает проект»: карточки ролей стоят парами на
 * одной высоте, как на «Студентам» (Р-856) — решение Р-963, ответ владельца
 * 20.11.2026. Верх 01 («Менеджер») и 02 («Методолог») — на одной высоте,
 * 03 («Научный редактор») и 04 («Куратор по специальности») — на одной;
 * фигуры — над своими карточками. Тексты, номера в углу (Р-954), орбита,
 * точки и движение — прежние. На 1025—1099 px описание методолога в четыре
 * строки, и верхние карточки закрывали макушки фигур нижней пары — там фигуры
 * 03 и 04 стоят на 24 px ниже (уточнение, переданное 21.11.2026). Проверка —
 * по макету и компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

type Crew = { num: string; left: number; top: number; fig: boolean; low: boolean };

/** Карточки ролей орбиты: положение в процентах, номер в углу и фигура первым потомком. */
export function crews(source: string): Crew[] {
  const at = source.search(/class(?:Name)?="pd-orbit"/u);
  assert.ok(at > 0, 'нет орбиты ролей');
  const orbit = source.slice(at, source.indexOf('</section>', at));
  const re = /<div class(?:Name)?="pd-crew"( data-row="low")? style=(?:"position:absolute;left:([\d.]+)%;top:([\d.]+)%;|\{\{ position: "absolute", left: "([\d.]+)%", top: "([\d.]+)%",)[^>]*>\s*(<img class(?:Name)?="pd-crewfig")?[\s\S]*?<span class(?:Name)?="pd-crewnum"[^>]*>(0[1-4])<\/span>/gu;
  return [...orbit.matchAll(re)].map((m) => ({ num: m[7]!, left: Number(m[2] ?? m[4]), top: Number(m[3] ?? m[5]), fig: Boolean(m[6]), low: Boolean(m[1]) }));
}

/** Точки орбиты: left/top в процентах. */
function dots(source: string): string[] {
  return [...source.matchAll(/class(?:Name)?="pd-dot" style=(?:"position:absolute;left:([\d.]+)%;top:([\d.]+)%|\{\{ position: "absolute", left: "([\d.]+)%", top: "([\d.]+)%")/gu)]
    .map((m) => `${m[1] ?? m[3]}/${m[2] ?? m[4]}`);
}

describe('«Аспирантам», «Кто сопровождает проект»: роли парами на одной высоте (Р-963)', () => {
  for (const [where, source] of [
    ['макет', read('design', 'MainPage.dc.html')],
    ['компонент', read('app', 'src', 'components', 'pages', 'PostgradPage.tsx')],
  ] as const) {
    it(`${where}: 01 с 02 и 03 с 04 — на одной высоте, как на «Студентам»; фигуры над своими карточками`, () => {
      const list = crews(source);
      assert.deepEqual(list.map((c) => c.num), ['01', '02', '03', '04']);
      const [c1, c2, c3, c4] = list as [Crew, Crew, Crew, Crew];
      assert.equal(c1.top, c2.top, '01 и 02 на разной высоте');
      assert.equal(c3.top, c4.top, '03 и 04 на разной высоте');
      assert.ok(c1.top < c3.top, 'верхний ряд — 01 и 02');
      assert.ok(c1.left < c2.left && c3.left < c4.left, '01 и 03 — слева');
      assert.ok(list.every((c) => c.fig), 'фигура роли — не первым потомком карточки');
      // Положения — те же, что на «Студентам» после Р-856.
      assert.deepEqual([c1.top, c3.top], [7.077, 63.385]);
    });

    it(`${where}: на 1025—1099 px фигуры нижней пары ниже на 24 px — верхние карточки не закрывают макушки`, () => {
      assert.ok(source.includes('@media (min-width:1025px) and (max-width:1099px){.pd-crew[data-row=low]>.pd-crewfig{top:-142px}}'), 'нет правила сдвига фигур нижней пары');
      assert.ok(source.includes('.pd-crewfig{position:absolute;left:50%;transform:translateX(-50%);top:-166px;height:210px;'), 'основное положение фигур изменилось');
      assert.deepEqual(crews(source).map((c) => c.low), [false, false, true, true], 'метка data-row="low" — не у нижней пары');
    });

    it(`${where}: точки орбиты прежние`, () => {
      assert.deepEqual(dots(source), ['23.307/31.308', '70.887/28.462', '22.536/64.769', '71.581/68.000']);
    });
  }

  it('проба: прежняя раскладка (01 ниже 02, 04 ниже 03) ловится', () => {
    const probe = ['01:4.396:14.154', '02:55.677:7.077', '03:0.617:63.385', '04:55.677:68.923'].map((x) => {
      const [n, l, t] = x.split(':');
      return `<div class="pd-crew" style="position:absolute;left:${l}%;top:${t}%;width:31.26%">\n<img class="pd-crewfig" src="x"><span class="pd-crewnum" style="">${n}</span></div>`;
    }).join('\n');
    const list = crews(`<section><div class="pd-orbit">${probe}</section>`);
    assert.equal(list.length, 4);
    assert.notEqual(list[0]!.top, list[1]!.top);
  });
});
