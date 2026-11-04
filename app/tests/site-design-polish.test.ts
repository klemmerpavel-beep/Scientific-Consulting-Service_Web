/**
 * Шлифовка Р-796…Р-803 по проверке арт-директора 04.11.2026: облик, который
 * программные проверки страницы не ловят, а правка макета легко вернёт, —
 * тире в начале строки, разнобой номеров, «серп» кромки на скруглении,
 * таблица без имени, провалы в карточках, шкала, прыгающая под пальцем.
 * Проверка по исходникам: макет — источник правды, перенесённый компонент —
 * то, что уходит в сеть.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const COMPONENT = { MainPage: 'PostgradPage', StudentsPage: 'StudentsPage', BusinessPage: 'BusinessPage' } as const;
type Page = keyof typeof COMPONENT;
const design = (page: Page) => read('design', `${page}.dc.html`);
/** Макет и перенесённый компонент страницы — с подписью для сообщения. */
const both = (page: Page): Array<[string, string]> => [
  [`design/${page}.dc.html`, design(page)],
  [`${COMPONENT[page]}.tsx`, read('app', 'src', 'components', 'pages', `${COMPONENT[page]}.tsx`)],
];
/** Массив данных логики: от его начала до ближайшего «].map». */
const data = (source: string, head: string) => {
  const at = source.indexOf(head);
  assert.ok(at >= 0, `нет данных ${head}`);
  return source.slice(at, source.indexOf('].map', at));
};
const NB = ' ';

describe('Р-796: «Диагностика» на «Аспирантам»', () => {
  it('тире не начинает строку: перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(data(source, 'const stalls = ['), / —/u, `${where}: в перечне перед тире обычный пробел — тире уйдёт в начало строки`);
      for (const phrase of [`а главы${NB}— другую.`, `этапы${NB}— с приёмкой`, `ждут от вас,${NB}— на одной карточке. Рядом${NB}— переписка`]) {
        assert.ok(source.includes(phrase), `${where}: нет неразрывного пробела в «${phrase.replace(/ /gu, '·')}»`);
      }
    }
  });

  it('номер пункта перечня — в исполнении номера фактора сметы (одно исполнение номера, К-9)', () => {
    const html = design('MainPage');
    const stall = html.match(/<span style="([^"]*)">\{\{ p\.num \}\}<\/span>/u)?.[1];
    const factor = html.match(/<span style="([^"]*)">\{\{ c\.num \}\}<\/span>/u)?.[1];
    assert.ok(stall && factor, 'нет номера перечня или фактора');
    assert.equal(stall, factor, 'номера перечня и факторов сметы набраны по-разному');
    const tsx = both('MainPage')[1][1];
    assert.equal(tsx.match(/<span style=\{\{([^}]*)\}\}>\{p\.num\}<\/span>/u)?.[1], tsx.match(/<span style=\{\{([^}]*)\}\}>\{c\.num\}<\/span>/u)?.[1]);
  });

  it('шкала плана на 481—768 px — не шире 360 px: статус рядом с названием этапа', () => {
    for (const [where, source] of both('MainPage')) {
      assert.ok(source.includes('@media (min-width:481px) and (max-width:768px){.pd-plan-steps{max-width:360px}}'), `${where}: нет ограничения ширины шкалы`);
    }
    assert.match(design('MainPage'), /<div role="group" aria-label="Ход работы по этапам" class="pd-plan-steps"/u);
  });
});
