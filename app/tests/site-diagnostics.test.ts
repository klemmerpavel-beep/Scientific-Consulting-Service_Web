/**
 * Сайт (Р-809, замечание владельца З-1 от 05.11.2026): раздел «Диагностика»
 * на «Аспирантам» — инфографика небольшого объёма вместо перечня с абзацами
 * и четырёх свойств: «где работа останавливается → итог разбора» (Р-836).
 * Р-889 (замечание владельца 14.11.2026: «по высоте зафиксировать, доработать
 * функционал блока, сделать его интерактивным и добавить элементы
 * интерактивные и объёмные картинки»): четыре точки остановки — вкладки
 * WAI-ARIA, справа панель выбранной точки — объёмное изображение, что делает
 * куратор, что вы получите (один из трёх итогов разбора) и переход к разделу
 * страницы; «Итог разбора» — строкой из трёх плашек. Высота карточки не
 * меняется при переключении: панели всех точек стоят стопкой в одной ячейке.
 * Одна кнопка действия — к прежней форме `#request` (Р-791, Р-96); тёмной
 * панели и градиентов нет (Р-51, Р-608). Проверка по макету — источнику
 * правды — и по перенесённому компоненту, который уходит в сеть.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const MAIN = read('design', 'MainPage.dc.html');
const TSX = read('app', 'src', 'components', 'pages', 'PostgradPage.tsx');
const NB = / /gu;

/** Раздел «Диагностика»: от `<section` перед меткой до его `</section>`. */
function diagnostics(html: string, mark: string): string {
  const at = html.indexOf(mark);
  assert.ok(at > 0, 'нет раздела «Диагностика»');
  const start = html.lastIndexOf('<section', at);
  return html.slice(start, html.indexOf('</section>', at));
}
const SECTION = diagnostics(MAIN, '>Диагностика</span>');
/** Видимый текст шаблона раздела: без комментариев, тегов и выражений {{ }}. */
const templateText = SECTION.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, ' ').replace(/\{\{[^}]*\}\}/gu, ' ').replace(NB, ' ').replace(/\s+/gu, ' ').trim();
/** Строки массива данных логики `const name = [ … ]` — кортежами строк (до `].map` или `];`). */
function rows(name: string, source = MAIN): string[][] {
  const at = source.indexOf(`const ${name} = [`);
  assert.ok(at > 0, `нет данных ${name}`);
  const ends = [source.indexOf('].map', at), source.indexOf('];', at)].filter((i) => i > 0);
  const body = source.slice(at, Math.min(...ends));
  return [...body.matchAll(/^\s*\[('[^\n]*')\],?$/gmu)].map((m) => [...m[1]!.matchAll(/'([^']*)'/gu)].map((s) => s[1]!.replace(NB, ' ')));
}
/** Простой массив чисел или строк логики: `const name = [a, b];`. */
function list(name: string, source = MAIN): string[] {
  const m = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\];`, 'u'));
  assert.ok(m, `нет массива ${name}`);
  return [...m[1]!.matchAll(/'([^']*)'|(-?\d+)/gu)].map((x) => x[1] ?? x[2]!);
}
/** Таблица стилей источника без комментариев: <style> макета или шаблонные строки компонента. */
const css = (source: string) => [...source.matchAll(/<style>([\s\S]*?)<\/style>|`([\s\S]*?)`/gu)].map((m) => m[1] ?? m[2] ?? '').join('\n').replace(/\/\*[\s\S]*?\*\//gu, '');
const SOURCES = [['макет', MAIN], ['компонент', TSX]] as const;

describe('Р-809: «Диагностика» на «Аспирантам» — инфографика', () => {
  const stalls = rows('stalls');
  const outcomes = rows('outcomes');

  it('четыре главные точки остановки (Р-836), у каждой — что делает разбор, короткими метками без абзацев', () => {
    assert.equal(stalls.length, 4, 'точек остановки не четыре');
    for (const [title, fix, extra] of stalls) {
      assert.equal(extra, undefined, `у точки «${title}» больше двух полей — абзац вернулся`);
      assert.ok(title && title.length <= 46, `точка остановки длиннее метки: «${title}»`);
      assert.ok(fix && fix.length <= 40, `«что делает разбор» длиннее метки: «${fix}»`);
      assert.doesNotMatch(`${title} ${fix}`, /[.!?]$|[.!?] /u, `в метке предложение или восклицание: «${title} → ${fix}»`);
    }
    const volume = stalls.flat().join('').length;
    assert.ok(volume <= 380, `метки разрослись: ${volume} знаков (было 690 у перечня с абзацами)`);
    // Р-889: точка — во вкладке, метка разбора — первым предложением её панели.
    assert.match(SECTION, /\{\{ p\.title \}\}[\s\S]*\{\{ d\.fix \}\}/u, 'у точки остановки нет метки разбора в панели');
    assert.doesNotMatch(SECTION, /\{\{ p\.text \}\}/u, 'в строке точки снова абзац');
    for (const label of ['Где работа обычно останавливается', 'Итог разбора']) {
      assert.ok(templateText.includes(label), `нет метки «${label}»`);
    }
  });

  it('«Итог разбора» — три результата со значками из набора вместо четырёх свойств', () => {
    assert.equal(outcomes.length, 3, 'результатов разбора не три');
    for (const [icon, title, text] of outcomes) {
      assert.ok(existsSync(path.join(ROOT, 'design', 'assets', 'icons', `${icon}.svg`)), `нет значка ${icon}`);
      assert.ok(title && text && text.length <= 40, `результат «${title}» — не короткая метка`);
    }
    for (const old of ['const gains = [', 'pd-gains', 'pd-solve', 'pd-problem', '{{ g.']) {
      assert.ok(!MAIN.includes(old), `осталось прежнее «${old}»`);
    }
  });

  it('одна кнопка действия — к прежней форме #request; кроме неё — переход панели к разделу этой же страницы (Р-889); полей нет', () => {
    const links = SECTION.match(/<a\b[^>]*>/gu) ?? [];
    assert.deepEqual(links.map((a) => a.match(/href="([^"]*)"/u)?.[1]), ['{{ d.href }}', '#request'], `ссылки раздела: ${links.join(' ')}`);
    assert.ok(templateText.includes('Разобрать, где остановилась ваша работа'));
    assert.doesNotMatch(SECTION, /<(?:form|input|select|textarea)\b/u, 'в разделе появилась форма');
    const hrefs = rows('diagMore').map((r) => r[1]!);
    assert.equal(hrefs.length, 4, 'не у каждой точки свой переход');
    assert.equal(new Set(hrefs).size, 4, 'переходы панелей повторяются');
    for (const href of hrefs) {
      assert.match(href, /^#[a-z-]+$/u, `переход «${href}» — не якорь этой страницы`);
      assert.notEqual(href, '#request', 'переход панели дублирует кнопку заявки');
      assert.match(MAIN, new RegExp(`\\bid="${href.slice(1)}"`, 'u'), `на странице нет раздела ${href}`);
    }
  });

  it('без тёмной панели и градиентов', () => {
    assert.doesNotMatch(SECTION, /--pd-accent-deep|gradient/u);
  });

  it('шкалы плана «Как это выглядит у вас» нет (Р-836)', () => {
    for (const [where, source] of SOURCES) {
      const code = source.replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//gu, '');
      assert.doesNotMatch(code, /pd-plan-|trackAt|planLine|Как это выглядит у вас/u, `${where}: осталась шкала плана`);
    }
  });

  it('объём: метки прежние, панель точки — одно предложение и переход', () => {
    // Р-889 добавил к каждой точке одно предложение «что делает куратор» и
    // подпись перехода; на экране одновременно видна одна панель из четырёх.
    const more = rows('diagMore');
    for (const [text, , link] of more) {
      assert.ok(text && text.length <= 100, `предложение панели длиннее 100 знаков: «${text}»`);
      assert.ok(link && link.length <= 32, `подпись перехода длиннее 32 знаков: «${link}»`);
    }
    const data = [...stalls, ...outcomes.map(([, title, text]) => [title!, text!]), ...more.map(([text, , link]) => [text!, link!])].flat().join(' ');
    const volume = `${templateText} ${data}`.length;
    assert.ok(volume <= 1150, `видимый текст раздела в макете — ${volume} знаков (Р-889: 1109; до Р-809 — 1432 без панелей)`);
  });

  it('тексты без запрещённых слов, цен и чисел; перенос в компонент сохранил метки', () => {
    const more = rows('diagMore');
    const all = [templateText, ...stalls.flat(), ...outcomes.map(([, t, x]) => `${t} ${x}`), ...more.map(([t, , l]) => `${t} ${l}`)].join('\n');
    assert.deepEqual(findForbidden(all, 'Диагностика'), []);
    assert.doesNotMatch(all, /не [а-яё]+, а |под ключ|гаранти|написани|вычитк|редактир|!|₽|руб\.|\d/iu);
    const tsx = TSX.replace(NB, ' ');
    for (const [title, fix] of stalls) {
      assert.ok(tsx.includes(`'${title}', '${fix}'`), `в компоненте нет строки «${title} → ${fix}»`);
    }
    for (const [text] of more) assert.ok(tsx.includes(`'${text}'`), `в компоненте нет предложения «${text}»`);
  });
});

describe('Р-889: «Диагностика» — вкладки, панель выбранной точки, высота зафиксирована', () => {
  const left = SECTION.slice(SECTION.indexOf('<div class="pd-flow-in"'), SECTION.indexOf('<div class="pd-flow-out"'));
  const right = SECTION.slice(SECTION.indexOf('<div class="pd-flow-out"'), SECTION.indexOf('<!-- Р-791'));

  it('точки остановки — вкладки WAI-ARIA: tablist с подписью, у вкладки id, aria-selected, aria-controls, tabindex и выбор щелчком; первая выбрана', () => {
    assert.ok(left.length > 0 && right.length > 0, 'нет двух панелей карточки');
    const tablist = left.match(/<div role="tablist"[^>]*>/u)?.[0] ?? '';
    assert.match(tablist, /aria-labelledby="pd-diag-label"/u, 'у списка вкладок нет подписи');
    assert.match(left, /<span id="pd-diag-label"[^>]*>Где работа обычно останавливается<\/span>/u);
    assert.match(tablist, /aria-orientation="vertical"/u);
    assert.match(tablist, /onKeyDown="\{\{ diagKey \}\}"/u, 'нет обхода вкладок клавишами');
    assert.match(left, /<sc-for list="\{\{ stalls \}\}" as="p"[^>]*>\s*<button type="button" role="tab" id="\{\{ p\.tabId \}\}" aria-selected="\{\{ p\.sel \}\}" aria-controls="\{\{ p\.panelId \}\}" tabindex="\{\{ p\.ti \}\}" onClick="\{\{ p\.pick \}\}"/u);
    for (const field of ["tabId: 'pd-diag-tab-' + i, panelId: 'pd-diag-panel-' + i", "sel: i === diagAt ? 'true' : 'false', ti: i === diagAt ? 0 : -1", 'pick: () => this.setState({ diagAt: i })']) {
      for (const [where, source] of SOURCES) assert.ok(source.includes(field), `${where}: нет «${field}»`);
    }
    for (const [where, source] of SOURCES) assert.match(source, /state = \{ diagAt: 0,/u, `${where}: первая точка не выбрана по умолчанию`);
  });

  it('стрелки, Home и End переводят выбор и фокус; автосмены и прокрутки страницы нет (Р-43)', () => {
    for (const [where, source] of SOURCES) {
      const at = source.indexOf('diagKey: e => {');
      assert.ok(at > 0, `${where}: нет обработчика diagKey`);
      const body = source.slice(at, source.indexOf('\n      },', at));
      for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(body.includes(`'${key}'`), `${where}: клавиша ${key} не обрабатывается`);
      assert.match(body, /e\.preventDefault\(\)/u);
      assert.match(body, /getElementById\('pd-diag-tab-' \+ i\)[\s\S]*\.focus\(\{ preventScroll: true \}\)/u, `${where}: фокус не переходит на выбранную вкладку`);
      assert.doesNotMatch(source, /diagAt[^\n]*(?:setInterval|setTimeout)|(?:setInterval|setTimeout)[^\n]*diagAt/u, `${where}: автосмена точек`);
      assert.doesNotMatch(body, /scrollIntoView|scrollTo/u, `${where}: выбор прокручивает страницу`);
    }
  });

  it('цели не меньше 44 px; номер выбранной вкладки — акцентом поверх К-9', () => {
    for (const [where, source] of SOURCES) {
      const styles = css(source);
      assert.match(styles, /\.pd-diag-tab\{[^}]*;height:56px;/u, `${where}: высота вкладки от 769 px — не 56 px`);
      assert.match(styles, /\.pd-diag-tab\{height:auto;min-height:48px;/u, `${where}: вкладка до 768 px ниже 48 px`);
      assert.match(styles, /\.pd-diag-tab\[aria-selected="true"\]\{background:var\(--pd-ink-inverse\);border-color:var\(--pd-accent-edge\)/u);
      assert.match(styles, /\.pd-diag-tab\[aria-selected="true"\]>span:first-child\{color:var\(--pd-accent\)!important\}/u);
    }
    assert.match(right, /<a class="pd-diag-link" href="\{\{ d\.href \}\}" style="display:inline-flex;align-items:center;gap:8px;min-height:44px;/u, 'переход панели ниже 44 px');
  });

  it('панели всех точек — стопкой в одной ячейке: высота карточки по самой высокой и при переключении не меняется', () => {
    assert.match(right, /<div class="pd-diag-panes">\s*<sc-for list="\{\{ diag \}\}" as="d"[^>]*>\s*<div role="tabpanel" id="\{\{ d\.panelId \}\}" aria-labelledby="\{\{ d\.tabId \}\}" class="pd-diag-pane" data-on="\{\{ d\.on \}\}">/u);
    // Скрытая панель не уходит из раскладки: ни display:none, ни hidden, ни sc-if.
    const panes = right.slice(right.indexOf('<div class="pd-diag-panes">'), right.indexOf('<ul class="pd-diag-sum"'));
    assert.doesNotMatch(panes, /<sc-if|\shidden(?:=|\s|>)|display:none/u, 'панель точки выключается из раскладки — высота прыгнет');
    for (const [where, source] of SOURCES) {
      const styles = css(source);
      assert.match(styles, /\.pd-diag-panes\{display:grid;/u, `${where}: панели не в сетке`);
      const pane = styles.match(/\.pd-diag-pane\{([^}]*)\}/u)?.[1] ?? '';
      assert.match(pane, /^grid-area:1\/1;/u, `${where}: панели не в одной ячейке`);
      assert.match(pane, /opacity:0;visibility:hidden;transform:translateY\(6px\)/u, `${where}: скрытая панель не прозрачна или видна читалке`);
      assert.doesNotMatch(pane, /display:none|position:absolute/u);
      const on = styles.match(/\.pd-diag-pane\[data-on="true"\]\{([^}]*)\}/u)?.[1] ?? '';
      assert.match(on, /opacity:1;visibility:visible;transform:none;transition:opacity (\d+)ms cubic-bezier\(\.2,0,\.2,1\),transform \1ms cubic-bezier\(\.2,0,\.2,1\)/u, `${where}: смена панели — не opacity и transform`);
      const ms = Number(on.match(/opacity (\d+)ms/u)?.[1]);
      assert.ok(ms >= 180 && ms <= 260, `${where}: переход панели ${ms} мс — вне 180—260`);
      assert.match(styles, /@media \(prefers-reduced-motion:reduce\)\{\.pd-diag-pane\{transform:none\}\}/u, `${where}: при уменьшенном движении панель сдвигается`);
    }
    for (const field of ['on: p.sel', 'const diag = stalls.map(']) assert.ok(MAIN.includes(field), `нет «${field}»`);
  });

  it('стрелка-узел указывает на выбранную строку: шаг сдвига = высота вкладки + промежуток; до 768 px — вниз на границе', () => {
    for (const [where, source] of SOURCES) {
      const styles = css(source);
      const h = Number(styles.match(/\.pd-diag-tab\{[^}]*;height:(\d+)px;/u)?.[1]);
      const gap = Number(styles.match(/\.pd-diag-tabs\{display:flex;flex-direction:column;gap:(\d+)px\}/u)?.[1]);
      assert.ok(h > 0 && gap > 0, `${where}: нет высоты вкладки или промежутка`);
      assert.match(source, new RegExp(`diagArrow: 'translateY\\(' \\+ diagAt \\* ${h + gap} \\+ 'px\\)'`, 'u'), `${where}: шаг стрелки не ${h}+${gap} px`);
      assert.match(styles, /\.pd-flow-arrow\{top:(\d+)px;right:-62px;transition:transform 220ms cubic-bezier\(\.2,0,\.2,1\)\}/u, `${where}: стрелка не на границе панелей`);
      assert.equal(Number(styles.match(/\.pd-flow-arrow\{top:(\d+)px;/u)?.[1]), h / 2 - 22, `${where}: стрелка не по центру первой строки`);
      assert.match(styles, /\.pd-flow-arrow\{top:auto;right:auto;left:50%;bottom:-18px;width:36px!important;height:36px!important;transform:translateX\(-50%\) rotate\(90deg\)!important;transition:none\}/u, `${where}: до 768 px стрелка не повёрнута вниз`);
    }
    assert.match(left, /<span class="pd-flow-arrow" aria-hidden="true" style="[^"]*transform:\{\{ diagArrow \}\}"/u);
  });

  it('панель точки: объёмное изображение 96—120 px, что делает куратор, что вы получите, переход', () => {
    const pane = right.slice(right.indexOf('<div role="tabpanel"'), right.indexOf('</sc-for>'));
    const img = pane.match(/<img src="\{\{ d\.img \}\}"[^>]*>/u)?.[0] ?? '';
    assert.match(img, /\balt=""/u, 'у изображения подпись — смысл несёт текст');
    assert.match(img, /aria-hidden="true"/u);
    const size = Number(img.match(/width="(\d+)"/u)?.[1]);
    assert.ok(size >= 96 && size <= 120, `изображение ${size} px — вне 96—120`);
    assert.match(img, new RegExp(`height="${size}"[\\s\\S]*width:${size}px;height:${size}px`, 'u'));
    assert.match(css(MAIN), /\.pd-diag-img\{width:96px!important;height:96px!important\}/u, 'на узкой панели изображение не 96 px');
    assert.match(pane, /Что делает куратор<\/span>\s*<p[^>]*><span[^>]*>\{\{ d\.fix \}\}\.<\/span> \{\{ d\.text \}\}<\/p>/u);
    assert.match(pane, /Что вы получите<\/span>[\s\S]*\{\{ d\.outMask \}\}[\s\S]*\{\{ d\.outTitle \}\}[\s\S]*\{\{ d\.outText \}\}/u);
    assert.match(pane, /<a class="pd-diag-link" href="\{\{ d\.href \}\}"[^>]*>\{\{ d\.link \}\}/u);
  });

  it('четыре разных изображения: файлы в обеих папках, без повтора «Шести шагов» и «Условий»', () => {
    const art = list('diagArt');
    assert.equal(art.length, 4, 'изображений не четыре');
    assert.equal(new Set(art).size, 4, 'изображение повторяется в панелях');
    const steps = list('stepImg');
    const terms = [...(MAIN.match(/const uspArt = \{([^}]*)\}/u)?.[1] ?? '').matchAll(/: '([a-z0-9-]+)'/gu)].map((m) => m[1]!);
    assert.equal(steps.length, 6);
    assert.equal(terms.length, 4);
    for (const name of art) {
      assert.match(name, /^(?:pd|ex)-3d-[a-z]+$/u);
      assert.ok(!steps.includes(name), `${name} уже стоит в «Шести шагах»`);
      assert.ok(!terms.includes(name), `${name} уже стоит в «Условиях»`);
      for (const dir of [['design', 'assets', 'art'], ['app', 'public', 'assets', 'art']]) {
        assert.ok(existsSync(path.join(ROOT, ...dir, `${name}.webp`)), `нет файла ${dir.join('/')}/${name}.webp`);
      }
    }
    assert.ok(TSX.includes(`const diagArt = [${art.map((a) => `'${a}'`).join(', ')}];`), 'компонент не перенесён');
  });

  it('«Что вы получите» — один из трёх итогов разбора; каждый итог отвечает хотя бы одной точке; плашка выбранного подсвечена', () => {
    const out = list('diagOut').map(Number);
    assert.equal(out.length, 4, 'не у каждой точки свой итог');
    for (const o of out) assert.ok(o >= 0 && o <= 2, `итог ${o} вне трёх результатов`);
    assert.deepEqual([...new Set(out)].sort(), [0, 1, 2], 'один из итогов разбора не отвечает ни одной точке');
    assert.ok(MAIN.includes("].map(([icon, title, text], i) => ({ title, text, mask: this.mask(icon), on: diagOut[diagAt] === i ? 'true' : 'false' }));"));
    const sum = right.slice(right.indexOf('<ul class="pd-diag-sum"'));
    assert.match(sum, /aria-labelledby="pd-diag-sum-label"[\s\S]*<li id="pd-diag-sum-label" aria-hidden="true"[^>]*>Итог разбора<\/li>[\s\S]*<li class="pd-diag-res" data-on="\{\{ o\.on \}\}"[^>]*>[\s\S]*\{\{ o\.title \}\}<\/li>/u);
    for (const [where, source] of SOURCES) {
      assert.match(css(source), /\.pd-diag-res\[data-on="true"\]\{background:var\(--pd-accent-tint\);border-color:var\(--pd-accent-edge\);color:var\(--pd-accent\)\}/u, `${where}: плашка итога не подсвечена`);
    }
  });

  it('предлоги и союзы в одну-две буквы и тире — с неразрывным пробелом; цвета — токены', () => {
    const at = MAIN.indexOf('const diagMore = [');
    const raw = MAIN.slice(at, MAIN.indexOf('];', at));
    const loose = [...raw.matchAll(/(?<![А-Яа-яЁё])(?:в|к|с|у|о|и|а|на|по|до|от|за|из|со|не|но) (?=[А-Яа-яЁё«])| —/gu)].map((m) => raw.slice(Math.max(0, m.index - 12), m.index + 8));
    assert.deepEqual(loose, [], 'обычный пробел после короткого предлога или перед тире');
    for (const s of SECTION.match(/style="[^"]*"/gu) ?? []) {
      assert.doesNotMatch(s, /#[0-9a-fA-F]{3,6}\b|rgba?\((?!20,22,28)/u, `цвет не токеном: ${s.slice(0, 120)}`);
    }
  });

  it('карточка-инфографика: две панели от 769 px, столбец до 768 px; скругления по шкале; правила в макете и компоненте', () => {
    for (const [where, source] of SOURCES) {
      for (const rule of [
        '.pd-flow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)}',
        '@media (min-width:769px) and (max-width:1100px){.pd-flow{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}',
        '@media (max-width:768px){.pd-flow{grid-template-columns:minmax(0,1fr)}',
        '.pd-diag-cta{box-sizing:border-box;min-height:44px;padding:8px 14px;background:var(--pd-ink-inverse);border:1px solid var(--pd-border);border-radius:10px}',
      ]) assert.ok(source.includes(rule), `${where}: нет правила «${rule.slice(0, 56)}…»`);
      for (const rule of [...source.matchAll(/\.pd-flow-in\{[^}]*\}/gu)].map((m) => m[0])) assert.doesNotMatch(rule, /border-radius/u, `${where}: у панели своё скругление`);
      for (const r of css(source).matchAll(/\.pd-diag-[a-z-]+\{[^}]*border-radius:(\d+(?:px|%))/gu)) {
        assert.ok(['6px', '10px', '14px', '999px', '50%'].includes(r[1]!), `${where}: скругление ${r[1]} вне шкалы`);
      }
    }
    const card = SECTION.match(/<div class="pd-flow" style="([^"]*)"/u);
    assert.ok(card, 'нет карточки .pd-flow');
    assert.match(card[1]!, /border-radius:14px;overflow:hidden;/u);
    assert.doesNotMatch(SECTION, /pd-diag-(?:map|row|pair|fix|head|out)\b|pd-flow-stall/u, 'осталась прежняя карта строк');
    const cta = SECTION.indexOf('<a class="pd-lift pd-diag-cta" href="#request">');
    assert.ok(cta > SECTION.indexOf('<ul class="pd-diag-sum"'), 'ссылка к заявке не под карточкой');
  });
});
