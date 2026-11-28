/**
 * Страница контактов `/contacts` (решение Р-1015, ответ владельца на квиз
 * 25.11.2026: «Страница „Контакты“»).
 *
 * - Телефон, почта и часы — те же, что в подвалах и формах; реквизиты — те
 *   же, что в правовых документах. Расхождение сведений об организации на
 *   разных страницах поисковик читает как признак недостоверности.
 * - Адрес назван юридическим и почтовым: о приёме посетителей страница не
 *   сообщает, пока владелец этого не подтвердил.
 * - Р-404 действует: подвалы содержательных страниц реквизитов не несут
 *   (`requisites.test.ts`), туда добавлена только ссылка «Контакты».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const DESIGN = read('design', 'ContactsPage.dc.html');
const TSX = read('app', 'src', 'components', 'pages', 'ContactsPage.tsx');
const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gu, ' ').replace(/<[^>]+>/gu, ' ').replace(/[ ⁠]/gu, (c) => (c === ' ' ? ' ' : '')).replace(/\s+/gu, ' ');
const BODY = text(DESIGN.slice(DESIGN.indexOf('</helmet>'), DESIGN.indexOf('<script type="text/x-dc"')));

describe('страница контактов: сведения совпадают с остальным сайтом (Р-1015)', () => {
  it('заголовок один — «Контакты ProDisser»; title до 60 знаков, описание до 160', () => {
    assert.deepEqual([...DESIGN.matchAll(/<h1[^>]*>([^<]*)<\/h1>/gu)].map((m) => m[1]), ['Контакты ProDisser']);
    const title = /<title>([^<]*)<\/title>/u.exec(DESIGN)![1]!;
    const description = /<meta name="description" content="([^"]*)">/u.exec(DESIGN)![1]!;
    assert.match(title, /^Контакты ProDisser/u);
    assert.ok(title.length <= 60 && description.length <= 160, `${title.length} / ${description.length}`);
    const meta = read('app', 'src', 'components', 'pages', 'ContactsPage.meta.ts');
    assert.ok(meta.includes(JSON.stringify(title)) && meta.includes(JSON.stringify(description)));
  });

  it('телефон и почта — из practice-contacts, ссылками tel: и mailto:', () => {
    const contacts = read('app', 'src', 'lib', 'practice-contacts.ts');
    const phone = /PRACTICE_PHONE = '([^']+)'/u.exec(contacts)![1]!;
    const email = /PRACTICE_EMAIL = '([^']+)'/u.exec(contacts)![1]!;
    for (const source of [DESIGN, TSX]) {
      assert.ok(source.includes(`href="tel:${phone.replace(/[^\d+]/gu, '')}"`), 'телефон');
      assert.ok(source.includes(`>${phone}<`), 'надпись телефона');
      assert.ok(source.includes(`href="mailto:${email}"`) && source.includes(`>${email}<`), 'почта');
    }
  });

  it('часы работы — те же, что в форме заявки главной', () => {
    assert.match(BODY, /Пн—Пт 10:00—19:00/u);
    assert.match(text(read('design', 'StartPage.dc.html')), /Пн—Пт 10:00—19:00/u);
    // Часы не рвутся по тире: соединитель слов и неразрывный пробел.
    assert.ok(DESIGN.includes('Пн⁠—⁠Пт 10:00⁠—⁠19:00'));
  });

  it('реквизиты — те же, что в согласии: наименование, ОГРН, ИНН, КПП, адрес', () => {
    const consent = text(read('design', 'ConsentPage.dc.html'));
    const address = '109451, г. Москва, вн. тер. г. муниципальный округ Марьино, б-р Перервинский, д. 27, к. 1, помещ. 10н';
    for (const part of ['«РУСДРОН»', '1257700248860', '9723254250', '772301001', address]) {
      assert.ok(BODY.includes(part), `на странице контактов нет «${part}»`);
      assert.ok(consent.includes(part), `в согласии нет «${part}»`);
    }
  });

  it('адрес назван юридическим и почтовым; о приёме посетителей, офисе и схеме проезда страница не сообщает', () => {
    assert.match(BODY, /Юридический и почтовый адрес/u);
    assert.doesNotMatch(BODY, /офис|приём посетителей|приезжайте|схема проезда|как добраться|Реутов/iu);
  });

  it('заявка ведёт на форму главной; своей формы и новых полей на странице нет', () => {
    assert.match(DESIGN, /<a href="\.\/index\.html#request"[^>]*>Оставить заявку<\/a>/u);
    assert.doesNotMatch(DESIGN, /<form|<input|<textarea|<select/u);
  });
});

describe('страница контактов встроена в сайт (Р-1015)', () => {
  it('маршрут: canonical /contacts, разметка организации с реквизитами', () => {
    const route = read('app', 'src', 'app', 'contacts', 'page.tsx');
    assert.match(route, /alternates: \{ canonical: '\/contacts' \},/u);
    assert.match(route, /<OrgSchema requisites \/>/u);
    assert.match(route, /openGraph: \{ \.\.\.OG_SITE, /u);
  });

  it('страница — в карте сайта и в перечне дат правки', () => {
    assert.match(read('app', 'src', 'app', 'sitemap.ts'), /\{ path: '\/contacts', priority: 0\.5 \},/u);
    assert.match(read('app', 'scripts', 'seo-sync.mjs'), /\['\/contacts', 'ContactsPage'\],/u);
  });

  it('макет перечислен во всех таблицах переноса и в конвертере', () => {
    for (const file of [['.github', 'workflows', 'ci.yml'], ['CONTRIBUTING.md'], ['.claude', 'skills', 'prodisser-visual-style', 'scripts', 'sync-check.sh']]) {
      assert.ok(read(...file).includes('ContactsPage:ContactsPage:landing'), file.join('/'));
    }
    assert.ok(read('tools', 'dc-to-tsx.mjs').includes("'./contacts.html': '/contacts'"));
  });

  it('в подвале шести страниц — ссылка «Контакты», и только ссылка: реквизитов там нет (Р-404)', () => {
    for (const [design, component] of [['StartPage', 'StartPage'], ['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'], ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage'], ['ToolsPage', 'ToolsPage']]) {
      const html = read('design', `${design}.dc.html`);
      const foot = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
      assert.equal((foot.match(/<a href="\.\/contacts\.html"[^>]*>Контакты<\/a>/gu) ?? []).length, 1, design);
      assert.doesNotMatch(foot, /ОГРН|ИНН|КПП|Перервинский/u, design);
      assert.match(read('app', 'src', 'components', 'pages', `${component}.tsx`), /href="\/contacts"/u, component);
    }
  });

  it('разметка организации называет часы работы — на всех страницах, без реквизитов в общей части', () => {
    const schema = read('app', 'src', 'components', 'OrgSchema.tsx');
    const base = schema.slice(schema.indexOf('const ORG'), schema.indexOf('const REQUISITES'));
    assert.match(base, /openingHours: 'Mo-Fr 10:00-19:00',/u);
  });
});
