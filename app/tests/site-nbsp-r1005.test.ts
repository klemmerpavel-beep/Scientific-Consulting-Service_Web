/**
 * Короткие предлоги и союзы в текстах разделов шести страниц (Р-1005;
 * методика §8, DESIGN-SYSTEM §3.4, Р-86).
 *
 * После предлога или союза в одну-две буквы («в», «к», «с», «о», «у», «и»,
 * «а», «на», «по», «за», «до», «из», «от», «но», «во», «ко», «со», «об») в
 * видимом тексте разделов — неразрывный пробел: слово не остаётся в конце
 * строки (на 390 px висели «и» в каталоге «Компаниям» и «к», «и» в карточках
 * «Что входит» посадочной). Проверяются текст разметки макета и строки данных
 * в логике (карточки, пункты, ответы, подписи) посадочной, «Аспирантам»,
 * «Студентам», «Компаниям», «Экспертам» и «Инструментов».
 *
 * Исключения — `EXCEPTIONS` ниже, у каждого причина.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { LOOSE } from './helpers/short-words.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');
const PAGES = [
  ['StartPage', 'StartPage'], ['MainPage', 'PostgradPage'], ['StudentsPage', 'StudentsPage'],
  ['BusinessPage', 'BusinessPage'], ['ExpertsPage', 'ExpertsPage'], ['ToolsPage', 'ToolsPage'],
] as const;

/** Что не проверяется и почему. */
export const EXCEPTIONS = {
  /** Элементы разметки, которые правка не трогает. */
  html: [
    [/<style\b[\s\S]*?<\/style>/gu, 'таблица стилей'],
    [/<!--[\s\S]*?-->/gu, 'комментарии макета'],
    [/<title\b[\s\S]*?<\/title>|<meta\b[^>]*>/gu, '<title> и описания — не текст раздела'],
    [/<h1\b[\s\S]*?<\/h1>/gu, 'h1 первого экрана — не трогается (указание к Р-1005)'],
    [/<form\b[\s\S]*?<\/form>/gu, 'формы: поля, подписи, галочки согласия — журнал согласий, 152-ФЗ'],
    [/<aside class="ex-aside"[\s\S]*?<\/aside>/gu, '«Экспертам»: перечень разделов анкеты — часть формы'],
  ] as Array<[RegExp, string]>,
  /** Блоки после отправки формы: `<sc-if value="{{ sent… }}">`, `{{ error… }}`. */
  afterSubmit: 'сообщения формы после отправки — тексты формы',
  /** Данные логики, которые правка не трогает. */
  js: [
    [/const REVIEWS = \[/u, 'отзывы — дословно, с авторской пунктуацией (§8, Р-113)'],
    [/\bneeds: \[/u, '«Компаниям»: варианты поля «Что нужно» — тексты формы'],
    [/\bterms: \[/u, '«Студентам»: варианты поля «Срок сдачи» — тексты формы'],
    [/const STEPS = \[/u, '«Экспертам»: разделы анкеты — тексты формы'],
  ] as Array<[RegExp, string]>,
  /** Строки логики «Экспертам» с текстами анкеты: подсказки проверки, поле файлов, ошибки отправки. */
  expertsFormLines: ['setCustomValidity(', 'dropTitle:', 'fileError =', 'error: out.error ||', "error: 'Нет связи"],
  /** Строки, равные вариантам полей формы: по ним ставится значение поля (Р-886, Р-977). */
  formEqual: 'названия пакетов «Компаниям» и ситуация «До защиты меньше месяца» на «Студентам» совпадают с вариантами полей формы',
  /** «Инструменты»: логика оформителя — записи по ГОСТ, подсказки полей инструмента. */
  toolsLogic: 'вывод оформителя по ГОСТ Р 7.0.100-2018 и его форма',
} as const;

/** Позиции строковых литералов логики: '…', "…", `…` — без комментариев и регулярных выражений. */
export function jsLiterals(js: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prev = '';
  for (let i = 0; i < js.length;) {
    const c = js[i]!;
    if (js.startsWith('//', i)) { const e = js.indexOf('\n', i); i = e < 0 ? js.length : e; continue; }
    if (js.startsWith('/*', i)) { i = js.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < js.length && js[j] !== c) j += js[j] === '\\' ? 2 : 1;
      out.push([i, j + 1]);
      i = j + 1; prev = 'x'; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\breturn\s*$/u.test(js.slice(Math.max(0, i - 10), i)))) {
      let j = i + 1; let cls = false;
      while (j < js.length) {
        if (js[j] === '\\') { j += 2; continue; }
        if (js[j] === '[') cls = true; else if (js[j] === ']') cls = false; else if (js[j] === '/' && !cls) break;
        j += 1;
      }
      i = j + 1; prev = 'x'; continue;
    }
    if (!/\s/u.test(c)) prev = c;
    i += 1;
  }
  return out;
}

/** Конец массива, начатого первой «[» после `from`, с учётом строк внутри. */
function arrayEnd(js: string, from: number): number {
  const start = js.indexOf('[', from);
  const lits = new Map(jsLiterals(js.slice(start)).map(([a, b]) => [a + start, b + start]));
  let depth = 0;
  for (let k = start; k < js.length; k++) {
    const skip = lits.get(k);
    if (skip !== undefined) { k = skip - 1; continue; }
    if ('[{('.includes(js[k]!)) depth += 1;
    else if (']})'.includes(js[k]!)) { depth -= 1; if (depth === 0) return k + 1; }
  }
  return js.length;
}

/** Конец блока `<sc-if …>` с учётом вложенных. */
function scIfEnd(html: string, from: number): number {
  const tok = /<sc-if\b|<\/sc-if>/gu;
  tok.lastIndex = from;
  let depth = 0;
  for (let m = tok.exec(html); m; m = tok.exec(html)) {
    depth += m[0] === '</sc-if>' ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return html.length;
}

const inside = (pos: number, zones: Array<[number, number]>) => zones.some(([a, b]) => a <= pos && pos < b);

/** Обычные пробелы после короткого предлога или союза в проверяемых текстах макета: [где, фрагмент]. */
export function loose(source: string, page: string): Array<[string, string]> {
  const scriptAt = source.indexOf('>', source.indexOf('<script type="text/x-dc"')) + 1;
  const bodyAt = Math.max(0, source.indexOf('<body>'));
  const html = source.slice(bodyAt, scriptAt);
  const js = source.slice(scriptAt, source.indexOf('</script>', scriptAt));
  const found: Array<[string, string]> = [];

  const zones: Array<[number, number]> = [];
  for (const [re] of EXCEPTIONS.html) for (const m of html.matchAll(re)) zones.push([m.index, m.index + m[0].length]);
  for (const m of html.matchAll(/<sc-if value="\{\{ (?:sent|error)\w* \}\}"/gu)) zones.push([m.index, scIfEnd(html, m.index)]);
  const tag = /<(?:[^"'>]|"[^"]*"|'[^']*')*>/gu;
  let last = 0;
  for (const m of html.matchAll(tag)) {
    const text = html.slice(last, m.index);
    if (!inside(last, zones)) {
      for (const k of text.matchAll(LOOSE)) found.push(['разметка', text.slice(Math.max(0, k.index - 30), k.index + 20).trim()]);
      // «по <span>ГОСТ…</span>»: предлог в конце текста перед строчным элементом
      const tail = /(?<![\p{L}\p{N}_\-. /@])(?:в|во|к|ко|с|со|о|об|у|на|по|за|до|из|от|и|а|но) $/iu.exec(text);
      if (tail && /^<(?:span|a|strong|b|em)\b/u.test(m[0])) found.push(['разметка', text.slice(-30).trim() + ' <…']);
    }
    last = m.index + m[0].length;
  }

  if (page === 'ToolsPage') return found;
  const jsZones: Array<[number, number]> = [];
  for (const [re] of EXCEPTIONS.js) {
    for (const m of js.matchAll(new RegExp(re.source, 'gu'))) jsZones.push([m.index, arrayEnd(js, m.index)]);
  }
  if (page === 'ExpertsPage') {
    let pos = 0;
    for (const line of js.split('\n')) {
      if (EXCEPTIONS.expertsFormLines.some((k) => line.includes(k))) jsZones.push([pos, pos + line.length]);
      pos += line.length + 1;
    }
  }
  const lits = jsLiterals(js);
  const formValues = new Set([
    ...[...html.matchAll(/<option[^>]*>([^<]*)/gu)].map((m) => m[1]!),
    ...lits.filter(([a]) => inside(a, jsZones)).map(([a, b]) => js.slice(a + 1, b - 1)),
  ]);
  for (const [a, b] of lits) {
    const body = js.slice(a + 1, b - 1);
    if (inside(a, jsZones) || formValues.has(body) || !/[А-Яа-яЁё]/u.test(body)) continue;
    for (const k of body.matchAll(LOOSE)) found.push(['данные', body.slice(Math.max(0, k.index - 30), k.index + 20)]);
    // 'Экран ' + n + ' из ' + total: предлог в конце литерала перед «+»
    if (/^\s*\+/u.test(js.slice(b, b + 4)) && /(?:^|[\s ])(?:в|во|к|ко|с|со|о|об|у|на|по|за|до|из|от|и|а|но) $/iu.test(body)) found.push(['данные', body]);
  }
  return found;
}

describe('тексты разделов: после предлогов и союзов в одну-две буквы — неразрывный пробел (Р-1005)', () => {
  for (const [page] of PAGES) {
    it(`${page}: в разметке и данных разделов нет обычного пробела после короткого предлога или союза`, () => {
      const hits = loose(read('design', `${page}.dc.html`), page);
      assert.deepEqual(hits.slice(0, 12), [], `${page}: ${hits.length} мест, первые — выше`);
    });
  }

  it('компоненты перенесены с неразрывными пробелами: каталог «Компаниям», «Что входит» посадочной', () => {
    const business = read('app', 'src', 'components', 'pages', 'BusinessPage.tsx');
    assert.ok(business.includes('отчётность под требования заказчика и налогового учёта'), 'каталог «Компаниям»: висит «и»');
    const start = read('app', 'src', 'components', 'pages', 'StartPage.tsx');
    assert.ok(start.includes('Подготовка к защите'), '«Что входит» посадочной: висит «к»');
  });

  it('исключения на месте: h1, формы и отзывы не тронуты', () => {
    const main = read('design', 'MainPage.dc.html');
    assert.match(main, /<h1\b[^>]*>\nНаучное сопровождение <span/u, 'h1 «Аспирантам» изменился');
    assert.match(main, /<span>Даю <a href="\.\/consent\.html"[^>]*>согласие на обработку персональных данных<\/a><\/span>/u, 'текст галочки согласия изменился');
    assert.ok(main.includes("text: 'Цена соответствует качеству работы, все было выполнено даже раньше срока, в полном объёме."), 'отзыв изменился');
    assert.ok(read('design', 'BusinessPage.dc.html').includes("needs: ['Ещё не определились', 'Техзадание и патентная чистота',"), 'варианты поля формы «Компаниям» изменились');
  });

  it('проба: обычный пробел ловится в разметке, в данных и в конце литерала перед «+»', () => {
    const probe = '<body>\n<p>Готовим к защите</p>\n<form><label>Даю согласие на обработку</label></form>\n<script type="text/x-dc">\nconst a = [\'Работа и сроки\', \'Экран \' + 1 + \' из \' + 4];\n</script>';
    const hits = loose(probe, 'MainPage').map(([where, text]) => `${where}: ${text}`);
    assert.equal(hits.length, 3, hits.join('\n'));
    assert.ok(hits.every((h) => !h.includes('согласие')), 'форма попала в проверку');
  });
});
