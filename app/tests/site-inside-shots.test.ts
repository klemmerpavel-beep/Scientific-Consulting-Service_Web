/**
 * «Как это выглядит внутри» и «Как устроен кабинет куратора» (Р-881): снимки
 * всех вкладок лежат в разметке стопкой в одной области, виден снимок выбранной
 * вкладки, остальные прозрачны и скрыты от читалки. Прежде у единственного
 * <img> менялся src, и на медленной сети браузер показывал снимок прежней
 * вкладки, пока не загрузится новый (вкладка «Переписка с менеджером» — со
 * снимком «Согласование этапа»). Проверка по исходникам: разметка макета и
 * перенесённого компонента и данные, которые получает шаблон при каждой
 * вкладке, — значения считаются тем же кодом, что в макете.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

const PAGES = [
  { page: 'StartPage', component: 'StartPage', list: 'inShots', data: 'IN_TABS', state: 'inTab', count: 4 },
  { page: 'MainPage', component: 'PostgradPage', list: 'inShots', data: 'IN_TABS', state: 'inTab', count: 4 },
  { page: 'StudentsPage', component: 'StudentsPage', list: 'inShots', data: 'IN_TABS', state: 'inTab', count: 4 },
  { page: 'BusinessPage', component: 'BusinessPage', list: 'inShots', data: 'IN_TABS', state: 'inTab', count: 4 },
  { page: 'ExpertsPage', component: 'ExpertsPage', list: 'tabShots', data: 'TABS', state: 'tab', count: 5 },
] as const;

/** Раздел #inside — от открывающего тега до его конца. */
const inside = (source: string) => {
  const at = source.search(/<section (?:className="[^"]*" )?id="inside"/u);
  assert.ok(at >= 0, 'нет раздела #inside');
  return source.slice(at, source.indexOf('</section>', at));
};

interface Shot { src: string; alt: string; hidden: string | undefined; op: string; loading: string | undefined }
interface Tab { img: string; alt: string }

/** Данные вкладок и значения стопки снимков — тем же кодом, что в макете. */
function shotsFor(source: string, p: (typeof PAGES)[number]): (active: number) => { tabs: Tab[]; shots: Shot[] } {
  const head = `const ${p.data} = [`;
  const at = source.indexOf(head);
  assert.ok(at > 0, `нет данных ${p.data}`);
  const literal = source.slice(at + head.length - 1, source.indexOf('\n    ];', at) + '\n    ]'.length);
  const tabs = new Function(`return ${literal};`)() as Tab[];
  const m = source.match(new RegExp(`${p.list}: ${p.data}\\.map\\(\\(t, i\\) => \\{([\\s\\S]*?)\\n      \\}\\),`, 'u'));
  assert.ok(m, `нет значения ${p.list}`);
  const each = new Function('t', 'i', m[1]!) as (this: unknown, t: Tab, i: number) => Shot;
  return (active) => ({ tabs, shots: tabs.map((t, i) => each.call({ state: { [p.state]: active } }, t, i)) });
}

describe('Снимки вкладок кабинета — стопкой, виден снимок выбранной вкладки (Р-881)', () => {
  for (const p of PAGES) {
    const design = read('design', `${p.page}.dc.html`);
    const tsx = read('app', 'src', 'components', 'pages', `${p.component}.tsx`);

    it(`${p.page}: в разделе один шаблон снимка — цикл по ${p.list} в одной области сетки, смена прозрачностью 220 мс`, () => {
      const html = inside(design);
      const imgs = html.match(/<img [^>]*>/gu) ?? [];
      assert.equal(imgs.length, 1, 'в разделе не один шаблон снимка');
      assert.match(html, new RegExp(`<div class="pd-in-shots" style="display:grid;[^"]*">\\n<sc-for list="\\{\\{ ${p.list} \\}\\}" as="shot" hint-placeholder-count="${p.count}">\\n<img `, 'u'), 'снимки не стопкой в одной сетке');
      const img = imgs[0]!;
      assert.match(img, /^<img src="\{\{ shot\.src \}\}" alt="\{\{ shot\.alt \}\}" aria-hidden="\{\{ shot\.hidden \}\}" width="1440" height="900" loading="\{\{ shot\.loading \}\}"/u);
      assert.match(img, /grid-area:1\/1;/u, 'снимки не в одной области');
      assert.match(img, /opacity:\{\{ shot\.op \}\};transition:opacity 220ms cubic-bezier\(\.2,0,\.2,1\)/u, 'смена снимка не прозрачностью 220 мс');
      assert.doesNotMatch(design, /\b(?:inImg|inAlt|tabImg|tabAlt)\b/u, 'остался единственный снимок со сменой src');
      // Без движения при уменьшенном движении: общее правило страницы снимает переходы.
      assert.ok(design.includes('@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'));
      // Перенесённый компонент — тот же цикл.
      const jsx = inside(tsx);
      assert.match(jsx, new RegExp(`\\(${p.list} \\?\\? \\[\\]\\)\\.map\\(\\(shot: any, \\w+: number\\) => \\(<React\\.Fragment key=\\{\\w+\\}><img src=\\{shot\\.src\\} alt=\\{shot\\.alt\\} aria-hidden=\\{shot\\.hidden\\}`, 'u'), 'в компоненте не цикл снимков');
      assert.equal((jsx.match(/<img /gu) ?? []).length, 1, 'в компоненте не один шаблон снимка');
    });

    it(`${p.page}: при каждой вкладке виден ровно один снимок — с подписью этой вкладки; первый грузится сразу`, () => {
      const at = shotsFor(design, p);
      const { tabs } = at(0);
      assert.equal(tabs.length, p.count);
      for (let active = 0; active < tabs.length; active++) {
        const { shots } = at(active);
        assert.deepEqual(shots.map((s) => s.src), tabs.map((t) => t.img), 'в стопке не все снимки или не в порядке вкладок');
        const shown = shots.filter((s) => s.op === '1');
        assert.equal(shown.length, 1, `вкладка ${active}: видно снимков — ${shown.length}`);
        assert.equal(shown[0]!.src, tabs[active]!.img, `вкладка ${active}: виден чужой снимок`);
        assert.equal(shown[0]!.alt, tabs[active]!.alt, `вкладка ${active}: подпись не этой вкладки`);
        assert.equal(shown[0]!.hidden, undefined, `вкладка ${active}: видимый снимок скрыт от читалки`);
        for (const s of shots.filter((x) => x !== shown[0])) {
          assert.deepEqual([s.op, s.alt, s.hidden], ['0', '', 'true'], `вкладка ${active}: скрытый снимок ${s.src} виден или читается`);
        }
        assert.deepEqual(shots.map((s) => s.loading), tabs.map((_, i) => (i === 0 ? undefined : 'lazy')), 'первый снимок — не сразу, остальные — не отложенно');
      }
    });
  }
});

/** Размер изображения WebP по заголовку: VP8 (с потерями), VP8L и VP8X. */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', `${file}: не WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: неизвестный блок ${chunk}`);
}

describe('Снимки кабинета клиента и куратора (Р-883): одинаковы в обеих папках, 1440 × 900, подписи по экранам', () => {
  for (const p of PAGES) {
    it(`${p.page}: каждый снимок вкладки — в обеих папках ассетов, размер как в разметке`, () => {
      const { tabs } = shotsFor(read('design', `${p.page}.dc.html`), p)(0);
      for (const t of tabs) {
        const name = t.img.replace(/^\.\/assets\/art\//u, '');
        const files = [path.join(ROOT, 'design', 'assets', 'art', name), path.join(ROOT, 'app', 'public', 'assets', 'art', name)];
        assert.ok(readFileSync(files[0]!).equals(readFileSync(files[1]!)), `${name} в папках ассетов различается`);
        assert.deepEqual(webpSize(files[0]!), { width: 1440, height: 900 }, `${name}: не 1440 × 900`);
        assert.match(t.alt, /(?:Данные вымышленные|Суммы на снимке размыты)\.$/u, `${name}: подпись без оговорки о данных`);
      }
    });
  }

  it('«Экспертам», «Назначенные работы»: поиск — по названию работы или клиенту, как в поле кабинета', () => {
    const html = read('design', 'ExpertsPage.dc.html');
    assert.ok(html.includes("'Поиск по названию работы или клиенту'"));
    assert.ok(!html.includes("'Поиск по названию работы']"));
  });
});
