#!/usr/bin/env node
/**
 * Сообщить Яндексу об изменённых страницах по протоколу IndexNow (Р-1024).
 *
 * Запуск из корня репозитория:
 *   node tools/indexnow.mjs             адреса sitemap.xml, изменённые за восемь дней
 *   node tools/indexnow.mjs --all       все адреса sitemap.xml
 *   node tools/indexnow.mjs --dry-run   показать, что ушло бы, и ничего не отправлять
 *
 * Выполняется последним шагом «Выката на боевой сервер». Отказ Яндекса или
 * сети выкат не роняет: сайт уже обновлён, а страницы робот найдёт и по
 * sitemap.xml — код выхода всегда 0, причина пишется в журнал.
 */

import { ENDPOINT, HOST, KEY, parseSitemap, payload, pickChanged, today } from '../app/scripts/indexnow.mjs';

const args = new Set(process.argv.slice(2));
const base = `https://${HOST}`;

try {
  const sitemap = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(20000) });
  if (!sitemap.ok) throw new Error(`sitemap.xml отвечает ${sitemap.status}`);
  const entries = parseSitemap(await sitemap.text());
  const urls = args.has('--all') ? entries.map(({ loc }) => loc) : pickChanged(entries, today());
  console.log(`IndexNow: в карте ${entries.length} адресов, к отправке ${urls.length}`);
  for (const url of urls) console.log(`  ${url}`);
  if (urls.length === 0 || args.has('--dry-run')) process.exit(0);

  // Яндекс проверяет право на отправку по файлу ключа: без него запрос бесполезен.
  const keyFile = await fetch(`${base}/${KEY}.txt`, { signal: AbortSignal.timeout(20000) });
  if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) throw new Error(`файл ключа ${base}/${KEY}.txt недоступен или не совпадает с ключом`);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload(urls)),
    signal: AbortSignal.timeout(20000),
  });
  // 200 — принято; 202 — принято, ключ ещё проверяется (первые отправки).
  const note = response.status === 200 ? 'принято' : response.status === 202 ? 'принято, ключ проверяется' : `отказ: ${(await response.text()).slice(0, 300)}`;
  console.log(`IndexNow: Яндекс ответил ${response.status} — ${note}`);
} catch (error) {
  console.log(`IndexNow: не отправлено — ${error instanceof Error ? error.message : error}`);
}
