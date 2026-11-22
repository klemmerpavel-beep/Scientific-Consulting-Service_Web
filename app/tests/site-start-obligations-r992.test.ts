/**
 * Посадочная, «Обязательства и документы» — одна карточка-список вместо ленты
 * (Р-992, указание владельца 22.11.2026, С-8.3; ответ на квиз 20.11.2026 —
 * «Карточка-список»; разбор 20.11.2026, П-2).
 *
 * Шесть пунктов одной белой карточкой (DESIGN-SYSTEM §7, «Карточка-список»):
 * от 769 px две колонки, до 768 px — одна; между пунктами линия
 * `--pd-border`, кромок снизу нет. Лента, её стрелки и полоса прогресса
 * сняты — с ними ушли доступные имена ленты (Р-957). Метки, заголовки и
 * тексты пунктов прежние. Проверка — по макету и перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();

/** Раздел посадочной по тексту заголовка h2 (неразрывный пробел — тоже пробел). */
function sectionBy(html: string, title: string): string {
  const head = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gu)].find((m) => plain(m[1]) === title);
  assert.ok(head?.index !== undefined, `нет раздела «${title}»`);
  return html.slice(html.lastIndexOf('<section', head.index), html.indexOf('</section>', head.index));
}

export const OBL_RULES = [
  '.pd-obl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px}',
  '.pd-obl>li+li+li{border-top:1px solid var(--pd-border)}',
  '@media (max-width:768px){.pd-obl{grid-template-columns:minmax(0,1fr)}.pd-obl>li+li{border-top:1px solid var(--pd-border)}}',
];

const ITEMS: Array<[string, string, string]> = [
  ['pd-contract', 'Договор об оказании услуг', 'Объём, сроки и порядок приёмки зафиксированы письменно'],
  ['pd-refund', 'Возврат по заявлению', 'Этап не сдан в срок — оплата за него возвращается'],
  ['pd-nda', 'Соглашение о неразглашении', 'Материалы не выходят за пределы проектной команды'],
  ['pd-estimate', 'Смета', 'Смета считается после разбора материала'],
  ['pd-stagepay', 'Оплата по этапам', 'Следующий этап оплачивается после приёмки предыдущего'],
  ['pd-revision', 'Регламент правок', 'Правки в рамках этапа входят в стоимость'],
];

describe('посадочная: «Обязательства и документы» — карточка-список (Р-992)', () => {
  const html = read('design', 'StartPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'StartPage.tsx');
  const obl = () => sectionBy(html, 'Обязательства и документы');

  it('правила двух колонок и линий стоят в макете и в компоненте', () => {
    for (const rule of OBL_RULES) {
      assert.ok(html.includes(rule), `в макете нет правила: ${rule}`);
      assert.ok(tsx.includes(rule), `в компоненте нет правила: ${rule}`);
    }
  });

  it('одна белая карточка: рамка --pd-border, радиус 14, тень уровня 2, поля 4 × 24 px', () => {
    const list = obl().match(/<ul class="pd-obl" style="([^"]*)">/u);
    assert.ok(list, 'нет списка ul.pd-obl');
    for (const part of ['list-style:none', 'padding:4px 24px', 'background:var(--pd-ink-inverse)', 'border:1px solid var(--pd-border)', 'border-radius:14px', 'box-shadow:0 6px 14px rgba(20,22,28,.06),0 1px 2px rgba(20,22,28,.05)']) {
      assert.ok(list[1].includes(part), `у карточки нет «${part}»`);
    }
    assert.match(tsx, /<ul className="pd-obl"/u);
  });

  it('шесть пунктов с прежними значками, метками и заголовками', () => {
    const items = [...obl().matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)].map((m) => {
      const icon = /assets\/icons\/([\w-]+)\.svg/u.exec(m[1])?.[1] ?? '';
      const label = plain(/<span style="font-family:'Inter'[^"]*text-transform:uppercase;color:var\(--pd-accent\)">([\s\S]*?)<\/span>/u.exec(m[1])?.[1] ?? '');
      const title = plain(/<h3\b[^>]*>([\s\S]*?)<\/h3>/u.exec(m[1])?.[1] ?? '');
      return [icon, label, title];
    });
    assert.deepEqual(items, ITEMS);
  });

  it('ленты, стрелок, полосы и кромок снизу нет', () => {
    const section = obl();
    assert.doesNotMatch(section, /data-carousel|aria-label="Предыдущие|aria-label="Следующие|scaleX|<article/u);
    assert.doesNotMatch(section, /inset 0 -3px 0/u, 'кромка снизу у пунктов осталась');
    assert.doesNotMatch(html, /grtScale|prevGrt|nextGrt|onGrtScroll|grtFill/u, 'логика ленты осталась в макете');
  });

  it('проба: прежняя лента не проходит', () => {
    const old = '<section><h2>Обязательства и документы</h2><div data-carousel="grt" tabindex="0" role="group" aria-label="Обязательства и документы — прокрутите стрелками"><article class="pd-card" style="box-shadow:inset 0 -3px 0 var(--pd-accent)"></article></div></section>';
    assert.doesNotMatch(sectionBy(old, 'Обязательства и документы'), /<ul class="pd-obl"/u);
  });
});
