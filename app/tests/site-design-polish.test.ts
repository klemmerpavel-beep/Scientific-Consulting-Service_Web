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

describe('Р-797: «Статьи и гранты» на «Аспирантам»', () => {
  it('кромка — псевдоэлементом ровной толщины, без border-top 2 px на скруглённой карточке', () => {
    for (const page of Object.keys(COMPONENT) as Page[]) {
      for (const tag of design(page).match(/<[a-z][^>]*\bstyle="[^"]*"[^>]*>/gu) ?? []) {
        const style = tag.match(/\bstyle="([^"]*)"/u)![1];
        assert.ok(!(/border-top:2px solid/u.test(style) && /border-radius/u.test(style)), `${page}: border-top 2 px у скруглённого блока даёт «серп»: ${tag.slice(0, 140)}`);
      }
    }
    for (const [where, source] of both('MainPage')) {
      assert.ok(source.includes('.pd-edge::before{content:"";position:absolute;top:-1px;left:-1px;right:-1px;height:15px;box-sizing:border-box;border:2px solid var(--pd-accent);border-bottom:0;border-radius:14px 14px 0 0;pointer-events:none}'), `${where}: нет правила кромки`);
    }
    assert.equal((design('MainPage').match(/<article class="pd-lift pd-edge"/gu) ?? []).length, 1, 'у карточки «Статьи и гранты» нет кромки pd-edge');
  });

  it('«Патент на изобретение и программа для ЭВМ.» — заголовок h3, как у карточек', () => {
    const html = design('MainPage');
    const section = html.slice(html.indexOf('<section id="articles"'), html.indexOf('</section>', html.indexOf('<section id="articles"')));
    const card = section.match(/<h3 style="margin:0;([^"]*)">\{\{ a\.title \}\}<\/h3>/u)?.[1];
    const patent = section.match(/<h3 style="margin:0 0 4px;([^"]*)">Патент на изобретение и программа для ЭВМ\.<\/h3>/u)?.[1];
    assert.ok(card && patent, 'название «Патент…» не заголовок h3');
    assert.equal(patent, card, 'заголовок «Патент…» набран иначе, чем заголовки карточек');
    assert.match(both('MainPage')[1][1], /<h3 style=\{\{[^}]*\}\}>Патент на изобретение и программа для ЭВМ\.<\/h3>/u);
  });
});

describe('Р-798: «Стоимость» на «Аспирантам»', () => {
  it('тире не начинает строку: в факторах сметы перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('MainPage')) {
      assert.doesNotMatch(data(source, 'const costFactors = ['), / —/u, `${where}: в факторах сметы перед тире обычный пробел`);
      assert.ok(source.includes(`докторская${NB}— разная сложность`), `${where}: нет неразрывного пробела в «докторская — разная сложность»`);
    }
  });

  it('у таблицы сроков доступное имя — заголовок раздела', () => {
    for (const [where, source] of both('MainPage')) {
      assert.match(source, /role="table" aria-labelledby="mp-cost-title"/u, `${where}: у role=table нет имени`);
      assert.match(source, /<h2 id="mp-cost-title"/u, `${where}: нет заголовка с id mp-cost-title`);
    }
  });

  it('пустых правил и правила .pd-cost в таблице стилей нет', () => {
    const css = [...design('MainPage').matchAll(/<style>([\s\S]*?)<\/style>/gu)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//gu, '');
    assert.doesNotMatch(css, /\.pd-cost[,{]/u, 'осталось правило .pd-cost');
    assert.doesNotMatch(css, /,\s*\}/u, 'правило со списком селекторов без объявлений');
    assert.ok(!both('MainPage')[1][1].includes('.pd-cost,'));
  });

  it('до 480 px срок стоит под направлением одной колонкой', () => {
    for (const [where, source] of both('MainPage')) {
      assert.ok(source.includes('@media (max-width:480px){.pd-termrow{grid-template-columns:minmax(0,1fr);row-gap:2px!important}'), `${where}: таблица до 480 px — в две колонки`);
    }
  });
});

describe('Р-799: «Смета на диплом» на «Студентам»', () => {
  it('тире не начинает строку: перед тире — неразрывный пробел', () => {
    for (const [where, source] of both('StudentsPage')) {
      for (const phrase of [`черновик готов${NB}— разный объём разбора.`, `ждут от вас,${NB}— на одной карточке. Рядом${NB}— переписка`]) {
        assert.ok(source.includes(phrase), `${where}: нет неразрывного пробела в «${phrase.replace(/ /gu, '·')}»`);
      }
    }
  });
});

describe('Р-800: «Что будет после отправки» на «Студентам»', () => {
  it('«Срок ответа — рабочий день» — тем же компонентом «Метка-факт», что срок на «Аспирантам»', () => {
    const fact = design('MainPage').match(/<span style="([^"]*)">\s*<span aria-hidden="true" style="([^"]*)"><\/span>\s*<span style="([^"]*)">\{\{ a\.term \}\}<\/span>/u);
    const label = design('StudentsPage').match(/<span style="([^"]*)"><span aria-hidden="true" style="([^"]*)"><\/span><span style="([^"]*)">Срок ответа — рабочий день<\/span><\/span>/u);
    assert.ok(fact, 'нет метки-факта срока на «Аспирантам»');
    assert.ok(label, 'подпись «Срок ответа — рабочий день» не метка-факт');
    assert.equal(label[1], fact[1], 'подложка метки другая');
    assert.equal(label[3], fact[3], 'текст метки набран иначе');
    assert.doesNotMatch(label[0], /text-transform:uppercase/u);
  });

  it('на ≥1200 px заголовок шага 14 px, колонки под длину заголовков', () => {
    for (const [where, source] of both('StudentsPage')) {
      assert.ok(source.includes('@media (min-width:1200px){.sp-afterbox{padding:24px!important}.sp-steps{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.06fr) minmax(0,1.06fr) minmax(0,.88fr);column-gap:20px}.sp-steps>li::after{right:-20px}.sp-steps .pd-track-title{font-size:14px!important}}'), `${where}: нет правила шкалы на ≥1200 px`);
    }
    assert.match(design('StudentsPage'), /<span class="pd-track-title" style="[^"]*">\{\{ s\.title \}\}<\/span>/u);
  });
});

describe('Р-801: «Уровень готовности технологии» на «Компаниям»', () => {
  it('шкала встаёт по центру только при смене ширины окна, не высоты', () => {
    for (const [where, source] of both('BusinessPage')) {
      const at = source.indexOf('this.onResize = () => {');
      assert.ok(at > 0, `${where}: нет обработчика смены размера окна`);
      const body = source.slice(at, source.indexOf("window.addEventListener('resize', this.onResize)", at));
      assert.equal((body.match(/this\.centerTrl\(\)/gu) ?? []).length, 1, `${where}: центрирование шкалы — не одним вызовом`);
      assert.match(body, /if \(window\.innerWidth !== this\.trlWidth\) \{ this\.trlWidth = window\.innerWidth; this\.centerTrl\(\); \}/u,
        `${where}: шкала центрируется при любой смене размера — на телефоне строка адреса двигает её под пальцем`);
      assert.match(source, /this\.trlWidth = window\.innerWidth;\s*this\.onResize = /u, `${where}: исходная ширина не запомнена`);
    }
  });

  it('шапки колонок карточки уровня — в одной строке подсетки, прижаты к её низу', () => {
    for (const [where, source] of both('BusinessPage')) {
      assert.ok(source.includes('.bp-trlcol{display:grid;grid-row:span 2;grid-template-rows:subgrid;row-gap:12px;align-content:start;min-width:0}'), `${where}: колонка не подсетка`);
      assert.ok(source.includes('.bp-trlcolhead{align-self:end}'), `${where}: шапка не прижата к низу строки`);
    }
  });
});
