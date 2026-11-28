/**
 * IndexNow: сообщение Яндексу об изменённых страницах сразу после выката
 * (решение Р-1024).
 *
 * Без него новая страница ждёт, пока робот сам дойдёт до sitemap.xml, либо
 * ручного «Переобхода страниц» в Вебмастере. Протокол IndexNow принимает
 * перечень адресов запросом POST; право на него подтверждает файл с ключом
 * в корне сайта — `app/public/<ключ>.txt`. Ключ не секрет: он опубликован
 * по самому протоколу.
 *
 * Что отправляется: адреса sitemap.xml, у которых `lastmod` не старше
 * WINDOW_DAYS дней. Дата страницы меняется только вместе с её макетом
 * (Р-1010), а выкат — субботний (Р-626): окно в восемь дней покрывает всё,
 * что изменилось за цикл, и не шлёт Яндексу страницы без изменений.
 *
 * Логика — здесь, запуск — `tools/indexnow.mjs` (как у `seo-sync.mjs`):
 * её импортирует тест, а образ приложения собирается из одного `app`.
 */

export const HOST = 'prodisser.ru';
export const KEY = '8479f775f2a9ac4b5a6b2b73e1e9d459';
export const ENDPOINT = 'https://yandex.com/indexnow';
export const WINDOW_DAYS = 8;

/** Адреса и даты из sitemap.xml: `[{ loc, lastmod }]`; `lastmod` может отсутствовать. */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gu)].map(([, body]) => ({
    loc: /<loc>([^<]+)<\/loc>/u.exec(body)?.[1]?.trim() ?? '',
    lastmod: /<lastmod>([^<]+)<\/lastmod>/u.exec(body)?.[1]?.trim().slice(0, 10) ?? null,
  })).filter((entry) => entry.loc);
}

/**
 * Адреса, изменённые не раньше чем за `days` дней до `today` (ГГГГ-ММ-ДД).
 * Адрес без даты не отправляется: о его изменении ничего не известно.
 * Чужой узел в карте — ошибка карты: такие адреса отбрасываются.
 */
export function pickChanged(entries, today, days = WINDOW_DAYS) {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  const floor = from.toISOString().slice(0, 10);
  return entries
    .filter(({ loc, lastmod }) => lastmod && lastmod >= floor && lastmod <= today && new URL(loc).host === HOST)
    .map(({ loc }) => loc);
}

/** Тело запроса POST по справочнику Яндекса: host, key, urlList. */
export function payload(urls) {
  return { host: HOST, key: KEY, urlList: urls };
}

/** Сегодняшняя дата по Москве — по ней же ставятся даты страниц. */
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
}
