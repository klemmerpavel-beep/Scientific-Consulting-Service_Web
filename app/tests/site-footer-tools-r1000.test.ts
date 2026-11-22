/**
 * Вход на «Инструменты» из подвала пяти содержательных страниц (Р-1000,
 * указание владельца 22.11.2026, С-9.2; разбор 20.11.2026, В-7, вариант 1).
 *
 * - В строке ссылок подвала `/`, `/main`, `/students`, `/business`,
 *   `/experts` первой стоит «Оформить список литературы по ГОСТ» →
 *   `/tools`, в исполнении соседних ссылок подвала (тот же `style` и
 *   `style-hover`, что у «Публичной оферты»). Шапки не меняются.
 * - На самой «Инструментах» подвал сайтовый (Р-995), ссылки на себя в нём нет.
 * - В строках подвала предлоги в одну-две буквы связаны со следующим словом
 *   неразрывным пробелом (Р-86): «в Telegram», «в рабочее время», «по всей
 *   России», «по ГОСТ»; с приёмки 22.11.2026 — и на «Инструментах», тексты
 *   подвалов шести страниц совпадают.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [
  ['StartPage', 'StartPage'], ['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage'],
] as const;
const LABEL = 'Оформить список литературы по ГОСТ';
/** Обычный пробел после предлога или союза в одну-две буквы. */
const LOOSE_IN_FOOTER = /(?<![\p{L}\d])(?:в|во|на|по|к|с|со|и|о|об|у|а|за|из|от|до)[ \t][\p{L}\d]/giu;

/** Подвал макета или компонента: от `<footer` до `</footer>`. */
export function footer(src: string): string {
  const at = src.indexOf('<footer');
  assert.ok(at >= 0, 'нет подвала');
  return src.slice(at, src.indexOf('</footer>', at));
}

/** Ссылки строки ссылок подвала (span с правовыми ссылками): [href, атрибуты, текст]. */
export function linkRow(foot: string): Array<[string, string, string]> {
  const row = foot.match(/<span style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;min-width:0">([\s\S]*?)<\/span>/u);
  assert.ok(row, 'нет строки ссылок подвала');
  return [...row[1].matchAll(/<a href="([^"]+)"([^>]*)>([^<]*)<\/a>/gu)].map((m) => [m[1], m[2], m[3]]);
}

describe('вход на «Инструменты» из подвала (Р-1000)', () => {
  for (const [page, component] of PAGES) {
    const foot = footer(read('design', `${page}.dc.html`));

    it(`${page}: первая ссылка строки подвала — «${LABEL.replace(' ', ' ')}» → ./tools.html`, () => {
      const links = linkRow(foot);
      assert.deepEqual(links.map(([href, , text]) => [href, text]), [
        ['./tools.html', LABEL],
        ['./offer.html', 'Публичная оферта'],
        ['./privacy.html', 'Политика конфиденциальности'],
        ['./consent.html', 'Обработка персональных данных'],
        ['./privacy.html#cookies', 'Настройки cookies'],
      ]);
      const [tool, offer] = links;
      assert.equal(tool[1], offer[1], 'ссылка на «Инструменты» оформлена не как соседние ссылки подвала');
      assert.equal((foot.match(/href="\.\/tools\.html"/gu) ?? []).length, 1, 'ссылка на «Инструменты» в подвале — одна');
    });

    it(`${page}: в компоненте подвал ведёт на /tools`, () => {
      const tsx = footer(read('app', 'src', 'components', 'pages', `${component}.tsx`));
      assert.match(tsx, new RegExp(`<a className="[^"]+" href="/tools" style=\\{\\{[^}]*\\}\\}>${LABEL}</a><a className="[^"]+" href="/offer"`, 'u'));
    });

    it(`${page}: предлоги в строках подвала не отрываются от слова`, () => {
      const text = foot.replace(/<[^>]+>/gu, '\n');
      const loose = text.match(LOOSE_IN_FOOTER);
      assert.equal(loose, null, `обычный пробел после предлога: ${loose?.join(', ')}`);
      for (const part of ['в Telegram', 'в рабочее время', 'по всей России']) {
        assert.ok(text.includes(part), `нет «${part.replace(' ', '⍽')}»`);
      }
    });
  }

  it('«Инструменты»: в подвале нет ссылки на саму страницу', () => {
    const foot = footer(read('design', 'ToolsPage.dc.html'));
    assert.doesNotMatch(foot, /href="\.\/tools\.html"/u);
    assert.doesNotMatch(footer(read('app', 'src', 'components', 'pages', 'ToolsPage.tsx')), /href="\/tools"/u);
  });

  // Доработка после приёмки 22.11.2026: подвал «Инструментов» набран так же —
  // предлоги в его строках тоже связаны неразрывным пробелом.
  it('«Инструменты»: предлоги в строках подвала не отрываются от слова', () => {
    const text = footer(read('design', 'ToolsPage.dc.html')).replace(/<[^>]+>/gu, '\n');
    const loose = text.match(LOOSE_IN_FOOTER);
    assert.equal(loose, null, `обычный пробел после предлога: ${loose?.join(', ')}`);
  });

  it('тексты подвалов шести страниц совпадают (кроме ссылки на «Инструменты»)', () => {
    const words = (page: string) => footer(read('design', `${page}.dc.html`)).replace(/<[^>]+>/gu, '\n')
      .split('\n').map((t) => t.trim()).filter((t) => t && t !== LABEL);
    const tools = words('ToolsPage');
    for (const [page] of PAGES) assert.deepEqual(words(page), tools, `${page}: текст подвала расходится с «Инструментами»`);
  });

  it('проба: ссылка с другим оформлением не проходит', () => {
    const probe = '<footer><span style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;min-width:0">\n<a href="./tools.html" style="font-size:13px">x</a>\n<a href="./offer.html" style="font-size:14px">y</a>\n</span></footer>';
    const [tool, offer] = linkRow(footer(probe));
    assert.notEqual(tool[1], offer[1]);
  });
});
