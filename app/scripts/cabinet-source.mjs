/**
 * Отпечаток исходников, с которых сняты снимки кабинета.
 *
 * Снимки в репозитории уже однажды отстали от кода: экраны правились, а
 * прототип и артборды оставались прежними, и ни одна проверка этого не
 * видела — правила облика читали устаревшую разметку и оставались
 * зелёными (решение Р-203). Теперь съёмка записывает рядом со снимком
 * свёртку всего, от чего он зависит, а проверка сверяет её с текущими
 * исходниками. Правка экрана без пересъёмки роняет `npm test`
 * (решение Р-214).
 *
 * В свёртку входят экраны, общие части и предметная область кабинета,
 * каркас приложения, наполнение базы снимков и сами инструменты съёмки.
 * Переводы строк приводятся к `\n`: иначе отпечаток зависел бы от того,
 * на какой машине сделан выпуск.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Модуль лежит в `app/scripts`, а не в `tools/`: его импортирует проверка
// из `app/tests`, и образ приложения, собираемый из одного `app`, иначе
// не нашёл бы его при проверке типов.
const ROOT = path.resolve(import.meta.dirname, '..', '..');

export const SOURCE_PATHS = [
  'app/src/app/cabinet',
  'app/src/app/layout.tsx',
  'app/src/app/globals.css',
  'app/src/components/cabinet',
  // Сценарий движения сайта касался и экранов кабинета (решение Р-216).
  'app/src/components/SiteMotion.tsx',
  'app/src/lib/cabinet',
  'app/scripts/seed-artboards.ts',
  'app/scripts/data/book.json',
  'app/scripts/preview-artboards.mjs',
  'tools/cabinet-artboards.mjs',
  'tools/cabinet-prototype.mjs',
  'tools/cabinet-portable.mjs',
  'tools/cabinet-fonts.mjs',
  'tools/fonts-OFL.txt',
  // Файлы гарнитур в репозитории (решение Р-230).
  'app/src/fonts',
];

/** Имя файла отпечатка рядом со снимком. */
export const SOURCE_FILE = 'source.txt';

function files(relative) {
  const full = path.join(ROOT, relative);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [relative];
  return readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/** Свёртка исходников снимка: путь и содержимое каждого файла по порядку. */
export function sourceHash() {
  const hash = createHash('sha256');
  const all = SOURCE_PATHS.flatMap(files).sort();
  for (const name of all) {
    hash.update(`${name}\0`);
    hash.update(readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/gu, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Текст файла отпечатка: сама свёртка и как её обновить. */
export function sourceNote() {
  return (
    `${sourceHash()}\n` +
    '# Свёртка исходников, с которых снят этот снимок (решение Р-214).\n' +
    '# Пересъёмка: node tools/cabinet-artboards.mjs, затем node tools/cabinet-prototype.mjs\n'
  );
}
