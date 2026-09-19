/**
 * Переносимая копия прототипа кабинета.
 *
 * Прототип снят обходом работающих экранов и разложен каталогами: переходы
 * записаны каталожными ссылками вида `../../head/manage/`, а логотип ведёт
 * на корень домена. GitHub Pages на каталожный адрес отдаёт `index.html`,
 * и там прототип работает. Но заказчику `github.io` не открывается, а на
 * другой площадке и при открытии с диска каталожная ссылка ведёт в никуда:
 * половина переходов упёрлась бы в «страница не найдена».
 *
 * Этот инструмент делает копию, не зависящую от поведения сервера:
 * каждая ссылка указывает на файл. Копия годится и для публикации на
 * стороннем узле, и для открытия двойным щелчком с диска, и для показа
 * на боевом сайте по адресу `/cabinet-preview/` (решение Р-174) — Next
 * отдаёт файлы из `public/` только по точному пути и каталожный адрес не
 * разворачивает.
 *
 * Исходники в `design/cabinet-prototype/` не правятся: они пересобираются
 * снимком (`tools/cabinet-prototype.mjs`) и обязаны совпадать побайтно.
 * Сам снимок вызывает `buildPortable` в конце работы, поэтому копия для
 * сайта не может отстать от прототипа.
 *
 * Запуск (из корня репозитория):
 *   node tools/cabinet-portable.mjs [каталог назначения]
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCabinetArtboards } from '../app/scripts/preview-artboards.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROTOTYPE = path.join(ROOT, 'design', 'cabinet-prototype');

/** Куда пишет запуск без аргумента. */
const DEFAULT_OUT = path.join(os.tmpdir(), 'cabinet-portable');

/** Правовые страницы сайта существуют и открываются — ведём на них. */
const SITE = 'https://prodisser.ru';
const SITE_PAGES = new Set(['/offer', '/privacy']);

/**
 * Артборды лежат рядом с прототипом и собираются тем же кодом, что и для
 * витрины (`app/scripts/preview-artboards.mjs`). Модуль пишет в `out/cabinet`
 * относительно текущего каталога, поэтому вызывается из промежуточного
 * каталога, где `../design` указывает на репозиторий.
 */
function collectArtboards(out, target) {
  const stage = path.join(out, '.stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(path.join(stage, 'app'), { recursive: true });
  cpSync(path.join(ROOT, 'design', 'cabinet'), path.join(stage, 'design', 'cabinet'), {
    recursive: true,
  });

  const back = process.cwd();
  process.chdir(path.join(stage, 'app'));
  try {
    writeCabinetArtboards();
  } finally {
    process.chdir(back);
  }

  cpSync(path.join(stage, 'app', 'out', 'cabinet', 'artboards'), target, { recursive: true });
  rmSync(stage, { recursive: true, force: true });
}

/** Все файлы каталога относительными путями. */
function walk(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/**
 * Переписывает ссылки одного файла.
 *
 * `depth` — глубина файла от корня копии: столько раз `../` нужно, чтобы
 * ссылка на корень домена стала ссылкой на начальный экран прототипа.
 */
function rewrite(html, depth) {
  const up = '../'.repeat(depth);
  return html.replace(/href="([^"]*)"/gu, (whole, target) => {
    // Шапка прототипа ссылается на себя пустым адресом.
    if (target === '') return `href="${up}index.html"`;
    if (target === '/') return `href="${up}index.html"`;
    if (SITE_PAGES.has(target)) return `href="${SITE}${target}"`;
    if (/^(?:[a-z]+:|#|\/\/)/u.test(target)) return whole;
    // Каталожный адрес отдаётся сервером как index.html; на диске и на
    // сторонней площадке такого поведения нет — указываем файл прямо.
    if (target.endsWith('/')) return `href="${target}index.html"`;
    return whole;
  });
}

/**
 * Складывает переносимую копию в указанный каталог.
 *
 * Каталог назначения очищается целиком: копия — производное от снимка, и
 * остаток прошлой сборки в ней был бы файлом, на который ничто не ссылается.
 */
export function buildPortable(outDir) {
  const out = path.resolve(outDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(PROTOTYPE, out, { recursive: true });
  collectArtboards(out, path.join(out, 'artboards'));

  const files = walk(out).sort();
  let touched = 0;
  for (const name of files) {
    if (!name.endsWith('.html')) continue;
    const file = path.join(out, name);
    const depth = name.split(path.sep).length - 1;
    const before = readFileSync(file, 'utf8');
    const after = rewrite(before, depth);
    if (after !== before) touched += 1;
    writeFileSync(file, after);
  }

  // Перечень для публикации: страница прототипа отдаётся отдельно, всё
  // прочее — сопутствующими файлами.
  writeFileSync(
    path.join(out, 'files.json'),
    `${JSON.stringify(files.filter((name) => name !== 'index.html'), null, 2)}\n`,
  );

  console.log(`Переносимая копия: ${out}`);
  console.log(`Файлов: ${files.length}, из них правлено ссылок в ${touched}`);
  return { out, files, touched };
}

// Запуск из командной строки; при импорте ничего не делается.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPortable(process.argv[2] ?? DEFAULT_OUT);
}
