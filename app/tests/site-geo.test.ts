/**
 * Раздел «География» (Р-849, Р-856, Р-857 — «Студентам»; Р-882 — «Аспирантам»,
 * «Компаниям», «Экспертам»): тот же раздел — карта России точками
 * (`st-russia.svg`), команды в Москве и Санкт-Петербурге, «430+ работ с 2016
 * года» без подписи-носителя, легенда, кнопка действия — на четырёх
 * страницах, у каждой свой заголовок и вводный текст. Место: «Аспирантам» и
 * «Компаниям» — перед «Вопросами», «Экспертам» — между «Вопросами» и анкетой
 * (кнопка «Заполнить анкету»). Тёмных панелей в разделе нет.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/[\u00a0\u2060]/gu, ' ').replace(/&nbsp;/gu, ' ');
/** Видимый текст фрагмента: без комментариев и тегов, пробелы схлопнуты. */
const words = (html: string) => plain(html.replace(/<!--[\s\S]*?-->/gu, '').replace(/<\/(?:span|li|p|h2|a)>/gu, ' $&').replace(/<[^>]+>/gu, ''))
  .replace(/\s+/gu, ' ').trim();

const PAGES = [
  { page: 'StudentsPage', component: 'StudentsPage', pre: 'sp', title: 'Сопровождаем дипломы и ВКР по всей России',
    lead: 'Команды практики — в Москве и Санкт-Петербурге. Работаем дистанционно: материалы, переписка и этапы — в личном кабинете.',
    cta: ['#request', 'Оставить заявку'], prev: 'tasks', next: 'faq' },
  { page: 'MainPage', component: 'PostgradPage', pre: 'pd', title: 'Сопровождаем диссертации по всей России',
    lead: 'Команды практики — в Москве и Санкт-Петербурге. С аспирантами и соискателями из других городов работаем дистанционно: материалы, переписка и этапы — в личном кабинете.',
    cta: ['#request', 'Оставить заявку'], prev: 'inside', next: 'faq' },
  { page: 'BusinessPage', component: 'BusinessPage', pre: 'bp', title: 'Работаем с компаниями по всей России',
    lead: 'Команды практики — в Москве и Санкт-Петербурге. С компаниями из других регионов работаем дистанционно: материалы, переписка и приёмка этапов — в личном кабинете.',
    cta: ['#request', 'Оставить заявку'], prev: 'rights', next: 'faq' },
  { page: 'ExpertsPage', component: 'ExpertsPage', pre: 'ex', title: 'Работаете с клиентами по всей России',
    lead: 'Команды практики — в Москве и Санкт-Петербурге. Работа дистанционная: этапы, материалы и замечания клиента — в кабинете.',
    cta: ['#anketa', 'Заполнить анкету'], prev: 'faq', next: 'anketa' },
] as const;

const geo = (source: string) => {
  const at = source.indexOf('<section id="geo"');
  assert.ok(at >= 0, 'нет раздела #geo');
  return source.slice(at, source.indexOf('</section>', at));
};
/** Карточка карты без приставки страницы — для сравнения со «Студентам». */
const card = (section: string, pre: string) => section.slice(section.indexOf(`<div class="${pre}-geo-card"`)).replaceAll(`${pre}-geo`, 'X-geo');

describe('«География» на четырёх страницах (Р-849, Р-882)', () => {
  const students = geo(read('design', 'StudentsPage.dc.html'));

  for (const p of PAGES) {
    const html = read('design', `${p.page}.dc.html`);
    const tsx = read('app', 'src', 'components', 'pages', `${p.component}.tsx`);

    it(`${p.page}: свой заголовок (до 52 знаков) и вводный текст, счётчик без подписи, два города, без «офиса»`, () => {
      const section = geo(html);
      assert.match(section, new RegExp(`<section id="geo" class="[a-z]+-pad" aria-labelledby="${p.pre}-geo-title"`, 'u'));
      const h2 = words(section.slice(section.indexOf('<h2'), section.indexOf('</h2>') + 5));
      assert.equal(h2, p.title);
      assert.ok(h2.length <= 52, `заголовок длиннее 52 знаков: ${h2.length}`);
      const text = words(section);
      assert.ok(text.includes(p.lead), `вводный текст: ${text.slice(0, 220)}`);
      assert.match(text, /430\+ работ с 2016 года Москва команда практики Санкт-Петербург команда практики/u);
      assert.doesNotMatch(section.replace(/<!--[\s\S]*?-->/gu, ''), /по[ \u00a0]книге[ \u00a0]заказов/u, 'подпись-носитель снята (Р-857)');
      assert.doesNotMatch(text, /офис/iu, 'адреса офисов на сайте не заявлены');
      assert.doesNotMatch(section, /accent-deep/u, 'в разделе тёмная панель');
      // Предлоги и союзы в одну-две буквы перед словом — с неразрывным пробелом.
      const body = section.slice(section.indexOf('<h2'), section.indexOf(`<div class="${p.pre}-geo-card"`)).replace(/<[^>]+>/gu, '');
      assert.doesNotMatch(body, /(?:^|[\s\u00a0(])(?:в|и|с|к|о|у|а|по|на|из|до|от|за)[ ](?=\p{L})/iu, 'короткое слово без неразрывного пробела');
      // Перенесённый компонент несёт тот же раздел.
      assert.ok(plain(tsx).includes(`id="geo"`) && plain(tsx).includes(p.title), 'в компоненте нет раздела');
    });

    it(`${p.page}: кнопка «${p.cta[1]}» → ${p.cta[0]}; карта, отметки, подписи и легенда — те же, что на «Студентам»`, () => {
      const section = geo(html);
      const cta = section.match(/<a href="(#[a-z]+)" style="[^"]*background:var\(--pd-ink\)[^"]*"[^>]*>([^<]+)</u);
      assert.ok(cta, 'нет кнопки действия');
      assert.deepEqual([cta[1], cta[2]], [...p.cta]);
      assert.equal(card(section, p.pre), card(students, 'sp'), 'карточка карты отличается от «Студентам»');
      assert.match(section, new RegExp(`<img class="${p.pre}-geo-map" src="\\./assets/art/st-russia\\.svg" alt="Схема: Россия[^"]+" width="640" height="353"`, 'u'));
      // Пульс узлов — только transform и opacity; при уменьшенном движении — общее правило страницы.
      assert.ok(html.includes(`@keyframes ${p.pre}-geo-pulse{from{opacity:.9;transform:scale(.8)}to{opacity:.25;transform:scale(1.25)}}`));
      assert.ok(html.includes('@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'));
      assert.match(html, new RegExp(`\\.${p.pre}-geo\\{display:grid;grid-template-columns:minmax\\(0,[.\\d]+fr\\) minmax\\(0,[.\\d]+fr\\)\\}`, 'u'));
      assert.match(html, new RegExp(`@media \\(max-width:1024px\\)\\{\\.${p.pre}-geo\\{grid-template-columns:minmax\\(0,1fr\\)\\}`, 'u'));
    });

    it(`${p.page}: место — после #${p.prev}, перед #${p.next}`, () => {
      const ids = [...html.matchAll(/<section id="([a-z]+)"/gu)].map((m) => m[1]);
      const i = ids.indexOf('geo');
      assert.equal(ids[i + 1], p.next, `за «Географией» не #${p.next}`);
      // Предыдущий раздел с якорем: между ними могут стоять разделы без id только там, где их нет.
      assert.equal(ids[i - 1], p.prev, `перед «Географией» не #${p.prev}`);
      const end = html.indexOf('</section>', html.indexOf(`<section id="${p.prev}"`));
      assert.doesNotMatch(html.slice(end + 10, html.indexOf('<section id="geo"')), /<section/u, `между #${p.prev} и «Географией» другой раздел`);
    });
  }

  it('Р-891: карта шире на 15 % от 1025 px — колонка карточки 1.676fr против 1fr у текста; отметки и подписи — в долях карты', () => {
    // Указание владельца 14.11.2026: «картинку по ширине немного увеличить, на 15 %».
    // Карта — на всю ширину карточки без полей (22 + 22 px) и рамки (2 px). На 1440 px
    // контейнер 1160 px, промежуток колонок 40 px: прежние .9fr / 1.1fr давали карту 570 px.
    const CONTAINER = 1160, GAP = 40, INSET = 46;
    const mapAt = (card: number, text: number) => (CONTAINER - GAP) * card / (card + text) - INSET;
    const before = mapAt(1.1, 0.9);
    for (const p of PAGES) {
      const html = read('design', `${p.page}.dc.html`);
      const tsx = read('app', 'src', 'components', 'pages', `${p.component}.tsx`);
      const cols = html.match(new RegExp(`\\.${p.pre}-geo\\{display:grid;grid-template-columns:minmax\\(0,([.\\d]+)fr\\) minmax\\(0,([.\\d]+)fr\\)\\}`, 'u'));
      assert.ok(cols, `${p.page}: нет сетки раздела`);
      const [first, second] = [Number(cols[1]), Number(cols[2])];
      // У «Экспертам» карточка карты — первая колонка (order:-1), у остальных — вторая.
      const [cardFr, textFr] = p.pre === 'ex' ? [first, second] : [second, first];
      const ratio = mapAt(cardFr, textFr) / before;
      assert.ok(Math.abs(ratio - 1.15) < 0.005, `${p.page}: карта ×${ratio.toFixed(3)} вместо ×1,15`);
      assert.ok(tsx.includes(cols[0]), `${p.page}: сетка не перенесена в компонент`);
      const section = geo(html);
      // Поля карточки, от которых считается ширина карты, прежние.
      assert.match(section, new RegExp(`<div class="${p.pre}-geo-card" style="[^"]*padding:22px 22px 16px;`, 'u'));
      // Карта — во всю ширину своей обёртки; разметка отметок — SVG с тем же viewBox на всю обёртку,
      // подписи — left/top в процентах: всё растёт вместе с картой.
      assert.match(section, /width="640" height="353" loading="lazy" decoding="async" style="display:block;width:100%;height:auto">\n<svg viewBox="0 0 640 353" aria-hidden="true" focusable="false" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">/u);
      assert.match(section, /left:calc\(13\.67% \+ 14px\);top:52\.01%/u, `${p.page}: подпись «Москва» не в долях карты`);
      assert.match(section, /left:calc\(13\.72% \+ 14px\);top:38\.07%/u, `${p.page}: подпись «Санкт-Петербург» не в долях карты`);
      // В узкой колонке текста название города не рвётся по дефису.
      assert.ok(section.includes('<span style="white-space:nowrap">Санкт-Петербурге.</span>'), `${p.page}: «Санкт-Петербурге» может разорваться по дефису`);
    }
  });

  it('«Экспертам»: от 1025 px карта слева, текст справа — у анкеты ниже текст слева и форма справа', () => {
    const html = read('design', 'ExpertsPage.dc.html');
    assert.ok(html.includes('.ex-geo>.ex-geo-card{order:-1}'));
    assert.ok(html.includes('@media (max-width:1024px){.ex-geo{grid-template-columns:minmax(0,1fr)}.ex-geo>.ex-geo-card{order:0}}'));
  });
});
