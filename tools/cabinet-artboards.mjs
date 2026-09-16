/**
 * Снятие артбордов кабинета.
 *
 * Для девяти страниц сайта порядок обычный: макет `design/*.dc.html` —
 * источник истины, компонент порождается из него генератором `dc-to-tsx`.
 * Для кабинета порядок обратный и это отдельное решение (Р-130): генератор
 * не умеет ни серверных компонентов, ни выборок из базы, поэтому код
 * кабинета пишется вручную, а артборд снимается с работающего экрана.
 *
 * Так артборд не может разойтись с кодом: он из него и получен. Ценность
 * не в источнике истины, а в приёмке — облик открывается в браузере без
 * сервера, показывается заказчику, хранится в истории и после каждой
 * правки экрана пересобирается одной командой.
 *
 * Персональные данные: снимок делается только с базы артбордов, наполненной
 * `scripts/seed-artboards.ts` вымышленными людьми. Скрипт отказывается
 * работать, если в адресе базы нет слова «artboard».
 *
 * Запуск (из корня репозитория):
 *   node tools/cabinet-artboards.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '/var/tmp/pwtest/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(ROOT, 'design', 'cabinet');
const BROWSER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.ARTBOARD_PORT ?? 3210);
const BASE = `http://127.0.0.1:${PORT}`;

const DB =
  process.env.ARTBOARD_DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5433/prodisser_artboards';

if (!/artboard/i.test(DB)) {
  console.error(
    'Артборды снимаются только с базы артбордов: в адресе нет слова «artboard».\n' +
      'Снимок с рабочей базы вынес бы в открытый репозиторий фамилии клиентов.',
  );
  process.exit(1);
}

/**
 * Артборд заводится на образец композиции, а не на каждый маршрут:
 * набор из двадцати четырёх файлов устарел бы в первый же день.
 */
const BOARDS = [
  { file: '01-enter', role: null, path: '/cabinet', title: 'Вход', about: 'Запрос одноразовой ссылки. Ответ одинаков для любого исхода: форма не должна показывать, кто является клиентом практики.' },
  { file: '02-projects', role: 'client', path: '/cabinet/projects', title: 'Мои работы', about: 'Блок «сейчас от вас требуется» — композиционный центр экрана; ниже перечень работ с состоянием и сроком.' },
  { file: '03-project', role: 'client', path: '__project__', title: 'Проект', about: 'Трекер этапов, лента событий, участники. Контактов участников в разметке нет: их нет и в объекте, переданном компоненту.' },
  { file: '04-stage', role: 'client', path: '__stage__', title: 'Этап и материалы', about: 'Версии с автором, датой и размером; опубликованные комментарии; согласование этапа клиентом.' },
  { file: '05-messages', role: 'client', path: '__messages__', title: 'Переписка', about: 'Единственный канал — с менеджером. Сообщение с телефоном помечено детектором, но не заблокировано.' },
  { file: '06-payments', role: 'client', path: '__payments__', title: 'Счета и документы', about: 'Договор, транши с состоянием оплаты, документы. Начислений эксперту и маржи на экране клиента нет.' },
  { file: '07-request', role: 'client', path: '/cabinet/request', title: 'Новая заявка', about: 'Заявка из кабинета пишется тем же маршрутом, что и заявка с сайта; состав полей заморожен журналом согласий.' },
  { file: '08-states', role: 'client', path: '/cabinet/projects/PD-0000-000', title: 'Состояния', about: 'Работа не найдена: состояние называет причину и следующий шаг, а не сообщает «здесь пусто». Тем же экраном отвечает обращение к чужому проекту — существование чужой работы не подтверждается.' },
  { file: '09-queue', role: 'manager', path: '/cabinet/manage', title: 'Очередь заявок', about: 'Модерация заявок и светофор по срокам: что сорвано, что сорвётся, где работа стоит из-за клиента.' },
  { file: '10-import', role: 'head', path: '__import__', title: 'Перенос книги заказов', about: 'Отчёт предпросмотра: итоги, замечания по классам с номерами строк, расхождения цвета с текстом, совпадения ФИО.' },
  { file: '11-analytics', role: 'head', path: '/cabinet/manage/analytics', title: 'Аналитика', about: 'Плитки, три автоматических вывода и графики собственной вёрстки на шкале синего из токенов сайта.' },
  { file: '12-audit', role: 'head', path: '/cabinet/manage/audit', title: 'Журнал действий', about: 'Фильтры по периоду, действующему лицу, виду действия и коду проекта; выгрузка в CSV записывается в журнал.' },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Поднять рабочую сборку на базе артбордов. */
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

/**
 * Разметка страницы, приведённая к самодостаточному виду.
 *
 * Вырезаются сценарии оживления: артборд — это облик, а не работающее
 * приложение, и половина кода Next без сервера всё равно бесполезна.
 * Таблицы стилей встраиваются: файл должен открываться с диска.
 */
async function snapshot(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main');

  const styles = await page.evaluate(async () => {
    const texts = [];
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      try {
        const response = await fetch(link.href);
        texts.push(await response.text());
      } catch {
        // стиль недоступен — пропускаем, он и так не попадёт в артборд
      }
    }
    // Встроенные блоки стилей раздела: токены и общие правила кабинета.
    // Искать нужно по всему документу, а не только в голове: разметка
    // раздела подключает их в теле, и снимок без них терял всю палитру.
    for (const style of document.querySelectorAll('style')) texts.push(style.textContent ?? '');
    return texts;
  });

  const html = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    for (const node of clone.querySelectorAll('script, link, style, next-route-announcer')) {
      node.remove();
    }
    // Служебные пометки React и Next: в артборде они шум.
    for (const node of clone.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        if (/^data-(next|react|nimg|sentry)/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }
    }
    return clone.outerHTML;
  });

  return { html, styles: styles.join('\n') };
}

/**
 * Артборд должен открываться с диска и не меняться от запуска к запуску.
 *
 * Правила @font-face ведут на файлы сборки, которых рядом с артбордом нет:
 * они вырезаются, гарнитура берётся из стека, как и в макетах сайта.
 * Идентификаторы записей выдаются базой заново при каждом наполнении, и
 * без приведения к постоянному виду каждый снимок отличался бы от
 * предыдущего одними только ключами.
 */
function stabilize(text) {
  const withoutFonts = text.replace(/@font-face\s*\{[^}]*\}/g, '');
  const ids = new Map();
  return withoutFonts.replace(/\b(c[a-z0-9]{24})\b/g, (id) => {
    if (!ids.has(id)) ids.set(id, `id-${String(ids.size + 1).padStart(2, '0')}`);
    return ids.get(id);
  });
}

/** Оболочка артборда — та же, что у макетов сайта. */
function wrap({ title, about, path: route, html, styles }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<x-dc>
<!-- @template name="ProDisser — кабинет: ${title}" description="${about}" -->
<!--
  Артборд кабинета. В отличие от макетов страниц сайта, он не источник
  истины, а снимок облика работающего экрана (решение Р-130): код кабинета
  пишется вручную, генератор dc-to-tsx к нему не применяется.

  Маршрут: ${route}
  Пересборка: node tools/cabinet-artboards.mjs

  Данные вымышлены. Гарнитуры объявлены стеком, как и в макетах сайта:
  файлы шрифтов в макеты не встраиваются, поэтому при открытии с диска
  подставляется системная гарнитура из того же стека.
-->
<style>
${styles}
</style>
${html}
</x-dc>
</body>
</html>
`;
}

async function main() {
  const env = { DATABASE_URL: DB, DIRECT_URL: DB };
  const envFile = path.join(APP, '.env');
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match !== null && !['DATABASE_URL', 'DIRECT_URL'].includes(match[1])) {
      env[match[1]] = match[2];
    }
  }

  // Ссылки входа выдаёт наполнение: своей учётной записи у скрипта нет.
  const seed = spawn('node', ['scripts/seed-artboards.ts'], {
    cwd: APP,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  seed.stdout.on('data', (chunk) => (out += chunk));
  await new Promise((resolve, reject) => {
    seed.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Наполнение отказало'))));
  });
  const { links } = JSON.parse(out.trim().split('\n').at(-1));

  const server = await startServer(env);
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
  mkdirSync(OUT, { recursive: true });

  try {
    // Маршруты, зависящие от данных, выясняются на месте: коды проектов и
    // идентификаторы загрузок меняются при каждом наполнении.
    const contexts = {};
    for (const [role, token] of Object.entries(links)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/cabinet/enter/${token}`, { waitUntil: 'networkidle' });
      contexts[role] = page;
    }

    const client = contexts.client;
    await client.goto(`${BASE}/cabinet/projects`, { waitUntil: 'networkidle' });
    const projectHref = await client.locator('a[href^="/cabinet/projects/PD-"]').first().getAttribute('href');
    await client.goto(BASE + projectHref, { waitUntil: 'networkidle' });
    // Для артборда берётся этап в согласовании, а не первый попавшийся:
    // именно это состояние показывает действие клиента.
    const stageLinks = await client.locator('a[href^="/cabinet/stages/"]').all();
    const stageHref = await (stageLinks[2] ?? stageLinks[0]).getAttribute('href');

    const head = contexts.head;
    await head.goto(`${BASE}/cabinet/manage/import`, { waitUntil: 'networkidle' });
    const batchHref = await head.locator('a[href^="/cabinet/manage/import/"]').first().getAttribute('href');

    const resolved = {
      __project__: projectHref,
      __stage__: stageHref,
      __messages__: `${projectHref}/messages`,
      __payments__: `${projectHref}/payments`,
      __import__: batchHref,
    };

    for (const board of BOARDS) {
      const route = resolved[board.path] ?? board.path;
      const page = board.role === null
        ? await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage()
        : contexts[board.role];
      const { html, styles } = await snapshot(page, BASE + route);
      const file = path.join(OUT, `${board.file}.dc.html`);
      writeFileSync(
        file,
        stabilize(wrap({ ...board, path: stabilize(route), html, styles })),
      );
      console.log(`${board.file}.dc.html — ${board.title} (${route})`);
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\nАртбордов снято: ${BOARDS.length}. Каталог: design/cabinet`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
