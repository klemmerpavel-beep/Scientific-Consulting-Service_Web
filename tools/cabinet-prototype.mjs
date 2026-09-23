/**
 * Рабочий прототип кабинета: связанный обход экранов без сервера.
 *
 * Артборды показывают композицию каждого экрана по отдельности — этого
 * довольно для приёмки облика, но по ним нельзя пройти сценарий: открыть
 * работу из перечня, войти в этап, вернуться к оплатам. Прототип снимает
 * те же настоящие экраны, но обходом по ссылкам: что найдено переходом —
 * то и снято, и переходы между снимками сохранены.
 *
 * Роль меняет и состав разделов, и содержимое одного и того же маршрута,
 * поэтому дерево строится по ролям: `client/`, `expert/`, `manager/`,
 * `head/`. Точка входа — экран входа кабинета, на нём выбирается роль:
 * одноразовой ссылки в прототипе нет, писем он не шлёт.
 *
 * Персональные данные: снимок делается только с базы прототипа, наполненной
 * `scripts/seed-artboards.ts` вымышленными людьми. Скрипт отказывается
 * работать, если в адресе базы нет слова «artboard».
 *
 * Запуск (из корня репозитория):
 *   node tools/cabinet-prototype.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '/var/tmp/pwtest/node_modules/playwright-core/index.mjs';

import { embedFonts } from './cabinet-fonts.mjs';
import { SOURCE_FILE, sourceNote } from './cabinet-source.mjs';
import { buildPortable } from './cabinet-portable.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(ROOT, 'design', 'cabinet-prototype');
const BROWSER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.PROTOTYPE_PORT ?? 3211);
const BASE = `http://127.0.0.1:${PORT}`;

const DB =
  process.env.ARTBOARD_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5433/prodisser_artboards';

if (!/artboard/i.test(DB)) {
  console.error(
    'Прототип снимается только с базы артбордов: в адресе нет слова «artboard».\n' +
      'Снимок с рабочей базы вынес бы в открытый репозиторий фамилии клиентов.',
  );
  process.exit(1);
}

/**
 * Роли прототипа.
 *
 * Роли выводились в кабинет по одной: клиент и руководитель (Р-140),
 * менеджер (Р-149), эксперт (Р-150). Прототип показывает все четыре —
 * состав разделов и содержимое одного и того же маршрута у них разные,
 * и это матрица прав, а не оформление.
 */
const ROLES = [
  { key: 'client', label: 'Клиент', home: '/cabinet/projects' },
  { key: 'expert', label: 'Эксперт', home: '/cabinet/projects' },
  { key: 'manager', label: 'Менеджер', home: '/cabinet/manage' },
  { key: 'head', label: 'Руководитель', home: '/cabinet/manage' },
];

/**
 * Маршруты, которые обходом не берутся.
 *
 * Выдача файла и выгрузка журнала отдают не страницу, а файл; вход по
 * ссылке погашает токен и увёл бы обход из-под роли.
 */
const SKIP = [
  /^\/cabinet\/enter\b/u,
  /^\/cabinet\/files\b/u,
  // Вложение заявки отдаётся тем же порядком, что и материал: не
  // страницей, а файлом (решение Р-191).
  /^\/cabinet\/lead-files\b/u,
  /\/export\b/u,
  /^\/cabinet\/logout\b/u,
];

const LIMIT = 90;

/**
 * Сколько экземпляров одного образца маршрута берётся в прототип.
 *
 * Перенесённая книга заказов дала полсотни проектов, и обход у менеджера
 * уходил целиком в них: до аналитики и переноса очередь не доходила.
 * Прототип показывает устройство раздела, а не всю базу, поэтому на
 * однотипные экраны ставится норма, а неповторяющиеся маршруты берутся
 * первыми.
 */
const QUOTA = [
  [/^\/cabinet\/projects\/[^/]+$/u, 3],
  [/^\/cabinet\/projects\/[^/]+\/materials$/u, 2],
  [/^\/cabinet\/projects\/[^/]+\/messages$/u, 2],
  [/^\/cabinet\/projects\/[^/]+\/payments$/u, 2],
  [/^\/cabinet\/stages\/[^/]+$/u, 5],
  [/^\/cabinet\/manage\/import\/[^/]+$/u, 1],
  // Заявок в очереди двадцать на страницу, а образец разбора один: снимка
  // двух хватает, чтобы показать и обращение с текстом, и без него.
  [/^\/cabinet\/manage\/leads\/[^/]+$/u, 2],
];

/** Образец маршрута: одиночные записи сводятся к одному ключу. */
function pattern(route) {
  for (const [rule] of QUOTA) if (rule.test(route)) return String(rule);
  return route;
}

function quotaFor(route) {
  for (const [rule, limit] of QUOTA) if (rule.test(route)) return limit;
  return Infinity;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Сборка должна быть новее исходников.
 *
 * Раньше проверялось лишь её наличие, и снимок молча делался с прежней
 * сборки: правка экрана в код попадала, а в артборд — нет. Это ровно тот
 * случай, ради которого снимок и заведён, поэтому сборка пересобирается,
 * как только любой файл под `src` или `scripts` оказался свежее.
 */
function buildIsStale() {
  const server = path.join(APP, '.next', 'standalone', 'server.js');
  if (!existsSync(server)) return true;
  const built = statSync(server).mtimeMs;
  for (const folder of ['src', 'scripts']) {
    const root = path.join(APP, folder);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (statSync(path.join(entry.parentPath, entry.name)).mtimeMs > built) return true;
    }
  }
  return false;
}

async function ensureBuild(env) {
  if (!buildIsStale()) return;
  console.log('Сборка старше исходников — собираю (npm run build)…');
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: APP,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Сборка отказала'))));
  });
}

async function startServer(env) {
  const server = spawn('node', ['.next/standalone/server.js'], {
    cwd: APP,
    env: { ...process.env, ...env, PORT: String(PORT), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/cabinet`);
      if (response.ok) return server;
    } catch {
      // сервер ещё поднимается
    }
    await wait(500);
  }
  server.kill();
  throw new Error('Сборка не поднялась за двадцать секунд');
}

/** Маршрут без запроса и якоря; хвостовая косая черта снимается. */
function normalize(href) {
  const clean = href.split('#')[0].split('?')[0];
  return clean.length > 1 ? clean.replace(/\/$/u, '') : clean;
}

/**
 * Идентификаторы записей база выдаёт заново при каждом наполнении. Без
 * приведения к постоянному виду каждый пересбор прототипа отличался бы от
 * предыдущего одними только ключами — и в путях, и в ссылках.
 */
function makeStabilizer() {
  const ids = new Map();
  return (text) =>
    text.replace(/\b(c[a-z0-9]{24})\b/gu, (id) => {
      if (!ids.has(id)) ids.set(id, `id-${String(ids.size + 1).padStart(2, '0')}`);
      return ids.get(id);
    });
}

/** Снимок страницы: разметка без сценариев и перечень таблиц стилей. */
async function snapshot(page) {
  await page.waitForSelector('main');

  const styles = await page.evaluate(async () => {
    const texts = [];
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      try {
        texts.push(await (await fetch(link.href)).text());
      } catch {
        // стиль недоступен — в снимок он и так не попадёт
      }
    }
    for (const style of document.querySelectorAll('style')) texts.push(style.textContent ?? '');
    return texts;
  });

  const html = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    for (const node of clone.querySelectorAll('script, link, style, next-route-announcer')) {
      node.remove();
    }
    // Полосу прогресса чтения навешивает сценарий движения уже после
    // отрисовки, и снимок заставал её то на месте, то нет: два прогона
    // подряд расходились на случайных экранах. Движению в снимке места
    // нет — в нём принимают облик (решение Р-186).
    for (const node of clone.querySelectorAll('.pd-progress')) node.remove();
    // Те же классы появления навешивает сценарий движения по мере
    // прокрутки: снимок заставал блок то помеченным, то нет.
    for (const node of clone.querySelectorAll('.pd-rise, .pd-in')) {
      node.classList.remove('pd-rise', 'pd-in');
      if (node.getAttribute('class') === '') node.removeAttribute('class');
    }
    for (const node of clone.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        if (/^data-(next|react|nimg|sentry)/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }
    }
    // Скрытое поле серверного действия несёт хэш сборки: он меняется от
    // любой правки кода, и снимок каждой формы переписывается заново.
    // В разборе изменений это шум, закрывающий настоящие правки облика,
    // а для приёмки хэш не значит ничего (решение Р-186).
    for (const node of clone.querySelectorAll('input[name^="$ACTION_ID_"]')) {
      node.setAttribute('name', '$ACTION_ID');
    }
    // Тот же хэш приходит и значением поля у форм, связанных с состоянием
    // действия (`useActionState`): `{"id":"60ac…"}`. Он тоже меняется от
    // каждой правки кода, и снимок расходился между двумя прогонами
    // подряд (решение Р-198).
    // Пустые скрытые таблицы — след гидратации React: он вставляет их
    // как шаблоны для строк и убирает не сразу, поэтому их число зависит
    // от того, в какой момент снят снимок. Облика они не несут вовсе.
    for (const node of clone.querySelectorAll('table[hidden]')) node.remove();
    for (const node of clone.querySelectorAll('input[name^="$ACTION_"][value]')) {
      node.setAttribute(
        'value',
        (node.getAttribute('value') ?? '').replace(/"id":"[0-9a-f]{16,}"/g, '"id":"ACTION"'),
      );
    }
    return clone.innerHTML;
  });

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/cabinet"]')].map((a) => a.getAttribute('href')),
  );

  return { html, styles, links };
}

/** Обход раздела под одной ролью: что найдено переходом — то и снято. */
async function crawl(page, role, stabilize) {
  const pages = new Map();
  // Две очереди: неповторяющиеся маршруты разбираются раньше однотипных
  // записей, иначе перечень проектов съедает норму целиком.
  // Перечень работ получил отбор, и по умолчанию он показывает
  // действующие: завершённые работы перестали находиться обходом, а с
  // ними ушли из-под правил облика три экрана. Вкладка «Все» добавляется
  // явным маршрутом — обход срезает запрос у ссылок и сам бы туда не
  // попал (решение Р-171).
  const plain = [
    normalize(role.home),
    '/cabinet/settings',
    // Вкладки набора: обход срезает запрос у ссылок и сам бы туда не
    // попал, а без снимка вкладка выпадает из-под правил облика
    // (решения Р-171, Р-173). Недоступные роли отсеиваются сами:
    // маршрут, ответивший перенаправлением, в дерево не берётся.
    '/cabinet/projects?state=all',
    '/cabinet/manage/registry?tab=experts',
    '/cabinet/manage/registry?tab=flagged',
    '/cabinet/manage/finance?set=all',
    '/cabinet/manage/directory?tab=stages',
    '/cabinet/manage/directory?tab=colors',
  ];
  const many = [];
  const seen = new Set(plain);
  const taken = new Map();

  const next = () => (plain.length > 0 ? plain.shift() : many.shift());

  while ((plain.length > 0 || many.length > 0) && pages.size < LIMIT) {
    const route = next();
    const key = pattern(route);
    if ((taken.get(key) ?? 0) >= quotaFor(route)) continue;

    const response = await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const landed = normalize(new URL(page.url()).pathname);

    // Отказ в доступе переводит к своим работам, страница «не найдено»
    // отвечает четырьмястами четырьмя. И то и другое в дерево не берём:
    // прототип показывает то, что роли действительно доступно.
    if (response === null || response.status() >= 400 || landed !== route.split('?')[0]) continue;

    const { html, styles, links } = await snapshot(page);
    pages.set(route, { html, styles });
    taken.set(key, (taken.get(key) ?? 0) + 1);

    for (const href of links) {
      const found = normalize(href);
      if (seen.has(found) || SKIP.some((rule) => rule.test(found))) continue;
      seen.add(found);
      (quotaFor(found) === Infinity ? plain : many).push(found);
    }
  }

  const stable = new Map();
  for (const [route, page] of pages) stable.set(stabilize(route), page);
  return stable;
}

/** Путь файла прототипа для маршрута кабинета под ролью. */
function fileFor(roleKey, route) {
  // Маршрут с запросом кладётся отдельной папкой: «projects?state=all»
  // становится «projects-state-all».
  const tail = route.replace(/^\/cabinet\/?/u, '').replace(/[?=&]/gu, '-');
  return path.join(roleKey, tail, 'index.html');
}

/** Верхняя полоса прототипа: чем он является и как сменить роль. */
function demoBar(roleKey, depth) {
  const up = '../'.repeat(depth);
  const roles = ROLES.map((role) =>
    role.key === roleKey
      ? `<span class="pt-role pt-role--on">${role.label}</span>`
      : `<a class="pt-role" href="${up}${role.key}/${role.home.replace(/^\/cabinet\/?/u, '')}/">${role.label}</a>`,
  ).join('');

  return `<div class="pt-bar">
  <a class="pt-home" href="${up}">Прототип кабинета</a>
  <span class="pt-sep">вход как</span>
  ${roles}
  <a class="pt-aside" href="${up}artboards/">Артборды</a>
</div>`;
}

const BAR_CSS = `
.pt-bar { position:sticky; top:0; z-index:9999; display:flex; flex-wrap:wrap; align-items:center;
  gap:8px; padding:8px 20px; background:#14161C; color:#C9D2E0;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif; font-size:13px; }
.pt-bar a { color:#C9D2E0; text-decoration:none; }
.pt-home { font-weight:600; color:#fff !important; }
.pt-sep { color:#7C8798; }
.pt-role { padding:4px 10px; border-radius:999px; border:1px solid #39404E; }
.pt-role--on { background:#fff; color:#14161C; border-color:#fff; }
.pt-bar a.pt-role:hover { border-color:#8FA8C8; }
.pt-aside { margin-left:auto; text-decoration:underline !important; }
`;

/**
 * Страница входа в прототип.
 *
 * Выбор роли стоит полосой сверху на каждом снимке, и второй такой же
 * набор плашек под ней задваивал одно и то же. Здесь остаётся настоящий
 * экран входа — как он выглядит в кабинете (решение Р-164).
 */
function entryPage(snapshotHtml) {
  return snapshotHtml;
}



function document_(body, depth) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Личный кабинет ProDisser — прототип</title>
<link rel="stylesheet" href="${up}prototype.css">
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * Готовит снимок к выкладке: переводит ссылки кабинета на файлы прототипа
 * и обезвреживает формы — отправлять их некуда.
 */
function publishable(html, { roleKey, route, known, depth }) {
  const up = '../'.repeat(depth);
  // Маршрут, которого в дереве нет (выдача файла, экземпляр сверх нормы,
  // раздел не для этой роли), ведёт на начальный экран роли, а не в никуда.
  const fallback = `${up}${roleKey}/${ROLES.find((role) => role.key === roleKey).home.replace(/^\/cabinet\/?/u, '')}/`;

  let out = html.replace(/href="(\/cabinet[^"]*)"/gu, (whole, target) => {
    const clean = normalize(target);
    if (clean === route) return 'href="#"';
    if (SKIP.some((rule) => rule.test(clean))) return 'href="#"';
    if (!known.has(clean)) return `href="${fallback}"`;
    const tail = clean.replace(/^\/cabinet\/?/u, '');
    return `href="${up}${roleKey}/${tail}${tail === '' ? '' : '/'}"`;
  });

  out = out.replace(/<form(\s)/gu, '<form onsubmit="return false"$1');
  out = out.replace(/\s(action|formaction)="[^"]*"/gu, '');
  return out;
}

async function main() {
  const env = { DATABASE_URL: DB, DIRECT_URL: DB };
  for (const line of readFileSync(path.join(APP, '.env'), 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/u);
    if (match !== null && !['DATABASE_URL', 'DIRECT_URL'].includes(match[1])) {
      env[match[1]] = match[2];
    }
  }

  const seed = spawn('node', ['scripts/seed-artboards.ts'], {
    cwd: APP,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let printed = '';
  seed.stdout.on('data', (chunk) => (printed += chunk));
  await new Promise((resolve, reject) => {
    seed.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Наполнение отказало'))));
  });
  const { links, now } = JSON.parse(printed.trim().split('\n').at(-1));
  // Часы кабинета стоят на дне наполнения (решение Р-205).
  env.CABINET_NOW = now;

  await ensureBuild(env);
  const server = await startServer(env);
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });

  const stabilize = makeStabilizer();
  const trees = new Map();
  const styles = new Set();
  let entry = null;

  try {
    const guest = await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
    await guest.goto(`${BASE}/cabinet`, { waitUntil: 'networkidle' });
    const shot = await snapshot(guest);
    entry = shot.html;
    for (const style of shot.styles) styles.add(style);

    for (const role of ROLES) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/cabinet/enter/${links[role.key]}`, { waitUntil: 'networkidle' });

      const tree = await crawl(page, role, stabilize);
      trees.set(role.key, tree);
      for (const { styles: sheets } of tree.values()) for (const sheet of sheets) styles.add(sheet);
      console.log(`${role.label}: экранов снято ${tree.size}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // Таблицы стилей одни и те же на всех экранах: прототип отдаётся по сети,
  // и повторять их в каждом файле незачем — из мегабайтов вышли бы десятки.
  // Гарнитуры сайта лежат рядом, в `fonts/`: без них прототип набирался
  // системной заменой, и облик принимался в чужих шрифтах (решение Р-204).
  const { css: sheet, faces } = embedFonts([...styles].join('\n'), OUT);
  writeFileSync(path.join(OUT, 'prototype.css'), `${faces}\n${sheet}\n${BAR_CSS}\n`);

  let written = 0;
  for (const [roleKey, tree] of trees) {
    const known = new Set(tree.keys());
    for (const [route, page] of tree) {
      const file = fileFor(roleKey, route);
      const depth = file.split(path.sep).length - 1;
      const body =
        demoBar(roleKey, depth) +
        '\n' +
        publishable(stabilize(page.html), { roleKey, route, known, depth });
      const full = path.join(OUT, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, document_(body, depth));
      written += 1;
    }
  }

  const entryBody =
    demoBar(null, 0) +
    '\n' +
    entryPage(publishable(stabilize(entry), { roleKey: 'client', route: '/cabinet', known: new Set(), depth: 0 }));
  writeFileSync(path.join(OUT, 'index.html'), document_(entryBody, 0));
  written += 1;

  // Отпечаток исходников рядом со снимком (решение Р-214).
  writeFileSync(path.join(OUT, SOURCE_FILE), sourceNote());
  console.log(`\nПрототип собран: ${written} экранов. Каталог: design/cabinet-prototype`);

  // Копия для боевого сайта складывается тут же, а не отдельной командой:
  // отдельную команду забывают, и по адресу `/cabinet-preview/` оставался
  // бы прошлый облик кабинета (решение Р-174).
  buildPortable(path.join(APP, 'public', 'cabinet-preview'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
