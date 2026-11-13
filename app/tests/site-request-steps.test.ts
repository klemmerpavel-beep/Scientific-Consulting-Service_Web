/**
 * «Что будет после отправки» у формы заявки (Р-885, замечание владельца
 * 13.11.2026: «сделать более интерактивно… текст переработать, сделать более
 * понятным»; «вот такой формат рядом с формами предпочтительный» — панель
 * «Как проходит этап работы» на «Экспертам»). На «Студентам», «Компаниям» и
 * «Аспирантам» — один компонент: тёмная панель --pd-accent-deep, линия,
 * круги 40 px с цифрой, белые карточки шагов с меткой роли; карточки
 * проявляются по очереди один раз, наведение и фокус подсвечивают шаг.
 * Поля формы рядом не меняются (152-ФЗ), цен нет (Р-03).
 * Проверка по исходникам: макет и перенесённый компонент.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = { StudentsPage: 'StudentsPage', BusinessPage: 'BusinessPage', MainPage: 'PostgradPage' } as const;
type Page = keyof typeof PAGES;
const design = (page: Page) => read('design', `${page}.dc.html`);
const tsx = (page: Page) => read('app', 'src', 'components', 'pages', `${PAGES[page]}.tsx`);
const section = (html: string, id: string) => {
  const at = html.indexOf(`<section id="${id}"`);
  assert.ok(at > 0, `нет раздела #${id}`);
  return html.slice(at, html.indexOf('</section>', at));
};
const plain = (s: string) => s.replace(/ /gu, ' ').replace(/⁠/gu, '');

/** Правила компонента — одинаковые на трёх страницах. */
const RULES = [
  '.pd-afterflow{position:relative;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}',
  '.pd-afterflow::before{content:"";position:absolute;left:19px;top:24px;bottom:24px;width:2px;background:var(--pd-accent-soft);opacity:.55}',
  '.pd-afterflow>li:nth-child(2){transition-delay:90ms}.pd-afterflow>li:nth-child(3){transition-delay:180ms}.pd-afterflow>li:nth-child(4){transition-delay:270ms}.pd-afterflow>li:nth-child(5){transition-delay:360ms}',
  '.pd-afterflow[data-flow="wait"]>li{opacity:0;transform:translateY(12px)}',
  '.pd-afterflow>li:hover .pd-afterflow-card,.pd-afterflow>li:focus-visible .pd-afterflow-card{background:var(--pd-accent-tint)!important;transform:translateX(4px)}',
  '.pd-afterflow>li:focus-visible{outline:2px solid var(--pd-ink-inverse);outline-offset:4px}',
  '@media (prefers-reduced-motion:reduce){.pd-afterflow>li:hover .pd-afterflow-card,.pd-afterflow>li:focus-visible .pd-afterflow-card{transform:none!important}}',
  '@media (min-width:769px){.pd-after .pd-afterflow{flex:1 1 auto;justify-content:space-between}}',
];
const TITLES = ['Менеджер отвечает', 'Доступ в личный кабинет', 'Знакомство с куратором', 'Задание и смета', 'Работа по этапам'];
const ROLES = ['Менеджер', 'Вы', 'Куратор', 'Менеджер', 'Вы'];
/** Состав полей формы заявки — не меняется (152-ФЗ, CONTRIBUTING, правило 2). */
const FIELDS: Record<Page, string[]> = {
  StudentsPage: ['company_website', 'name', 'contact', 'topic', 'speciality', 'deadline', 'consent', 'terms'],
  BusinessPage: ['company_website', 'organization', 'name', 'contact', 'need', 'deadline', 'consent', 'terms'],
  MainPage: ['company_website', 'name', 'contact', 'speciality', 'deadline', 'consent', 'terms'],
};

describe('Р-885: «Что будет после отправки» — тёмная панель шагов у формы заявки', () => {
  for (const page of Object.keys(PAGES) as Page[]) {
    it(`${page}: панель по образцу «Экспертам» рядом с формой, поля формы прежние`, () => {
      const html = design(page);
      const req = section(html, 'request');
      assert.match(req, /<div class="[a-z]+-reqsteps pd-after" style="background:var\(--pd-accent-deep\);border-radius:14px;padding:24px;/u, 'нет тёмной панели шагов');
      assert.match(req, /color:var\(--pd-ink-inverse\)">Что будет после отправки<\/h3>/u);
      assert.ok(req.includes('<ol class="pd-afterflow" role="list" aria-label="Шаги после заявки">\n<sc-for list="{{ afterSteps }}" as="s" hint-placeholder-count="5">\n<li tabindex="0"><span aria-hidden="true" class="pd-afterflow-num" style="position:relative;z-index:1;width:40px;height:40px;'), 'шаг устроен иначе');
      assert.match(req, /<div class="pd-afterflow-card" style="[^"]*background:var\(--pd-ink-inverse\);border-radius:10px;padding:12px 16px;/u, 'карточка шага не белая');
      assert.match(req, /font-size:15px;line-height:1\.4;font-weight:600;color:var\(--pd-ink\)">\{\{ s\.title \}\}<\/span><span style="background:\{\{ s\.roleBg \}\};border-radius:999px;padding:2px 10px;font-size:12px;[^"]*color:\{\{ s\.roleInk \}\}">\{\{ s\.role \}\}<\/span>/u, 'нет метки роли');
      assert.doesNotMatch(req, /pd-track|image-slot/u, 'прежняя шкала или снимок у формы');
      const form = req.slice(req.indexOf('<form '), req.indexOf('</form>'));
      assert.deepEqual([...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/gu)].map((m) => m[1]), FIELDS[page], 'состав полей формы изменился');
      for (const source of [html, tsx(page)]) for (const rule of RULES) assert.ok(source.includes(rule), `${page}: нет правила «${rule.slice(0, 50)}…»`);
    });

    it(`${page}: пять шагов с ролями, цифрами в кругах и без цен; появление — один раз`, () => {
      const html = design(page);
      const at = html.indexOf('      afterSteps: [\n');
      assert.ok(at > 0, 'нет данных afterSteps');
      const data = plain(html.slice(at, html.indexOf('].map(([title, role, text], i) => {', at)));
      const rows = [...data.matchAll(/^\s*\['([^']+)', '([^']+)', '([^']+)'\],?$/gmu)].map((m) => [m[1], m[2], m[3]]);
      assert.deepEqual(rows.map((r) => r[0]), TITLES);
      assert.deepEqual(rows.map((r) => r[1]), ROLES);
      for (const [, , text] of rows) assert.doesNotMatch(text!, /₽|руб|\d+\s*%|гаранти|под ключ/iu, `цена или обещание в шаге: ${text}`);
      assert.match(html, /return \{ title, role, text, n: String\(i \+ 1\),/u, 'в кругах не цифры по порядку');
      // Появление: ждёт, пока панель дойдёт до чтения; без наблюдателя и при уменьшенном движении шаги видны сразу.
      const mount = html.slice(html.indexOf('componentDidMount(){'), html.indexOf('componentWillUnmount(){'));
      assert.match(mount, /'IntersectionObserver' in window && !window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/u);
      assert.match(mount, /this\.flow\.setAttribute\('data-flow', 'wait'\)[\s\S]*this\.flow\.setAttribute\('data-flow', 'in'\);\s*this\.flowSeen\.disconnect\(\);/u);
      assert.match(html, /componentWillUnmount\(\)\{\n    if \(this\.flowSeen\) this\.flowSeen\.disconnect\(\);/u);
    });

    it(`${page}: тёмная панель у формы не соседствует с другой (Р-608)`, () => {
      const html = design(page);
      const req = html.indexOf('<section id="request"');
      const prev = html.slice(html.lastIndexOf('<section', req - 1), req);
      assert.doesNotMatch(prev, /--pd-accent-deep/u, 'перед блоком заявки — раздел с тёмной панелью');
    });
  }
});
