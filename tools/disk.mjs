#!/usr/bin/env node
/**
 * Работа с облачным Диском практики из сессии разработки (решение Р-266).
 *
 * Сайт и кабинет ходят на Диск сами, по расписанию на сервере
 * (`deploy/yandex-sync.sh`, `deploy/book-pull.sh`). Этот инструмент — для
 * поручений заказчика вручную: прочитать книгу заказов, выложить поправленную,
 * посмотреть, что лежит в папке. Зависимостей нет: WebDAV — это HTTP.
 *
 * Доступ берётся из окружения, в чат и в репозиторий не попадает:
 *   YANDEX_DISK_USER      логин Яндекса
 *   YANDEX_DISK_PASSWORD  пароль приложения «Файлы (WebDAV)»
 *   YANDEX_DISK_WEBDAV    адрес, по умолчанию https://webdav.yandex.ru
 *   YANDEX_DISK_FOLDER    корневая папка, по умолчанию ProDisser
 *
 * Команды (пути — внутри корневой папки):
 *   node tools/disk.mjs check                   вход и запись: создать, прочитать, удалить пробный файл
 *   node tools/disk.mjs ls [папка]              содержимое папки
 *   node tools/disk.mjs get <на Диске> <файл>   скачать
 *   node tools/disk.mjs put <файл> <на Диске>   выложить; прежняя версия уходит в «Архив/»
 *
 * Правило записи: файл на Диске никогда не затирается молча. Перед выкладкой
 * прежняя версия копируется в `Архив/<имя> <дата-время>`, а если файл успел
 * измениться после того, как его скачали этим же инструментом (метка в
 * `.disk-etags.json` рядом с локальной копией), выкладка отказывает: правку
 * заказчика на Диске перезаписывать нельзя.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const USER = process.env.YANDEX_DISK_USER?.trim() ?? '';
const PASSWORD = process.env.YANDEX_DISK_PASSWORD?.trim() ?? '';
const BASE = (process.env.YANDEX_DISK_WEBDAV?.trim() || 'https://webdav.yandex.ru').replace(/\/+$/u, '');
const FOLDER = process.env.YANDEX_DISK_FOLDER?.trim() || 'ProDisser';

function fail(text) {
  console.error(`ОШИБКА: ${text}`);
  process.exit(1);
}

if (USER === '' || PASSWORD === '') {
  fail('не заданы YANDEX_DISK_USER и YANDEX_DISK_PASSWORD — порядок в docs/GUIDE-CONNECT.md, часть 2');
}

const AUTH = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

/** Путь внутри корневой папки → адрес; каждый сегмент кодируется, как в lib/disk/paths.ts. */
function url(relative = '') {
  const parts = [FOLDER, ...relative.split('/')].filter((p) => p.length > 0).map(encodeURIComponent);
  return `${BASE}/${parts.join('/')}`;
}

async function call(method, relative, { body, headers = {}, ok = [200, 201, 204, 207] } = {}) {
  let res;
  try {
    res = await fetch(url(relative), {
      method,
      body,
      headers: { Authorization: AUTH, ...headers },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    fail(`Диск не ответил (${error.cause?.code ?? error.message}). Разрешён ли хост ${new URL(BASE).host} в сетевом доступе среды?`);
  }
  if (res.status === 401 || res.status === 403) {
    fail(`Яндекс не принял логин или пароль приложения (код ${res.status})`);
  }
  if (!ok.includes(res.status)) return { res, good: false };
  return { res, good: true };
}

/** Заводит папки по пути; уже существующая папка — не ошибка. */
async function ensureFolders(relative) {
  const parts = relative.split('/').filter(Boolean);
  for (let i = 0; i <= parts.length; i += 1) {
    const { res } = await call('MKCOL', parts.slice(0, i).join('/'), { ok: [201, 405] });
    if (![201, 405].includes(res.status)) fail(`не удалось завести папку «${parts.slice(0, i).join('/')}» (код ${res.status})`);
  }
}

/** Свойства одного файла или содержимое папки. */
async function propfind(relative, depth) {
  const { res, good } = await call('PROPFIND', relative, { headers: { Depth: String(depth) } });
  if (res.status === 404) return null;
  if (!good) fail(`не удалось прочитать «${relative || '/'}» (код ${res.status})`);
  const xml = await res.text();
  const items = [];
  for (const block of xml.split(/<\/?d:response>/iu).filter((b) => /<d:href>/iu.test(b))) {
    const pick = (tag) => block.match(new RegExp(`<d:${tag}[^>]*>([^<]*)</d:${tag}>`, 'iu'))?.[1] ?? '';
    items.push({
      href: decodeURIComponent(pick('href')),
      folder: /<d:collection\s*\/>/iu.test(block),
      size: Number(pick('getcontentlength') || 0),
      modified: pick('getlastmodified'),
      etag: pick('getetag'),
    });
  }
  return items;
}

const ETAGS = '.disk-etags.json';
function etagsFor(localFile) {
  const file = path.join(path.dirname(path.resolve(localFile)), ETAGS);
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return { file, all };
}

function stamp() {
  return new Date().toISOString().replace(/[:T]/gu, '-').replace(/\..*$/u, '');
}

const [command, a, b] = process.argv.slice(2);

if (command === 'check') {
  const probe = `.проверка-доступа-${Date.now()}.txt`;
  const text = `проверка ${new Date().toISOString()}`;
  await ensureFolders('');
  const put = await call('PUT', probe, { body: text });
  if (!put.good) fail(`запись не прошла (код ${put.res.status})`);
  const got = await call('GET', probe, { ok: [200] });
  const back = got.good ? await got.res.text() : '';
  await call('DELETE', probe, { ok: [200, 204, 404] });
  if (back !== text) fail('записанное не прочиталось обратно');
  const items = (await propfind('', 1)) ?? [];
  console.log(`вход: ${USER} — принят`);
  console.log(`папка «${FOLDER}»: запись, чтение и удаление работают`);
  console.log(`в папке: ${Math.max(items.length - 1, 0)} объектов`);
} else if (command === 'ls') {
  const items = await propfind(a ?? '', 1);
  if (items === null) fail(`папки «${a}» нет`);
  for (const item of items.slice(1)) {
    const name = item.href.replace(/\/+$/u, '').split('/').pop();
    console.log(item.folder ? `[папка] ${name}/` : `${name}  ${item.size} Б  ${item.modified}`);
  }
} else if (command === 'get') {
  if (!a || !b) fail('нужно: get <на Диске> <локальный файл>');
  const meta = await propfind(a, 0);
  if (meta === null) fail(`файла «${a}» на Диске нет`);
  const { res, good } = await call('GET', a, { ok: [200] });
  if (!good) fail(`не удалось скачать (код ${res.status})`);
  writeFileSync(b, Buffer.from(await res.arrayBuffer()));
  const { file, all } = etagsFor(b);
  all[path.basename(b)] = { remote: a, etag: meta[0].etag, modified: meta[0].modified };
  writeFileSync(file, JSON.stringify(all, null, 2));
  console.log(`скачано: ${a} → ${b} (${meta[0].size} Б, изменён ${meta[0].modified})`);
} else if (command === 'put') {
  if (!a || !b) fail('нужно: put <локальный файл> <на Диске>');
  const body = readFileSync(a);
  const meta = await propfind(b, 0);
  const { all } = etagsFor(a);
  const known = all[path.basename(a)];
  if (meta !== null && known && known.remote === b && known.etag && meta[0].etag && known.etag !== meta[0].etag) {
    fail(`«${b}» изменился на Диске после скачивания (${meta[0].modified}). Скачайте свежую версию и внесите правку в неё.`);
  }
  if (meta !== null) {
    const archived = `Архив/${path.basename(b).replace(/(\.[^.]+)?$/u, ` ${stamp()}$1`)}`;
    await ensureFolders('Архив');
    const { res, good } = await call('COPY', b, {
      headers: { Destination: url(archived), Overwrite: 'F' },
      ok: [201, 204],
    });
    if (!good) fail(`прежняя версия не сохранена в архив (код ${res.status}) — выкладка отменена`);
    console.log(`прежняя версия: ${archived}`);
  }
  await ensureFolders(path.posix.dirname(b) === '.' ? '' : path.posix.dirname(b));
  const { res, good } = await call('PUT', b, { body });
  if (!good) fail(`выкладка не прошла (код ${res.status})`);
  const after = await propfind(b, 0);
  console.log(`выложено: ${a} → ${b} (${body.byteLength} Б)`);
  if (after?.[0]?.size && after[0].size !== body.byteLength) fail('размер на Диске не совпал с локальным');
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').match(/Команды[\s\S]*?\n \*\n/u)?.[0] ?? '');
  process.exit(command ? 1 : 0);
}
