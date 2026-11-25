/**
 * Данные для поисковых систем, которые выводятся из макетов (Р-1010).
 *
 * Два порождаемых файла в `app/content/`:
 *
 * - `page-dates.generated.ts` — дата последней правки каждой страницы карты
 *   сайта. Дата меняется только вместе с макетом: рядом с ней хранится
 *   свёртка макета, и новая дата ставится, когда свёртка разошлась. Так у
 *   `lastmod` в sitemap.xml появляется честный источник, которого не было
 *   при Р-254;
 * - `faq.generated.ts` — вопросы и ответы разделов «Вопросы» в том виде, в
 *   каком они стоят в макетах. Из них собирается разметка FAQPage; второго
 *   источника текста при этом не возникает — файл переписывается из макета.
 *
 * Запуск — `node tools/seo-sync.mjs` из корня репозитория; его выполняет и
 * `sync-check.sh` после переноса макетов. Расхождение ловит
 * `tests/seo-sync.test.ts`: макет изменён, а файлы не обновлены — проверка
 * падает, как падает перенос макета без коммита компонента.
 *
 * Сценарий лежит в `app/scripts`, а не в `tools`: его импортирует тест, а
 * образ приложения собирается из одного `app` (как `ads-registry.mjs`).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..');

export const DATES_OUTPUT = path.join(APP, 'content', 'page-dates.generated.ts');
export const FAQ_OUTPUT = path.join(APP, 'content', 'faq.generated.ts');

/** Страницы карты сайта и макеты, из которых они перенесены. */
export const PAGE_LAYOUTS = [
  ['/', 'StartPage'],
  ['/main', 'MainPage'],
  ['/students', 'StudentsPage'],
  ['/business', 'BusinessPage'],
  ['/tools', 'ToolsPage'],
  ['/contacts', 'ContactsPage'],
  ['/offer', 'OfferPage'],
  ['/privacy', 'PrivacyPage'],
  ['/consent', 'ConsentPage'],
];

/** Страницы с разделом «Вопросы», открытые для индексации. */
export const FAQ_LAYOUTS = [
  ['/main', 'MainPage'],
  ['/students', 'StudentsPage'],
  ['/business', 'BusinessPage'],
];

const layoutPath = (layout) => path.join(ROOT, 'design', `${layout}.dc.html`);

export function layoutHash(layout) {
  return createHash('sha256').update(readFileSync(layoutPath(layout))).digest('hex');
}

/** Сегодняшняя дата по Москве: выпуск и приёмка считаются по ней. */
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
}

/** Объект из порождённого файла: всё между «= » и завершающей «;». */
function readGenerated(file) {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('= {');
  return start < 0 ? {} : JSON.parse(text.slice(start + 2, text.lastIndexOf(';')));
}

export const readDates = () => readGenerated(DATES_OUTPUT);
export const readFaq = () => readGenerated(FAQ_OUTPUT);

/**
 * Даты страниц: прежняя, пока макет прежний; `date` — у изменённого и у
 * нового. Чистая функция — её проверяет тест.
 */
export function nextDates(current, hashes, date) {
  return Object.fromEntries(
    PAGE_LAYOUTS.map(([route, layout]) => {
      const prev = current[route];
      const sha256 = hashes[layout];
      return [route, prev && prev.sha256 === sha256 ? prev : { layout, sha256, date }];
    }),
  );
}

/**
 * Вопросы и ответы макета. В макетах они стоят литералом — массивом пар
 * строк: `const faqData = [ … ];` или `faq: [ … ].map(`. Литерал
 * вычисляется в пустом окружении: обращение к чему-либо, кроме строк,
 * бросает ошибку, и макет с вычисляемым ответом сюда молча не попадёт.
 */
export function layoutFaq(layout) {
  const html = readFileSync(layoutPath(layout), 'utf8');
  const literal = /const faqData = (\[\n[\s\S]*?\n {4}\]);/u.exec(html)?.[1]
    ?? /\n {6}faq: (\[\n[\s\S]*?\n {6}\])\.map\(/u.exec(html)?.[1];
  if (!literal) throw new Error(`${layout}: перечень вопросов в макете не найден`);
  const pairs = vm.runInNewContext(literal, Object.create(null), { timeout: 1000 });
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error(`${layout}: перечень вопросов пуст`);
  return pairs.map((pair, i) => {
    const [q, a] = pair;
    if (typeof q !== 'string' || typeof a !== 'string' || !q.trim() || !a.trim()) {
      throw new Error(`${layout}: вопрос ${i + 1} — не пара строк`);
    }
    return { q, a };
  });
}

export function collectFaq() {
  return Object.fromEntries(FAQ_LAYOUTS.map(([route, layout]) => [route, layoutFaq(layout)]));
}

const DATES_HEAD = `// Сгенерировано tools/seo-sync.mjs из макетов design/*.dc.html. Руками не
// править: дата страницы меняется вместе со свёрткой её макета — после
// правки макета выполнить \`node tools/seo-sync.mjs\` из корня репозитория
// (его же выполняет sync-check.sh). Решение Р-1010.

export const PAGE_DATES: Record<string, { layout: string; sha256: string; date: string }> = `;

const FAQ_HEAD = `// Сгенерировано tools/seo-sync.mjs из разделов «Вопросы» макетов
// design/*.dc.html. Руками не править: правится макет, затем
// \`node tools/seo-sync.mjs\` из корня репозитория (его же выполняет
// sync-check.sh). Решение Р-1010.

export const FAQ: Record<string, { q: string; a: string }[]> = `;

export const renderDates = (dates) => `${DATES_HEAD}${JSON.stringify(dates, null, 2)};\n`;
export const renderFaq = (faq) => `${FAQ_HEAD}${JSON.stringify(faq, null, 2)};\n`;

/** Что записал бы сценарий сейчас; `date` — для изменённых макетов. */
export function expected(date = today()) {
  const hashes = Object.fromEntries(PAGE_LAYOUTS.map(([, layout]) => [layout, layoutHash(layout)]));
  return { dates: nextDates(readDates(), hashes, date), faq: collectFaq() };
}

export function writeAll(date = today()) {
  const { dates, faq } = expected(date);
  writeFileSync(DATES_OUTPUT, renderDates(dates));
  writeFileSync(FAQ_OUTPUT, renderFaq(faq));
  return { dates, faq };
}
