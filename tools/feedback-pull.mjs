/**
 * Замечания с боевого сайта — локально, для разбора и правок (решение Р-279).
 *
 * Два режима.
 *
 * Выгрузка: забирает `GET /api/feedback/export` и снимки экрана к нему,
 * складывает в каталог и печатает перечень — свежие сверху, по каждому
 * время по Москве, критичность, состояние, место, устройство и текст.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/feedback-pull.mjs [каталог] [--open]
 *
 *     каталог  куда сложить feedback.json и снимки (по умолчанию
 *              ./feedback-export — каталог в .gitignore);
 *     --open   только открытые: «новое» и «в работе».
 *
 * Разбор: `PATCH /api/feedback/export/<id>` — состояние, критичность и
 * «что сделано», как на экране «Замечания» в кабинете.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/feedback-pull.mjs review <id> \
 *     [status=NEW|IN_WORK|FIXED|REJECTED] [severity=CRITICAL|HIGH|MEDIUM|LOW] \
 *     [note="что сделано"]
 *
 * Ключ доступа — переменная окружения `FEEDBACK_EXPORT_TOKEN`, та же
 * строка, что задана на сервере в `deploy/.env`; в репозиторий и в
 * переписку ключ не попадает. Адрес сайта — `FEEDBACK_EXPORT_URL` (по
 * умолчанию https://prodisser.ru). NODE_USE_ENV_PROXY нужен там, где выход в
 * сеть идёт через прокси: встроенный fetch Node иначе HTTPS_PROXY не читает.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const base = (process.env.FEEDBACK_EXPORT_URL ?? 'https://prodisser.ru').replace(/\/+$/u, '');
const token = process.env.FEEDBACK_EXPORT_TOKEN ?? '';

if (token.length < 32) {
  console.error('Не задан ключ: переменная FEEDBACK_EXPORT_TOKEN (та же строка, что в deploy/.env на сервере).');
  process.exit(2);
}

async function call(url, init = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      redirect: 'error',
    });
  } catch (error) {
    const cause = error?.cause?.code ?? error?.cause?.message ?? error.message;
    console.error(`Сайт не ответил (${cause}): ${url}`);
    console.error('Проверьте доступ среды к сайту и запуск с NODE_USE_ENV_PROXY=1.');
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`Ответ ${response.status}: ${(await response.text()).slice(0, 300)}`);
    if (response.status === 404) {
      console.error('Ключ не совпал, на сервере не задан FEEDBACK_EXPORT_TOKEN или такого замечания нет.');
    }
    process.exit(1);
  }
  return response;
}

function describe(item) {
  const shot = item.screenshotFile ? ` · снимок: ${item.screenshotFile}` : item.screenshot ? ' · есть снимок' : '';
  const lines = [
    `— ${item.createdAtMsk} МСК · ${item.severityLabel} · ${item.statusLabel} · ${item.areaLabel} · ${item.page}`,
    `  ${item.device}${item.viewportWidth ? `, ${item.viewportWidth} px` : ''}${shot} · ${item.id}`,
    ...item.text.split('\n').map((line) => `  ${line}`),
  ];
  if (item.note) lines.push(`  Что сделано: ${item.note}`);
  if (item.resolvedAtMsk) lines.push(`  Закрыто: ${item.resolvedAtMsk} МСК`);
  return lines.join('\n');
}

if (args[0] === 'review') {
  const id = args[1];
  if (!id) {
    console.error('Укажите идентификатор замечания: review <id> status=… severity=… note=…');
    process.exit(2);
  }
  const patch = {};
  for (const arg of args.slice(2)) {
    const at = arg.indexOf('=');
    if (at < 1) {
      console.error(`Не понял «${arg}»: ожидается status=…, severity=… или note=…`);
      process.exit(2);
    }
    patch[arg.slice(0, at)] = arg.slice(at + 1);
  }
  const response = await call(`${base}/api/feedback/export/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const { item } = await response.json();
  console.log('Разбор записан.');
  console.log(describe(item));
  process.exit(0);
}

const onlyOpen = args.includes('--open');
const dir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'feedback-export');
const query = onlyOpen ? '?status=NEW,IN_WORK' : '';
const data = await (await call(`${base}/api/feedback/export${query}`)).json();

mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
let shots = 0;
for (const item of data.items) {
  if (item.screenshot === null) continue;
  const response = await call(`${base}/api/feedback/export/${encodeURIComponent(item.id)}/screenshot`);
  const file = path.join(dir, 'screenshots', `${item.id}.${EXT[item.screenshot.type] ?? 'bin'}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  item.screenshotFile = path.relative(dir, file);
  shots += 1;
}
writeFileSync(path.join(dir, 'feedback.json'), JSON.stringify(data, null, 2) + '\n');

console.log(`Замечаний: ${data.total}${onlyOpen ? ' (открытые)' : ''}; снимков: ${shots}; выгрузка ${data.generatedAtMsk} МСК`);
console.log(`Каталог: ${dir}`);
for (const item of data.items) {
  console.log('');
  console.log(describe(item));
}
