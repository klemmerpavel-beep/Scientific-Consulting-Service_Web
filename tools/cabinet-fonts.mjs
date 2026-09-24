/**
 * Гарнитуры сайта в снимках кабинета.
 *
 * Прежде правила `@font-face` из снимков вырезались: они ведут на файлы
 * сборки (`/_next/static/media/…`), которых рядом со снимком нет. Снимок
 * при этом не ломался, но набирался стеком замены — Georgia в заголовках,
 * Arial в тексте и моноширинный системы в метках. Прототип и артборды —
 * то, по чему заказчик принимает облик кабинета, и принимал он его в чужих
 * гарнитурах: антиква, гротеск и моноширинный сайта (решение Р-52) в
 * снимке не появлялись ни разу (решение Р-204).
 *
 * Теперь файлы шрифтов кладутся рядом со снимком каталогом `fonts/`, а
 * правила переписываются на него. Гарнитуры лежат в репозитории одним
 * файлом на семейство — основная и расширенная латиница и кириллица
 * (решение Р-230); правило с диапазоном, отличным от этих, отбрасывается.
 * Имя файла — начало его свёртки: одинаковые байты дают одинаковое имя,
 * и повторный снимок совпадает с прежним побайтно.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MEDIA = path.resolve(import.meta.dirname, '..', 'app', '.next', 'static', 'media');
const LICENSE = path.join(import.meta.dirname, 'fonts-OFL.txt');

/** Подмножество нужно кабинету: латиница, расширенная латиница, кириллица. */
function wanted(rule) {
  const range = /unicode-range:([^;}]*)/u.exec(rule)?.[1] ?? '';
  if (range === '') return true;
  return (
    range.startsWith('U+??') || // основная латиница
    /(^|,)U\+100-2BA/u.test(range) || // расширенная латиница: в ней знак рубля
    /(^|,)U\+301,U\+400-45F/u.test(range) // кириллица
  );
}

/**
 * Переписать правила `@font-face` на локальный каталог.
 *
 * `css` — собранные таблицы стилей снимка, `outDir` — каталог, в котором
 * появится `fonts/`, `prefix` — путь к нему от файла, который читает стили.
 */
export function embedFonts(css, outDir, prefix = 'fonts/') {
  const names = new Map();
  const target = path.join(outDir, 'fonts');
  const rules = new Set();
  const rest = css.replace(/@font-face\s*\{[^}]*\}/gu, (rule) => {
    if (!wanted(rule)) return '';
    const match = /url\((?:\.\.\/media\/|\/_next\/static\/media\/)([^)]+?\.woff2)\)/u.exec(rule);
    if (match === null) {
      // Правило подстройки запасного шрифта (`local(Arial)` и поправки
      // метрик): файла у него нет, и оно держит строку от скачка при
      // замене — остаётся как есть.
      if (!rule.includes('url(')) rules.add(rule);
      return '';
    }
    const source = path.join(MEDIA, match[1]);
    if (!existsSync(source)) return '';
    if (!names.has(source)) {
      const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12);
      names.set(source, `${hash}.woff2`);
      mkdirSync(target, { recursive: true });
      copyFileSync(source, path.join(target, `${hash}.woff2`));
    }
    rules.add(rule.replace(match[0], `url(${prefix}${names.get(source)})`));
    return '';
  });
  // Лицензия OFL требует, чтобы файлы шрифтов распространялись вместе с
  // её текстом и строками авторских прав: снимки лежат в открытом
  // репозитории и на сайте.
  if (names.size > 0) copyFileSync(LICENSE, path.join(target, 'OFL.txt'));
  return { css: rest, faces: [...rules].join('\n') };
}
