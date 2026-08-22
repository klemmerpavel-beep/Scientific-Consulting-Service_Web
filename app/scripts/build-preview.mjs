/**
 * Собирает статическую витрину проекта.
 *
 * Витрина — это семь страниц со всеми переходами и всей интерактивностью,
 * но без сервера: заявки не отправляются, базы нет, персональные данные
 * никуда не уходят. Нужна, чтобы показать проект по ссылке, пока рабочая
 * площадка не выбрана.
 *
 * Статический вывод Next не умеет три вещи, которые есть в проекте:
 * обработчик заявки (POST), robots.txt и sitemap.xml — все три считаются
 * серверными. На время сборки они убираются в сторону и возвращаются
 * обратно в любом случае, включая падение сборки.
 *
 *   PREVIEW_BASE_PATH=/имя-репозитория node scripts/build-preview.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Прятать внутри src/app нельзя: Next обходит всю папку и считает
// маршрутом даже каталог, начинающийся с точки. Убираем за пределы дерева.
const shelf = '.preview-aside';
const basePath = process.env.PREVIEW_BASE_PATH ?? '';

const aside = [
  ['src/app/api', `${shelf}/api`],
  ['src/app/robots.ts', `${shelf}/robots.ts`],
  ['src/app/sitemap.ts', `${shelf}/sitemap.ts`],
];

function move(pairs) {
  mkdirSync(shelf, { recursive: true });
  for (const [from, to] of pairs) {
    if (existsSync(from)) renameSync(from, to);
  }
}

move(aside);

try {
  rmSync('.next', { recursive: true, force: true });
  rmSync('out', { recursive: true, force: true });

  execFileSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_PREVIEW: '1',
      NEXT_PUBLIC_DEMO_STAND: '1',
      PREVIEW_BASE_PATH: process.env.PREVIEW_BASE_PATH ?? '',
    },
  });

  // GitHub Pages прогоняет содержимое через Jekyll, а тот пропускает папки,
  // начинающиеся с подчёркивания, — вместе с ними исчезают все стили и
  // скрипты из _next. Пустой файл .nojekyll это отключает.
  writeFileSync(path.join('out', '.nojekyll'), '');

  prefixInternalLinks();

  console.log('\nВитрина собрана в app/out');
} finally {
  move(aside.map(([from, to]) => [to, from]));
  rmSync(shelf, { recursive: true, force: true });
}


/**
 * Дописывает префикс подпапки к внутренним ссылкам.
 *
 * Next сам приставляет basePath только к своим ресурсам и к ссылкам через
 * next/link. Страницы перенесены из макетов и ходят друг к другу обычными
 * тегами `<a href="/main">`, а снимки — обычными `<img src="/photos/…">`;
 * до них basePath не доходит, и на GitHub Pages, где сайт лежит в подпапке,
 * такие ссылки уводят в корень домена.
 *
 * Правятся и страницы, и сборки: адреса зашиты и в готовую разметку,
 * и в код страниц, который оживляет её в браузере. Поправить только
 * разметку мало — после оживления адреса вернулись бы к исходным.
 */
function prefixInternalLinks() {
  if (!basePath) return;

  const routes = ['main', 'students', 'business', 'offer', 'privacy', 'consent'];
  const rules = [
    ...routes.flatMap((r) => [
      [`href="/${r}"`, `href="${basePath}/${r}/"`],
      [`"/${r}"`, `"${basePath}/${r}/"`],
    ]),
    ['href="/"', `href="${basePath}/"`],
    ['href:"/"', `href:"${basePath}/"`],
    ['"/photos/', `"${basePath}/photos/`],
    // Иконки и иллюстрации пришли из макетов относительными ссылками
    // `./assets/…`. На странице с завершающей косой чертой такая ссылка
    // отсчитывается от самой страницы, а не от корня, и файл не находится.
    ['./assets/', `${basePath}/assets/`],
  ];

  let touched = 0;

  for (const file of walk('out')) {
    if (!/\.(html|js)$/.test(file)) continue;
    const before = readFileSync(file, 'utf8');
    let after = before;
    for (const [from, to] of rules) after = after.split(from).join(to);
    if (after !== before) {
      writeFileSync(file, after);
      touched += 1;
    }
  }

  console.log(`Внутренние ссылки получили префикс ${basePath} — файлов правлено: ${touched}`);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
