/**
 * Посадочная: метки над заголовками разделов и одна кромка у трёх
 * направлений (Р-993, указание владельца 22.11.2026, С-8.4; разбор
 * 20.11.2026, П-3 и П-4).
 *
 * Над h2 каждого раздела — короткая метка, как «Личный кабинет» над «Как это
 * выглядит внутри»: Inter 12 px, `.06em`, верхний регистр, `--pd-ink-muted`
 * (Р-482). У карточки «Наука для бизнеса» кромка `--pd-accent`, как у двух
 * других направлений. Проверка — по макету и перенесённому компоненту.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const plain = (s: string) => s.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();

const LABEL_STYLE = /^(?:margin-bottom:2px;)?font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1\.4;letter-spacing:\.06em;text-transform:uppercase;color:var\(--pd-ink-muted\)$/u;

/** Пары «метка → h2» в `<main>` макета: текст ближайшего `span` перед каждым h2 и его стиль. */
export function labelsBeforeH2(html: string): Array<[string, string, string]> {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return [...main.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gu)].map((m) => {
    const before = main.slice(0, m.index).replace(/<div style="display:flex;flex-direction:column;gap:10px">\s*$/u, '').trimEnd();
    const label = /<span style="([^"]*)">([^<]*)<\/span>$/u.exec(before);
    return [plain(m[1]), label ? plain(label[2]) : '', label ? label[1] : ''];
  });
}

describe('посадочная: метки над заголовками разделов и кромки направлений (Р-993)', () => {
  const html = read('design', 'StartPage.dc.html');
  const tsx = read('app', 'src', 'components', 'pages', 'StartPage.tsx');

  it('у каждого раздела, кроме формы первого экрана, метка прямо над h2', () => {
    const pairs = labelsBeforeH2(html).filter(([title]) => title !== 'Записаться на первичную консультацию');
    assert.deepEqual(pairs.map(([title, label]) => [title, label]), [
      ['Три направления работы', 'Для кого'],
      ['Как это выглядит внутри', 'Личный кабинет'],
      ['Что входит в сопровождение', 'Услуги'],
      ['Обязательства и документы', 'Договор'],
      ['Оставьте заявку', 'Заявка'],
    ]);
    for (const [title, , style] of pairs) assert.match(style, LABEL_STYLE, `метка над «${title}» не по образцу`);
  });

  it('метки перенесены в компонент', () => {
    for (const label of ['Для кого', 'Услуги', 'Договор', 'Заявка']) {
      assert.match(tsx, new RegExp(`textTransform: "uppercase", color: "var\\(--pd-ink-muted\\)" \\}\\}>${label}</span>`, 'u'), `в компоненте нет метки «${label}»`);
    }
  });

  it('у трёх карточек направлений кромка --pd-accent', () => {
    const cards = [...html.matchAll(/<a class="pd-lift" href="\.\/(main|students|business)\.html" style="([^"]*)"/gu)];
    assert.equal(cards.length, 3);
    for (const [, page, style] of cards) assert.match(style, /box-shadow:inset 0 -3px 0 var\(--pd-accent\),/u, `кромка карточки ${page} не акцентом`);
    assert.doesNotMatch(tsx, /inset 0 -3px 0 var\(--pd-edge-neutral\)/u);
  });

  it('проба: h2 без метки не проходит', () => {
    const [[, label]] = labelsBeforeH2('<main><section><h2 style="x">Три направления работы</h2></section></main>');
    assert.equal(label, '');
  });
});
