/**
 * Проверка доступности работающего кабинета axe-core (решение Р-899).
 *
 * `tools/cabinet-axe.mjs` идёт по снимкам прототипа, а снимок несёт тело
 * страницы без её головы (Р-137): правила уровня документа — заголовок
 * `<title>`, язык, мета-тег области просмотра — он проверить не может.
 * Аудит 15.11.2026 нашёл так пустой заголовок на 269 экранах из 271 при
 * нуле нарушений по снимкам. Этот обход открывает экраны настоящей сборки
 * под каждой ролью и проверяет документ целиком.
 *
 * Обход идёт по ссылкам от начального экрана роли, как съёмка прототипа,
 * с той же нормой на однотипные экраны. Полный набор правил WCAG 2.0—2.2
 * уровней A и AA, ширины 1440 и 390 px.
 *
 * Персональные данные: только база снимков с вымышленными людьми
 * (`scripts/seed-artboards.ts`); скрипт отказывается работать, если в
 * адресе базы нет слова «artboard». axe-core в `package.json` не заводится
 * (Р-168): берётся из того же каталога, что и браузер инструментов съёмки.
 *
 * Запуск (из корня репозитория):
 *   node tools/cabinet-axe-live.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '/var/tmp/pwtest/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const BROWSER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const AXE = readFileSync('/var/tmp/pwtest/node_modules/axe-core/axe.min.js', 'utf8');
const PORT = Number(process.env.AXE_LIVE_PORT ?? 3212);
const BASE = `http://127.0.0.1:${PORT}`;

const DB =
  process.env.ARTBOARD_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5433/prodisser_artboards';

if (!/artboard/i.test(DB)) {
  console.error('Обход идёт только по базе снимков: в адресе нет слова «artboard».');
  process.exit(1);
}

/** Маршруты, которые отдают не страницу, а файл, либо гасят сеанс. */
const SKIP = [
  /^\/cabinet\/enter\b/u,
  /^\/cabinet\/files\b/u,
  /^\/cabinet\/lead-files\b/u,
  /\/export\b/u,
  /^\/cabinet\/exit\b/u,
  /^\/cabinet\/downloads\b/u,
  /\/files\/[^/]+$/u,
  /\/screenshot$/u,
];

/** Норма на однотипные экраны: обход показывает устройство, а не всю базу. */
const QUOTA = [
  [/^\/cabinet\/projects\/[^/]+$/u, 3],
  [/^\/cabinet\/projects\/[^/]+\/[a-z]+$/u, 6],
  [/^\/cabinet\/stages\/[^/]+$/u, 4],
  [/^\/cabinet\/manage\/import\/[^/]+$/u, 1],
  [/^\/cabinet\/manage\/leads\/[^/]+$/u, 1],
  [/^\/cabinet\/manage\/experts\/[^/]+$/u, 1],
  [/^\/cabinet\/manage\/team\/[^/]+$/u, 1],
  [/^\/cabinet\/manage\/ads\/doc\/[^/]+$/u, 1],
];
const LIMIT = 70;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (href) => {
  const bare = href.split('#')[0].split('?')[0];
  return bare.length > 1 ? bare.replace(/\/$/u, '') : bare;
};
const quotaKey = (route) => QUOTA.find(([rule]) => rule.test(route))?.[0].source ?? route;
const quotaOf = (route) => QUOTA.find(([rule]) => rule.test(route))?.[1] ?? 1;

async function run(command, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: APP,
      env: { ...process.env, ...env },
      stdio: ['ignore', capture ? 'pipe' : 'ignore', 'inherit'],
    });
    let out = '';
    if (capture) child.stdout.on('data', (chunk) => (out += chunk));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} ${args.join(' ')} — код ${code}`))));
  });
}

async function main() {
  const env = { DATABASE_URL: DB, DIRECT_URL: DB };
  const envFile = path.join(APP, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (match !== null && !['DATABASE_URL', 'DIRECT_URL'].includes(match[1])) env[match[1]] = match[2];
    }
  }

  // Ссылки входа выдаёт наполнение; часы кабинета — на дне наполнения (Р-205).
  const seeded = await run('node', ['scripts/seed-artboards.ts'], env, true);
  const { links, now } = JSON.parse(seeded.trim().split('\n').at(-1));
  env.CABINET_NOW = now;

  if (!existsSync(path.join(APP, '.next', 'standalone', 'server.js'))) await run('npm', ['run', 'build'], env);

  const server = spawn('node', ['.next/standalone/server.js'], {
    cwd: APP,
    env: { ...process.env, ...env, PORT: String(PORT), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let up = false;
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    try {
      up = (await fetch(`${BASE}/cabinet`)).ok;
    } catch {
      await wait(500);
    }
  }
  if (!up) {
    server.kill();
    throw new Error('Сборка не поднялась за двадцать секунд');
  }

  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
  let total = 0;
  let screens = 0;
  try {
    for (const [role, token] of Object.entries(links)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      // Ключ гасится нажатием, а не открытием ссылки (Р-232).
      await page.goto(`${BASE}/cabinet/enter/${token}`, { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/cabinet/enter')),
        page.click('button[type=submit]'),
      ]);
      const home = clean(new URL(page.url()).pathname);
      const queue = [home];
      const seen = new Set(queue);
      const taken = new Map();
      let visited = 0;
      while (queue.length > 0 && visited < LIMIT) {
        const route = queue.shift();
        const key = quotaKey(route);
        if ((taken.get(key) ?? 0) >= quotaOf(route)) continue;
        taken.set(key, (taken.get(key) ?? 0) + 1);
        visited += 1;
        for (const [width, height] of [[1440, 900], [390, 844]]) {
          await page.setViewportSize({ width, height });
          await page.goto(BASE + route, { waitUntil: 'networkidle' });
          await page.waitForTimeout(300); // появление блока статуса — 220 мс
          await page.addScriptTag({ content: AXE });
          const found = await page.evaluate(async () =>
            (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map(
              (v) => `${v.id} ×${v.nodes.length}: ${v.nodes[0].target.join(' ')}`,
            ),
          );
          if (found.length > 0) {
            total += found.length;
            console.log(`${role}\t${width}\t${route}\n   ${found.join('\n   ')}`);
          }
        }
        for (const href of await page.locator('a[href^="/cabinet"]').evaluateAll((list) => list.map((a) => a.getAttribute('href')))) {
          const next = clean(href);
          if (seen.has(next) || SKIP.some((rule) => rule.test(next))) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      screens += visited;
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`Нарушений axe: ${total}; экранов ${screens}; роли ${Object.keys(links).join(', ')}; ширины 1440, 390`);
  // Нарушения есть — команда завершается ошибкой: её можно ставить в приёмку.
  if (total > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
