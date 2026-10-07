/**
 * Пришёл ли запрос с чужого сайта (решение Р-429).
 *
 * Серверные действия Next проверяют источник сами, обработчики маршрутов —
 * нет. Браузер сообщает источник заголовком `Sec-Fetch-Site`; старый
 * браузер без него присылает `Origin` у запроса POST. Без обоих запрос
 * считается своим: так поступает и сам Next, и иначе выход перестал бы
 * работать в старых браузерах.
 */
export function crossSiteRequest(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null) return site !== 'same-origin';
  const origin = headers.get('origin');
  if (origin === null) return false;
  try {
    return new URL(origin).host !== headers.get('host');
  } catch {
    return true;
  }
}
