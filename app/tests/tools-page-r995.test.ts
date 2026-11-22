/**
 * «Инструменты»: завершающий раздел с двумя входами по направлениям и подвал
 * сайта (Р-995, указание владельца 22.11.2026, С-9.2; разбор 20.11.2026, И-3
 * и И-4).
 *
 * - В разделе «Список — часть оформления работы» справа — две
 *   карточки-ссылки в исполнении Р-791 («Диплом и ВКР: семь причин возврата
 *   с нормоконтроля» → `/students#norm`, «Диссертация: нормоконтроль по ГОСТ
 *   и требованиям ВАК» → `/main#services`) и под ними одна кнопка раздела
 *   «Оставить заявку» → `/#request`.
 * - Подвал — как на содержательных страницах: вордмарк, телефон, e-mail,
 *   Telegram, VK, правовые ссылки, «Настройки cookies», строка «© 2016—2026»;
 *   реквизитов нет (Р-404). Документного подвала оболочки 404 нет.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();

export const MORE_RULES = [
  '.tl-more{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}',
  '@media (max-width:900px){.tl-more{grid-template-columns:minmax(0,1fr)}}',
  '.tl-route{display:grid;grid-template-columns:28px minmax(0,1fr) 18px;column-gap:14px;align-items:center;box-sizing:border-box;min-height:44px;padding:8px 14px;background:var(--pd-ink-inverse);border:1px solid var(--pd-border);border-radius:10px;text-decoration:none;box-shadow:0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)}',
];

/** Раздел «Список — часть оформления работы»: от `<section aria-labelledby="tl-more"` до `</section>`. */
export function moreSection(html: string): string {
  const at = html.indexOf('<section aria-labelledby="tl-more"');
  assert.ok(at >= 0, 'нет раздела #tl-more');
  return html.slice(at, html.indexOf('</section>', at));
}

describe('«Инструменты»: два входа по направлениям и подвал сайта (Р-995)', () => {
  const html = read('design', 'ToolsPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'ToolsPage.tsx');

  it('правила раскладки раздела и карточки-ссылки стоят в макете и в компоненте', () => {
    for (const rule of MORE_RULES) {
      assert.ok(html.includes(rule), `в макете нет правила: ${rule}`);
      assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
    }
    assert.match(html, /\.pd-lift:hover,\.pd-lift:focus-visible\{transform:translateY\(-5px\)!important/u, 'нет подъёма под курсором (Р-628)');
    assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{html \.pd-lift\{transition:none!important\}/u);
  });

  it('две карточки-ссылки по направлениям, затем одна кнопка к заявке', () => {
    const section = moreSection(html);
    assert.match(section, /^<section aria-labelledby="tl-more" class="tl-more" style="[^"]*display:grid;/u);
    const links = [...section.matchAll(/<a class="([^"]*)" href="([^"]+)">([\s\S]*?)<\/a>/gu)].map((m) => [m[1], m[2], plain(m[3])]);
    assert.deepEqual(links, [
      ['pd-lift tl-route', './students.html#norm', 'Диплом и ВКР: семь причин возврата с нормоконтроля'],
      ['pd-lift tl-route', './main.html#services', 'Диссертация: нормоконтроль по ГОСТ и требованиям ВАК'],
    ]);
    for (const m of section.matchAll(/<a class="pd-lift tl-route"[\s\S]*?<\/a>/gu)) {
      assert.match(m[0], /width:28px;height:28px;border-radius:50%;background:var\(--pd-accent-tint\)/u, 'нет значка 28 px');
      assert.match(m[0], /font-size:15px;line-height:1\.4;font-weight:600;color:var\(--pd-ink\)/u, 'надпись не 15 px / 600');
      assert.match(m[0], /width:18px;height:18px;[^"]*arrow-right\.svg/u, 'нет стрелки 18 px');
    }
    const buttons = [...section.matchAll(/<a href="(\.\/index\.html#request)" style="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gu)];
    assert.equal(buttons.length, 1, 'кнопка к заявке — одна');
    assert.equal(plain(buttons[0][3]), 'Оставить заявку');
    assert.ok(section.indexOf('./index.html#request') > section.indexOf('./main.html#services'), 'кнопка — под карточками');
    assert.match(tsx, /href="\/students#norm"/u);
    assert.match(tsx, /href="\/main#services"/u);
  });

  it('карточки ведут на существующие якоря направлений', () => {
    assert.match(read('design', 'StudentsPage.dc.html'), /<div id="norm" /u);
    assert.match(read('design', 'MainPage.dc.html'), /<section id="services" /u);
  });

  it('подвал сайта: вордмарк, контакты, правовые ссылки, «© 2016—2026»; документного подвала нет', () => {
    const at = html.indexOf('<footer');
    const foot = html.slice(at, html.indexOf('</footer>', at));
    assert.match(foot, /^<footer id="contacts" class="doc-foot doc-pad" style="position:relative;z-index:1;max-width:1220px;margin:clamp\(88px,8vw,128px\) auto 0;padding:48px 30px 24px;/u);
    assert.match(foot, /<a href="\.\/index\.html" aria-label="ProDisser — на главную" style="[^"]*font-size:21px;/u, 'нет вордмарка 21 px');
    for (const part of ['href="tel:+74954564323"', 'href="mailto:info.prodisser@gmail.com"', 'href="https://t.me/prodisser"', 'href="https://vk.ru/cmnrut"', 'href="./offer.html"', 'href="./privacy.html"', 'href="./consent.html"', 'href="./privacy.html#cookies" data-pd-cookies']) {
      assert.ok(foot.includes(part), `в подвале нет ${part}`);
    }
    assert.match(plain(foot), /© 2016—2026 ProDisser — научный консалтинг\. Работаем по всей России$/u);
    assert.doesNotMatch(foot, /ИНН|ОГРН|КПП|>На главную</u, 'реквизиты или ссылка документного подвала');
    assert.match(html, /padding:clamp\(56px,7vw,96px\) 30px 0">/u, 'отбивку подвала держит сам подвал, у main нижнего поля нет');
    assert.match(tsx, /href="\/privacy#cookies" data-pd-cookies=\{true\}/u);
  });

  it('проба: прежний раздел с одной кнопкой не проходит', () => {
    const old = '<section aria-labelledby="tl-more" style="display:flex"><a href="./index.html#request" style="x">Оставить заявку</a></section>';
    assert.equal([...moreSection(old).matchAll(/<a class="pd-lift tl-route"/gu)].length, 0);
  });
});
