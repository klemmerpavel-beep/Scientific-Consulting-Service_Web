/**
 * Сайт (решение Р-769, П-19): молодые учёные — свой вход. На «Аспирантам»
 * h1 и метка первого экрана называют «аспирантов и молодых учёных», после
 * «Услуг» — раздел «Статьи и гранты» (`#articles`) с кнопкой к прежней
 * форме заявки (новой формы нет, Р-96), строка гранта в таблице сроков. На
 * главной — h1 о научном консалтинге для студентов, аспирантов, молодых
 * учёных и компаний, под формой первого экрана — три ссылки направлений,
 * карточка направления 1 — «Аспирантам и молодым учёным». Группы B Директа
 * (статьи и гранты) и быстрая ссылка «Статьи и гранты» ведут на `#articles`.
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

const MAIN = design('MainPage');
const START = design('StartPage');

describe('«Аспирантам»: первый экран называет молодых учёных', () => {
  it('h1 — «Научное сопровождение аспирантов и молодых учёных: диссертация, статьи, гранты», бренд не первым словом', () => {
    const h1 = h1Of(MAIN);
    assert.equal(h1, 'Научное сопровождение аспирантов и молодых учёных: диссертация, статьи, гранты');
    assert.doesNotMatch(h1, /^ProDisser/u);
  });

  it('h1 согласован с <title> и og:title', () => {
    const title = MAIN.match(/<title>([^<]+)<\/title>/u)?.[1] ?? '';
    assert.match(title, /^Научное сопровождение аспирантов и молодых учёных/u);
    assert.match(MAIN, /<meta property="og:title" content="Научное сопровождение аспирантов и молодых учёных/u);
    assert.ok(h1Of(MAIN).startsWith(title.replace(/ — ProDisser$/u, '')), 'h1 начинается не с <title>');
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

describe('«Аспирантам»: раздел «Статьи и гранты» (#articles)', () => {
  const block = section(MAIN, 'articles');

  it('стоит сразу после «Услуг» и перед «Стоимостью»', () => {
    const ids = [...MAIN.matchAll(/<section id="([^"]+)"/gu)].map((m) => m[1]);
    const at = ids.indexOf('articles');
    assert.equal(ids[at - 1], 'services');
    assert.equal(ids[at + 1], 'cost');
  });

  it('метка «Статьи и гранты», статья, грант, патент и программа для ЭВМ', () => {
    const shown = text(block);
    assert.match(shown, /^Статьи и гранты /u);
    const data = terms(MAIN, 'articleTracks');
    for (const phrase of ['Научная статья', 'перечня ВАК', 'Scopus', 'Web of Science', 'аннотацию', 'рецензентов', 'О публикации решает редакция журнала',
      'Заявка на грант', 'РНФ', 'новизны', 'План работ', 'смету заявки', 'отчёт по этапу']) {
      assert.ok(data.toLowerCase().includes(phrase.toLowerCase()), `в данных раздела нет «${phrase}»`);
    }
    assert.match(shown, /Патент на изобретение и программа для ЭВМ\./u);
    assert.match(shown, /решает Роспатент/u);
  });

  it('сроки — из карточек «Научные статьи» и «Гранты и заявки»', () => {
    const data = terms(MAIN, 'articleTracks');
    assert.match(data, /title: 'Научная статья', term: 'от 14 дней'/u);
    assert.match(data, /title: 'Заявка на грант', term: 'от 21 дня'/u);
    assert.match(terms(MAIN, 'offerTop'), /\['Научные статьи', '[^']+', 'от 14 дней'\]/u);
    assert.match(terms(MAIN, 'offerMid'), /\['Гранты и заявки', '[^']+', 'от 21 дня'\]/u);
  });

  it('кнопка «Оставить заявку» ведёт к прежней форме #request, своей формы у раздела нет (Р-96)', () => {
    assert.match(block, /<a href="#request"[^>]*>Оставить заявку<\/a>/u);
    assert.doesNotMatch(block, /<form|<input|<textarea/u);
    assert.equal((MAIN.match(/<form/gu) ?? []).length, 3, 'на «Аспирантам» три формы: первый экран, заявка, отзыв');
  });

  it('строка гранта в таблице сроков', () => {
    assert.match(terms(MAIN, 'termRows'), /\['Заявка на грант в научный фонд', 'от 21 дня'\]/u);
  });

  it('тексты раздела — сопровождение и проверка, без оборотов text-guard и обещания решения', () => {
    const all = `${text(block)}\n${terms(MAIN, 'articleTracks')}`;
    assert.deepEqual(findForbidden(all, '#articles'), []);
    assert.doesNotMatch(all, /гарант|под ключ|напишем|подготовим статью|опубликуем/iu);
  });

  it('раздел есть в перенесённом компоненте', () => {
    assert.match(read('app/src/components/pages/PostgradPage.tsx'), /<section [^>]*id="articles"/u);
  });
});

describe('главная: вход для молодых учёных', () => {
  it('h1, <title> и og:title — научный консалтинг для студентов, аспирантов, молодых учёных и компаний', () => {
    const expected = 'ProDisser — научный консалтинг для студентов, аспирантов, молодых учёных и компаний';
    assert.equal(h1Of(START), expected);
    assert.match(START, new RegExp(`<title>${expected}</title>`, 'u'));
    assert.match(START, new RegExp(`<meta property="og:title" content="${expected}">`, 'u'));
  });

  it('под формой первого экрана — «Студентам · Аспирантам и молодым учёным · Компаниям» (после формы, Р-59)', () => {
    const form = START.indexOf('<form');
    const nav = START.indexOf('<nav aria-label="Направления работы" data-dirs="top"');
    assert.ok(nav > START.indexOf('</form>', form), 'ссылки стоят не после формы первого экрана');
    assert.ok(nav < START.indexOf('class="pd-hero-art"'), 'ссылки ушли из колонки формы');
    const block = START.slice(nav, START.indexOf('</nav>', nav));
    const links = [...block.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].map((m) => `${m[2]!.replace(/ /gu, ' ')} → ${m[1]}`);
    assert.deepEqual(links, ['Студентам → ./students.html', 'Аспирантам и молодым учёным → ./main.html', 'Компаниям → ./business.html']);
    assert.equal(text(block).replace(/\s*·\s*/gu, ' · '), 'Студентам · Аспирантам и молодым учёным · Компаниям');
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

  it('быстрая ссылка «Статьи и гранты» — среди первых четырёх, на #articles', () => {
    const first = pg!.sitelinks.slice(0, 4);
    assert.ok(first.some((s) => s.title === 'Статьи и гранты' && s.anchor === 'articles'));
  });

  it('описание кампании для чтения совпадает с источником', () => {
    const doc = read('marketing/campaigns/direct-аспиранты.md');
    assert.match(doc, /### PG_ARTICLES — `https:\/\/prodisser\.ru\/main#articles`/u);
    assert.match(doc, /### PG_GRANTS — `https:\/\/prodisser\.ru\/main#articles`/u);
    assert.match(doc, /\| Статьи и гранты \| `\/main#articles` \|/u);
  });
});
