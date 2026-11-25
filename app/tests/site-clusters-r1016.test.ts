/**
 * Посадочные под кластеры запросов (решения Р-1016, Р-1017; ответ владельца
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
  // Пять кластеров по тому же образцу (Р-1017).
  {
    decision: 'Р-1017', design: 'MasterPage', route: 'magisterskaya-dissertaciya', parent: 'StudentsPage', parentRoute: 'students',
    term: /магистерской диссертации/iu, h1: 'Магистерская диссертация под контролем куратора со степенью',
    linkText: 'сопровождение магистерской диссертации',
  },
  {
    decision: 'Р-1017', design: 'ArticlePage', route: 'statya-vak', parent: 'MainPage', parentRoute: 'main',
    term: /ВАК/u, h1: 'Научная экспертиза статьи до подачи в журнал из перечня ВАК',
    linkText: 'статья в журнал ВАК',
  },
  {
    decision: 'Р-1017', design: 'NormPage', route: 'normokontrol', parent: 'MainPage', parentRoute: 'main',
    term: /нормоконтроль диссертации/iu, h1: 'Нормоконтроль диссертации по ГОСТ Р 7.0.11-2011 и требованиям совета',
    linkText: 'нормоконтроль диссертации',
  },
  {
    decision: 'Р-1017', design: 'PatentPage', route: 'patent', parent: 'BusinessPage', parentRoute: 'business',
    term: /патентный поиск/iu, h1: 'Патентный поиск и заявка на изобретение или полезную модель',
    linkText: 'патентный поиск и заявка',
  },
  {
    decision: 'Р-1017', design: 'GrantPage', route: 'grant', parent: 'BusinessPage', parentRoute: 'business',
    term: /заявка на грант/iu, h1: 'Заявка на грант: от условий конкурса до комплекта документов',
    linkText: 'заявка на грант',
  },
] as const;

/** Макет страницы по имени файла в ссылке: `./main.html` → `MainPage`. */
const LAYOUT_OF: Record<string, string> = {
  index: 'StartPage', main: 'MainPage', students: 'StudentsPage', business: 'BusinessPage', tools: 'ToolsPage',
  ...Object.fromEntries(CLUSTERS.map((c) => [c.route, c.design])),
};

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

    it('каждая ссылка страницы ведёт на существующую страницу и существующий раздел', () => {
      const links = [...design.slice(design.indexOf('<main')).matchAll(/href="\.\/([a-z-]+)\.html(?:#([a-z-]+))?"/gu)];
      assert.ok(links.length >= 5);
      for (const [, file, anchor] of links) {
        if (['offer', 'privacy', 'consent', 'contacts', 'cabinet'].includes(file!)) continue;
        const layout = LAYOUT_OF[file!];
        assert.ok(layout, `ссылка на неизвестную страницу ./${file}.html`);
        if (anchor) assert.ok(read('design', `${layout}.dc.html`).includes(`id="${anchor}"`), `на ${layout} нет раздела #${anchor}`);
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

    it('на разводящей странице — одна ссылка на посадочную, в строке под разделом', () => {
      const links = [...parent.matchAll(new RegExp(`<a href="\\./${c.route}\\.html"[^>]*>([^<]*)</a>`, 'gu'))].map((m) => plain(m[1]!));
      assert.deepEqual(links, [c.linkText]);
      const line = /<p class="pd-cluster"[^>]*>(Отдельн(?:ая страница направления|ые страницы направлений)): ([\s\S]*?)\.<\/p>/u.exec(parent);
      assert.ok(line, 'нет строки со ссылками на посадочные');
      assert.ok(line[2]!.includes(`<a href="./${c.route}.html" style="`) && /text-decoration:underline/u.test(line[2]!));
      // Строка одна; единственное или множественное число — по числу ссылок.
      assert.equal((parent.match(/class="pd-cluster"/gu) ?? []).length, 1);
      assert.equal(line[1] === 'Отдельная страница направления', (line[2]!.match(/<a /gu) ?? []).length === 1);
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
    for (const c of CLUSTERS) assert.match(plain(body(read('design', `${c.design}.dc.html`))), /Пн—Пт 10:00—19:00/u, c.design);
  });

  it('статья ВАК: четыре числа публикаций — числа таблицы «Аспирантам»; отраслей в первой строке двенадцать (Р-1017)', () => {
    const article = plain(body(read('design', 'ArticlePage.dc.html')));
    const rows = [...main.matchAll(/\['([^']+)', (\d+), (\d+)\]/gu)].filter((m) => /отрасли науки|науки;/u.test(m[1]!));
    assert.deepEqual(rows.map((m) => [Number(m[2]), Number(m[3])]), [[3, 15], [2, 10]]);
    assert.match(article, /теология не менее 3 Кандидатская: остальные отрасли науки не менее 2 Докторская: те же двенадцать отраслей науки не менее 15 Докторская: остальные отрасли науки не менее 10/u);
    assert.equal(plain(rows[0]![1]!).split(/[,;] /u).length, 12);
    for (const part of ['из перечня ВАК или индексируемый в Scopus и Web of Science', 'О публикации решает редакция журнала.']) {
      assert.ok(article.includes(part) && plain(main).includes(part), part);
    }
  });

  it('нормоконтроль: три стандарта — те же, что на «Аспирантам», «Студентам» и «Инструментах» (Р-1017)', () => {
    const norm = plain(body(read('design', 'NormPage.dc.html')));
    const sources = { 'ГОСТ Р 7.0.11-2011': 'MainPage', 'ГОСТ 7.32': 'StudentsPage', 'ГОСТ Р 7.0.100-2018': 'ToolsPage' };
    for (const [gost, layout] of Object.entries(sources)) {
      assert.ok(norm.includes(gost) && plain(read('design', `${layout}.dc.html`)).includes(gost), gost);
    }
    // Шесть участков проверки — из перечня «Семь причин возврата с нормоконтроля».
    const students = plain(read('design', 'StudentsPage.dc.html'));
    for (const fix of ['Проверяем сквозную нумерацию и ссылки на приложения в тексте.', 'Сверяем описания с ГОСТ, отмечаем дубли и битые ссылки.', 'Сверяем оглавление с заголовками и нумерацию страниц.']) {
      assert.ok(norm.includes(fix) && students.includes(fix), fix);
    }
  });

  it('магистерская: ГОСТ 7.32, перечень «Что прислать» и ответ о научном руководителе — как на «Студентам» (Р-1017)', () => {
    // Макет целиком: ответы «Вопросов» стоят в данных сценария.
    const master = plain(read('design', 'MasterPage.dc.html'));
    const students = plain(read('design', 'StudentsPage.dc.html'));
    for (const part of ['ГОСТ 7.32', 'Тему работы и требования кафедры к оформлению.', 'Дату защиты или дату сдачи на кафедру.', 'Мы не связываемся с кафедрой и вузом без вашей просьбы']) {
      assert.ok(master.includes(part) && students.includes(part), part);
    }
  });

  it('патент и грант: права, решение получателя и возврат оплаты — словами «Компаниям» (Р-1017)', () => {
    const patent = plain(read('design', 'PatentPage.dc.html'));
    const grant = plain(read('design', 'GrantPage.dc.html'));
    for (const part of ['не становясь правообладателем', 'Материалы проекта не используются в других работах и не публикуются как примеры.', 'отдельный первый этап с собственным актом']) {
      assert.ok(patent.includes(part) && business.includes(part), part);
    }
    for (const part of ['соответствие документа требованиям получателя на дату подачи', 'оплата за него возвращается по вашему заявлению', 'Подбираем программу под стадию и отрасль']) {
      assert.ok(grant.includes(part) && business.includes(part), part);
    }
    // Обещания результата нет: решение — за фондом и ведомством.
    assert.match(grant, /Решение принимает фонд по итогам экспертизы, и его мы не обещаем/u);
    assert.match(patent, /решение принимает ведомство по своему усмотрению, и его мы не обещаем/u);
  });
});
