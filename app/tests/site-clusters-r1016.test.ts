/**
 * Посадочные под кластеры запросов (решение Р-1016; ответ владельца
 * на квиз 25.11.2026: «Посадочные под кластеры», ядро — «помощь и
 * сопровождение»).
 *
 * - Одна страница — один кластер: слово кластера стоит в title, H1 и адресе.
 * - Новых фактов страницы не вводят: числа и обозначения норм совпадают с
 *   разводящей страницей, откуда они взяты.
 * - Формулировки — сопровождение, а не выполнение работы за автора
 *   (п. 10 ст. 7 закона «О рекламе», правило проекта о словах).
 * - Своей формы нет: состав полей форм заморожен, заявка ведёт на форму
 *   разводящей страницы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { LOOSE } from './helpers/short-words.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const { FAQ } = await import('../content/faq.generated.ts');

/** Видимый текст макета: без стилей, сценария и комментариев; набор Р-1005 снят. */
const body = (html: string) => html.slice(html.indexOf('</helmet>'), html.indexOf('<script type="text/x-dc"'))
  .replace(/<!--[\s\S]*?-->/gu, ' ').replace(/<[^>]+>/gu, ' ');
const plain = (text: string) => text.replace(/\u2060/gu, '').replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ');

const CLUSTERS = [
  {
    decision: 'Р-1016', design: 'CandidatePage', route: 'kandidatskaya-dissertaciya', parent: 'MainPage', parentRoute: 'main',
    term: /кандидатской диссертации/iu, h1: 'Сопровождение кандидатской диссертации от плана до защиты',
    linkText: 'сопровождение кандидатской диссертации',
  },
  {
    decision: 'Р-1016', design: 'NiokrPage', route: 'niokr', parent: 'BusinessPage', parentRoute: 'business',
    term: /НИОКР/u, h1: 'НИОКР по договору: от технического задания до акта приёмки',
    linkText: 'НИОКР по договору',
  },
] as const;

for (const c of CLUSTERS) {
  const design = read('design', `${c.design}.dc.html`);
  const tsx = read('app', 'src', 'components', 'pages', `${c.design}.tsx`);
  const text = plain(body(design));
  const parent = read('design', `${c.parent}.dc.html`);

  describe(`/${c.route}: посадочная кластера (${c.decision})`, () => {
    it('слово кластера — в title, описании и H1; title до 60 знаков, описание до 160', () => {
      const title = /<title>([^<]*)<\/title>/u.exec(design)![1]!;
      const description = /<meta name="description" content="([^"]*)">/u.exec(design)![1]!;
      assert.ok(title.length <= 60 && description.length <= 160, `${title.length} / ${description.length}`);
      assert.match(title, c.term);
      assert.match(description, c.term);
      const h1 = [...design.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gu)].map((m) => plain(m[1]!.replace(/<[^>]+>/gu, '')));
      assert.deepEqual(h1, [c.h1]);
      const meta = read('app', 'src', 'components', 'pages', `${c.design}.meta.ts`);
      assert.ok(meta.includes(JSON.stringify(title)) && meta.includes(JSON.stringify(description)));
    });

    it('подсветка — в h1 и только в нём; у h2 её нет', () => {
      assert.equal((design.match(/<h1[^>]*>[\s\S]*?background:var\(--pd-accent-mark\)[\s\S]*?<\/h1>/gu) ?? []).length, 1);
      for (const m of design.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gu)) assert.doesNotMatch(m[1]!, /pd-accent-mark/u);
    });

    it('формулировки — сопровождение: нет «заказать», «купить», «под ключ», обещаний результата', () => {
      for (const source of [design.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, ''), tsx]) {
        assert.doesNotMatch(source, /заказ(?!чик)|купи|под[\s\u00a0]+ключ|написани[еяю]|вычитк|гаранти|успешн\w+ защит|уникальност|антиплагиат/iu);
      }
    });

    it('предлоги и союзы в одну-две буквы связаны неразрывным пробелом (Р-1005)', () => {
      const loose = body(design).match(LOOSE);
      assert.equal(loose, null, `обычный пробел после: ${loose?.slice(0, 8).join('|')}`);
    });

    it('своей формы нет: кнопки ведут на форму разводящей страницы', () => {
      assert.doesNotMatch(design, /<form|<input|<textarea|<select/u);
      const cta = [...design.matchAll(/<a href="([^"]+)"[^>]*>Оставить заявку</gu)].map((m) => m[1]);
      assert.deepEqual(cta, [`./${c.parentRoute}.html#request`, `./${c.parentRoute}.html#request`]);
      assert.ok(parent.includes('id="request"'), 'у разводящей страницы нет раздела заявки');
      assert.ok(tsx.includes(`href="/${c.parentRoute}#request"`));
    });

    it('каждый якорь, на который ведут ссылки страницы, есть на разводящей', () => {
      for (const m of design.matchAll(new RegExp(`href="\\./${c.parentRoute}\\.html#([a-z-]+)"`, 'gu'))) {
        assert.ok(parent.includes(`id="${m[1]}"`), `на ${c.parent} нет якоря #${m[1]}`);
      }
    });

    it('вопросов пять, ответы видны сразу и совпадают с разметкой FAQPage', () => {
      const items = FAQ[`/${c.route}`]!;
      assert.equal(items.length, 5);
      for (const { q, a } of items) {
        assert.match(q, /\?$/u);
        assert.ok(design.includes(q) && design.includes(a), `нет в макете: ${q}`);
      }
      // Ответ отрисован абзацем без условия: раскрывать нечего.
      assert.match(design, /<sc-for list="\{\{ faq \}\}" as="f"[^>]*>\n<div [^>]*>\n<h3 [^>]*>\{\{ f\.q \}\}<\/h3>\n<p [^>]*>\{\{ f\.a \}\}<\/p>\n<\/div>\n<\/sc-for>/u);
      assert.ok(read('app', 'src', 'app', c.route, 'page.tsx').includes(`<FaqSchema page="/${c.route}" />`));
    });

    it('страница встроена: маршрут, canonical, карта сайта, таблицы переноса, конвертер, витрина', () => {
      const route = read('app', 'src', 'app', c.route, 'page.tsx');
      assert.ok(route.includes(`alternates: { canonical: '/${c.route}' },`) && route.includes('<OrgSchema />'));
      assert.ok(read('app', 'src', 'app', 'sitemap.ts').includes(`{ path: '/${c.route}', priority: 0.8 },`));
      assert.ok(read('app', 'scripts', 'seo-sync.mjs').includes(`['/${c.route}', '${c.design}'],`));
      for (const file of [['.github', 'workflows', 'ci.yml'], ['CONTRIBUTING.md'], ['.claude', 'skills', 'prodisser-visual-style', 'scripts', 'sync-check.sh']]) {
        assert.ok(read(...file).includes(`${c.design}:${c.design}:landing`), file.join('/'));
      }
      assert.ok(read('tools', 'dc-to-tsx.mjs').includes(`'./${c.route}.html': '/${c.route}'`));
      assert.ok(read('app', 'scripts', 'build-preview.mjs').includes(`'${c.route}'`));
    });

    it('на разводящей странице — одна ссылка на посадочную, строкой под разделом', () => {
      const links = [...parent.matchAll(new RegExp(`<a href="\\./${c.route}\\.html"[^>]*>([^<]*)</a>`, 'gu'))].map((m) => plain(m[1]!));
      assert.deepEqual(links, [c.linkText]);
      assert.match(parent, new RegExp(`<p class="pd-cluster"[^>]*>Отдельная страница направления: <a href="\\./${c.route}\\.html" style="[^"]*text-decoration:underline`, 'u'));
    });

    it('реквизитов общества на странице нет (Р-404)', () => {
      assert.doesNotMatch(design, /1257700248860|9723254250|772301001|ОГРН|КПП|Перервинский/u);
    });
  });
}

describe('посадочные не вводят новых фактов: числа и нормы — те же, что на разводящих страницах', () => {
  const candidate = plain(body(read('design', 'CandidatePage.dc.html')));
  const main = read('design', 'MainPage.dc.html');
  const niokr = plain(body(read('design', 'NiokrPage.dc.html')));
  const business = plain(read('design', 'BusinessPage.dc.html'));

  it('кандидатская: «не менее 3» и «не менее 2» — числа таблицы «Публикации к защите» (п. 13 Положения, Р-808)', () => {
    const rows = [...main.matchAll(/\['([^']+)', (\d+), (\d+)\]/gu)].filter((m) => /отрасли науки|науки;/u.test(m[1]!));
    assert.deepEqual(rows.map((m) => Number(m[2])), [3, 2]);
    assert.match(candidate, /культурология, теология не менее 3 Остальные отрасли науки не менее 2/u);
    assert.match(candidate, /по п\. 13 Положения о присуждении учёных степеней/u);
  });

  it('кандидатская: ГОСТ Р 7.0.11-2011 и «О публикации решает редакция журнала» — как на «Аспирантам»', () => {
    for (const part of ['ГОСТ Р 7.0.11-2011', 'О публикации решает редакция журнала.']) {
      assert.ok(candidate.includes(part) && plain(main).includes(part), part);
    }
  });

  it('НИОКР: ГОСТ 7.32-2017, карта НИОКТР, п. 7 ст. 262 НК РФ и решение налогового органа — как на «Компаниям»', () => {
    for (const part of ['ГОСТ 7.32-2017', 'НИОКТР', 'п. 7 ст. 262 НК РФ', 'принимает налоговый орган']) {
      assert.ok(niokr.includes(part) && business.includes(part), part);
    }
  });

  it('часы ответа менеджера — те же, что в формах: Пн—Пт 10:00—19:00', () => {
    for (const text of [candidate, niokr]) assert.match(text, /Пн—Пт 10:00—19:00/u);
  });
});
