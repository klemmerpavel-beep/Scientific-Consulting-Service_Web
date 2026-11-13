/**
 * Сайт (решение Р-769, П-19): молодые учёные — свой вход. На «Аспирантам»
 * h1 и метка первого экрана называют «аспирантов и молодых учёных», после
 * «Услуг» — раздел на якоре `#articles` с кнопкой к прежней форме заявки
 * (новой формы нет, Р-96). С Р-808 (З-3, 05.11.2026) это «Публикации к
 * защите»: число публикаций по п. 13 Положения о присуждении учёных
 * степеней, карточка статьи прежними формулировками и строка о заявке на
 * грант для молодых учёных — она заменила строку гранта таблицы сроков,
 * снятой вместе с разделом «Стоимость» (Р-807). На главной — h1 о научном
 * консалтинге для студентов, аспирантов, молодых учёных и компаний, под
 * формой первого экрана — три ссылки направлений, карточка направления 1 —
 * «Аспирантам и молодым учёным». Группы B Директа (статьи и гранты) и
 * быстрая ссылка «Статьи к защите» ведут на `#articles`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
const design = (page: string) => read(`design/${page}.dc.html`);
/** Видимый текст фрагмента разметки: без тегов, неразрывный пробел — обычный. */
const text = (html: string) => html.replace(/<[^>]+>/gu, '').replace(/ /gu, ' ').replace(/\s+/gu, ' ').trim();
const h1Of = (html: string) => text(html.slice(html.indexOf('<h1'), html.indexOf('</h1>')));
/** Раздел от `<section id="…"` до его `</section>`. */
function section(html: string, id: string): string {
  const start = html.indexOf(`<section id="${id}"`);
  assert.ok(start > 0, `раздела #${id} нет`);
  return html.slice(start, html.indexOf('</section>', start));
}
/** Значение строкового поля объекта `{ title: '…', term: '…' }` в данных макета. */
const terms = (html: string, list: string) => {
  const start = html.indexOf(`const ${list} = [`);
  assert.ok(start > 0, `нет данных ${list}`);
  return html.slice(start, html.indexOf('];', start)).replace(/ /gu, ' ');
};

/** Объект данных макета `const name = { … };` — без неразрывных пробелов. */
const object = (html: string, name: string) => {
  const start = html.indexOf(`const ${name} = {`);
  assert.ok(start > 0, `нет данных ${name}`);
  return html.slice(start, html.indexOf('\n    };', start)).replace(/\u00a0/gu, ' ');
};

const MAIN = design('MainPage');
const START = design('StartPage');

describe('«Аспирантам»: первый экран называет молодых учёных', () => {
  it('h1 — «Научное сопровождение аспирантов и молодых учёных: диссертация, статьи, гранты», бренд не первым словом', () => {
    const h1 = h1Of(MAIN);
    assert.equal(h1, 'Научное сопровождение аспирантов и молодых учёных: диссертация, статьи, гранты');
    assert.doesNotMatch(h1, /^ProDisser/u);
  });

  it('h1 согласован с og:title макета; <title> — поисковый, по Р-773 (seo-meta.test.ts)', () => {
    // С слиянием SEO-выпуска main title и description «Аспирантам» — под
    // запрос «сопровождение диссертации» (Р-773, утверждено владельцем
    // 02.11.2026): их охраняет seo-meta.test.ts, здесь — только h1 и
    // og:title макета, которые называют молодых учёных (Р-769).
    const og = MAIN.match(/<meta property="og:title" content="([^"]+)">/u)?.[1] ?? '';
    assert.match(og, /^Научное сопровождение аспирантов и молодых учёных/u);
    assert.ok(h1Of(MAIN).startsWith(og.replace(/ — ProDisser$/u, '')), 'h1 начинается не с og:title');
    const title = MAIN.match(/<title>([^<]+)<\/title>/u)?.[1] ?? '';
    assert.match(title, /сопровождение диссертации/iu);
  });

  it('метка первого экрана — «Аспирантам и молодым учёным»', () => {
    const before = MAIN.slice(0, MAIN.indexOf('<h1'));
    const label = before.slice(before.lastIndexOf('<span'));
    assert.equal(text(label), 'Аспирантам и молодым учёным');
  });

  it('перенесённый компонент — тот же h1', () => {
    const tsx = read('app/src/components/pages/PostgradPage.tsx');
    assert.match(tsx.replace(/ /gu, ' '), /аспирантов и молодых учёных<\/span>: диссертация, статьи, гранты/u);
  });
});

describe('«Аспирантам»: раздел «Публикации к защите» (#articles, Р-808)', () => {
  const block = section(MAIN, 'articles');
  const card = object(MAIN, 'articleCard');
  const rows = terms(MAIN, 'pubRows');

  it('стоит сразу после «Услуг» и перед «Порядком работы» (раздел «Стоимость» снят, Р-807)', () => {
    const ids = [...MAIN.matchAll(/<section id="([^"]+)"/gu)].map((m) => m[1]);
    const at = ids.indexOf('articles');
    assert.equal(ids[at - 1], 'services');
    assert.equal(ids[at + 1], 'process');
  });

  it('метка «Публикации к защите»; карточка статьи — прежними формулировками; патента и Роспатента нет', () => {
    const shown = text(block);
    assert.match(shown, /^Публикации к защите Сколько статей нужно к защите и что в них проверяем /u);
    for (const phrase of ['Научная статья', 'перечня ВАК', 'Scopus', 'Web of Science', 'аннотацию', 'рецензентов', 'О публикации решает редакция журнала']) {
      assert.ok(card.includes(phrase), `в карточке статьи нет «${phrase}»`);
    }
    // Патент и программа для ЭВМ как услуга — на «Компаниям» (пакеты 03 и 04).
    assert.doesNotMatch(`${shown}\n${card}`, /Роспатент|Патент на изобретение|Статьи и гранты/u);
    assert.doesNotMatch(MAIN, /articleTracks|pd-patent|pd-articles/u, 'остались данные или стили прежнего раздела');
  });

  it('инфографика: число публикаций по п. 13 — кандидатская 3 и 2, докторская 15 и 10, отрасли — словами пункта', () => {
    // Цитата п. 13 по выдержкам справочных систем (сверка владельцем, Р-804, Р-808):
    // «…доктора наук… по историческим, педагогическим, политическим, психологическим,
    // социологическим, филологическим, философским, экономическим, юридическим отраслям
    // науки, искусствоведению, культурологии и теологии — не менее 15; по остальным
    // отраслям науки — не менее 10»; кандидата наук — «не менее 3» и «не менее 2».
    const first = "['Исторические, педагогические, политические, психологические, социологические, филологические, философские, экономические, юридические науки; искусствоведение, культурология, теология', 3, 15]";
    assert.ok(rows.includes(first), 'первая строка таблицы — не по п. 13');
    assert.ok(rows.includes("['Остальные отрасли науки', 2, 10]"), 'вторая строка таблицы — не по п. 13');
    assert.equal((rows.match(/^\s+\['/gmu) ?? []).length, 2, 'строк в таблице не две');
    for (const stem of ['историч', 'педагогич', 'политич', 'психологич', 'социологич', 'филологич', 'философ', 'экономич', 'юридич', 'искусствовед', 'культуролог', 'теолог']) {
      assert.ok(first.toLowerCase().includes(stem), `в первой строке нет отрасли «${stem}…»`);
    }
    // Р-833: подвал с пояснениями снят — таблица называется заголовком, ссылки на снятый абзац нет.
    assert.match(block, /<div class="pd-pubmx" role="table" aria-labelledby="mp-pub-title" style=/u);
    assert.doesNotMatch(MAIN, /mp-pub-note/u, 'осталась ссылка на снятый абзац');
    assert.deepEqual([...block.matchAll(/<span role="columnheader"[^>]*>([^<]+)<\/span>/gu)].map((m) => m[1]), ['Отрасль науки', 'Кандидатская', 'Докторская']);
    assert.match(block, /class="pd-pubdots" aria-hidden="true"/u, 'точки не скрыты от читалки: число читается текстом');
    assert.match(MAIN, /candDots: dots\(cand\), docDots: dots\(doc\)/u, 'точек не столько, сколько публикаций');
  });

  it('подпись инфографики — источник в заголовке; пояснения под ней сняты (Р-833)', () => {
    // Владелец 07.11.2026: «убрать эту надпись на блоке, мелкая и непонятная для чего».
    const shown = text(block);
    assert.match(shown, /Минимальное число по п\. 13 Положения о присуждении учёных степеней/u);
    assert.doesNotMatch(shown, /К публикациям приравниваются/u, 'осталось пояснение о патентах и свидетельствах');
    assert.doesNotMatch(shown, /Положение утверждено постановлением/u, 'осталась оговорка о постановлении');
  });

  it('строка о заявке на грант для молодых учёных — в подвале раздела, срок из карточки «Гранты и заявки» (была в таблице сроков, Р-807)', () => {
    const at = block.indexOf('<div class="pd-pubgrant');
    assert.ok(at > block.indexOf('</article>'), 'строка гранта стоит не в подвале раздела');
    assert.equal(text(block.slice(at)), 'Молодым учёным: заявка на грант от 21 дня РНФ и другие научные фонды: куратор сверяет заявку с условиями конкурса. О поддержке проекта решает фонд по итогам экспертизы. Оставить заявку');
    assert.match(terms(MAIN, 'offerMid'), /\['Гранты и заявки', '[^']+', 'от 21 дня'\]/u);
  });

  it('срок статьи — из карточки «Научные статьи»', () => {
    assert.match(card, /title: 'Научная статья', term: 'от 14 дней'/u);
    assert.match(terms(MAIN, 'offerTop'), /\['Научные статьи', '[^']+', 'от 14 дней'\]/u);
  });

  it('кнопка «Оставить заявку» ведёт к прежней форме #request, своей формы у раздела нет (Р-96)', () => {
    assert.equal((block.match(/<a href="#request"[^>]*>Оставить заявку<\/a>/gu) ?? []).length, 1);
    assert.doesNotMatch(block, /<form|<input|<textarea/u);
    assert.equal((MAIN.match(/<form/gu) ?? []).length, 3, 'на «Аспирантам» три формы: первый экран, заявка, отзыв');
  });

  it('тексты раздела — сопровождение и проверка, без оборотов text-guard и обещания решения', () => {
    const all = `${text(block)}\n${card}\n${rows}`;
    assert.deepEqual(findForbidden(all, '#articles'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напишем|подготовим статью|опубликуем/iu);
  });

  it('раздел есть в перенесённом компоненте', () => {
    const tsx = read('app/src/components/pages/PostgradPage.tsx');
    assert.match(tsx, /<section [^>]*id="articles"/u);
    assert.ok(tsx.includes('Публикации к\u00a0защите'), 'в компоненте нет метки «Публикации к защите»');
  });
});

describe('главная: вход для молодых учёных', () => {
  it('h1, <title> и og:title — научный консалтинг для студентов, аспирантов, молодых учёных и компаний', () => {
    const expected = 'ProDisser — научный консалтинг для студентов, аспирантов, молодых учёных и компаний';
    assert.equal(h1Of(START), expected);
    assert.match(START, new RegExp(`<title>${expected}</title>`, 'u'));
    assert.match(START, new RegExp(`<meta property="og:title" content="${expected}">`, 'u'));
  });

  it('под формой первого экрана строки направлений нет (Р-861): вход в направления — карточками «Три направления работы» ниже', () => {
    const tsx = read('app/src/components/pages/StartPage.tsx');
    for (const [where, source] of [['макет', START], ['StartPage.tsx', tsx]] as const) {
      assert.doesNotMatch(source, /data-dirs|pd-dirs|aria-label="Направления работы"/u, `${where}: строка направлений под формой вернулась`);
      const hero = source.slice(source.indexOf('<form'), source.indexOf('pd-hero-art'));
      assert.doesNotMatch(hero, /href="(?:\.\/|\/)(?:students|main|business)(?:\.html)?"/u, `${where}: ссылки на направления в колонке формы`);
    }
    const cards = [...START.matchAll(/<a class="pd-lift" href="\.\/(students|main|business)\.html"/gu)].map((m) => m[1]);
    assert.deepEqual([...cards].sort(), ['business', 'main', 'students'], 'ссылки на три направления ниже по странице');
  });

  it('карточка направления 1 — «Диссертация, статьи и гранты» / «Аспирантам и молодым учёным»', () => {
    const card = START.slice(START.indexOf('<a class="pd-lift" href="./main.html"'));
    const shown = text(card.slice(0, card.indexOf('</a>')));
    assert.match(shown, /Диссертация, статьи и гранты Аспирантам и молодым учёным$/u);
    assert.doesNotMatch(START, /Довести диссертацию до защиты|Аспирантам и соискателям/u);
  });
});

describe('Директ: группы B и быстрая ссылка ведут на #articles (Р-570)', () => {
  const source = JSON.parse(read('marketing/campaigns/direct.json')) as {
    campaigns: { page: string; sitelinks: { title: string; anchor: string }[]; groups: { name: string; set?: string; anchor: string }[] }[];
  };
  const pg = source.campaigns.find((c) => c.page === '/main');

  it('PG_ARTICLES и PG_GRANTS — на /main#articles, якорь есть в макете', () => {
    assert.ok(pg, 'нет кампании «Аспирантам»');
    for (const name of ['PG_ARTICLES', 'PG_GRANTS']) {
      assert.equal(pg.groups.find((g) => g.name === name)?.anchor, 'articles', name);
    }
    for (const group of pg.groups.filter((g) => g.set === 'B')) assert.equal(group.anchor, 'articles', group.name);
    assert.match(MAIN, /<section id="articles"/u);
  });

  it('быстрая ссылка «Статьи к защите» (раздел «Публикации к защите», Р-808) — среди первых четырёх, на #articles', () => {
    const first = pg!.sitelinks.slice(0, 4);
    assert.ok(first.some((s) => s.title === 'Статьи к защите' && s.anchor === 'articles'));
    assert.ok(!pg!.sitelinks.some((s) => s.title === 'Статьи и гранты'), 'осталась быстрая ссылка прежнего раздела');
  });

  it('описание кампании для чтения совпадает с источником', () => {
    const doc = read('marketing/campaigns/direct-аспиранты.md');
    assert.match(doc, /### PG_ARTICLES — `https:\/\/prodisser\.ru\/main#articles`/u);
    assert.match(doc, /### PG_GRANTS — `https:\/\/prodisser\.ru\/main#articles`/u);
    assert.match(doc, /\| Статьи к защите \| `\/main#articles` \|/u);
  });
});
