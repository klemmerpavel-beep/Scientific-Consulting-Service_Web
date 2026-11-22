/**
 * Посадочная, «Что входит в сопровождение» — сетка вместо ленты (Р-991,
 * указание владельца 22.11.2026, С-8.2; разбор 20.11.2026, П-1).
 *
 * От 1025 px шесть карточек стоят сеткой 3 × 2, на 769—1024 px — 2 × 3,
 * промежуток 16 px; стрелки, полоса прогресса, остановка Tab и подпись
 * «прокрутите стрелками» на компьютере не показываются. Под сеткой — кнопка
 * раздела «Оставить заявку» (исполнение Р-960) к форме заявки посадочной.
 * До 768 px — прежняя лента со стрелками. Тексты шести карточек прежние.
 * Проверка идёт по макету и по перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

export const SCOPE_GRID = [
  '@media (min-width:769px){.pd-scope{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible!important;scroll-snap-type:none!important}.pd-scope-nav{display:none!important}}',
  '@media (min-width:1025px){.pd-scope{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '@media (max-width:768px){.pd-scope-cta{display:none!important}}',
];

const TITLES = [
  'Куратор со степенью по вашей специальности',
  'Оформление под требования вашего диссовета',
  'Научная экспертиза текста и языковая поддержка',
  'Работа разбита на этапы с приёмкой',
  'Две роли: менеджер и куратор',
  'Ход работы виден в личном кабинете',
];

/** Текст без тегов; неразрывный пробел — тоже пробел (`\s` его ловит). */
const plain = (s: string) => s.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();

/** Раздел посадочной по тексту заголовка h2: от `<section` до `</section>`. */
export function sectionBy(html: string, title: string): string {
  const want = title.replace(/\s+/gu, ' ');
  const head = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gu)].find((m) => plain(m[1]) === want);
  assert.ok(head?.index !== undefined, `нет раздела «${title}»`);
  const at = html.lastIndexOf('<section', head.index);
  return html.slice(at, html.indexOf('</section>', head.index));
}

describe('посадочная: «Что входит в сопровождение» — сетка от 769 px и кнопка под ней (Р-991)', () => {
  const html = read('design', 'StartPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'StartPage.tsx');
  const scopeOf = () => sectionBy(html, 'Что входит в сопровождение');

  it('правила сетки 3 × 2 / 2 × 3 стоят в макете и в компоненте', () => {
    for (const rule of SCOPE_GRID) {
      assert.ok(html.includes(rule), `в макете нет правила: ${rule}`);
      assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
    }
  });

  it('лента, ряд стрелок и кнопка помечены классами; промежуток карточек 16 px', () => {
    const scope = scopeOf();
    assert.match(scope, /<div data-carousel="scope" class="pd-scope" tabindex="\{\{ scopeTab \}\}" role="group" aria-label="\{\{ scopeLabel \}\}"[^>]*style="display:flex;gap:16px;/u);
    assert.match(scope, /<div class="pd-scope-nav"[^>]*>[\s\S]*aria-label="Предыдущие карточки"[\s\S]*aria-label="Следующие карточки"/u, 'стрелки и полоса прогресса — не в .pd-scope-nav');
    assert.match(tsx, /className="pd-scope"/u);
    assert.match(tsx, /className="pd-scope-nav"/u);
  });

  it('в сетке у ленты нет остановки Tab и подписи «прокрутите стрелками»', () => {
    assert.match(html, /this\.scopeGrid = window\.matchMedia\('\(min-width:769px\)'\)/u);
    assert.match(html, /scopeTab: this\.state\.scopeWide \? undefined : 0,/u);
    assert.match(html, /scopeLabel: this\.state\.scopeWide \? 'Что входит в\u00a0сопровождение' : 'Что входит в\u00a0сопровождение — прокрутите стрелками',/u);
  });

  it('шесть карточек с прежними заголовками', () => {
    const scope = scopeOf();
    const titles = [...scope.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gu)].map((m) => plain(m[1]));
    assert.deepEqual(titles, TITLES);
  });

  it('под сеткой — кнопка раздела «Оставить заявку» к форме заявки (исполнение Р-960)', () => {
    const scope = scopeOf();
    const at = scope.indexOf('<div class="pd-scope-cta"');
    assert.ok(at > scope.indexOf('class="pd-scope-nav"'), 'кнопки под лентой нет или она выше ряда стрелок');
    const cta = scope.slice(at, scope.indexOf('</a>', at) + 4);
    assert.match(cta, /<a href="#request" style="display:inline-flex;align-items:center;gap:12px;background:var\(--pd-ink\);color:var\(--pd-ink-inverse\);[^"]*font-size:15px;font-weight:600;padding:14px 32px;border-radius:999px;/u);
    assert.doesNotMatch(cta, /min-height/u, 'у кнопки раздела нет min-height (Р-960)');
    assert.match(cta, /mask:url\('\.\/assets\/icons\/arrow-right\.svg'\)/u, 'нет стрелки');
    assert.equal(plain(cta), 'Оставить заявку');
    assert.ok(html.includes('<section id="request"'), 'нет формы заявки, к которой ведёт кнопка');
  });

  it('проба: прежняя лента без классов не проходит', () => {
    const old = '<section><h2>Что входит в сопровождение</h2><div data-carousel="scope" tabindex="0" role="group" aria-label="Что входит в сопровождение — прокрутите стрелками" style="display:flex;gap:16px;"></div></section>';
    assert.doesNotMatch(sectionBy(old, 'Что входит в сопровождение'), /class="pd-scope"/u);
  });
});
