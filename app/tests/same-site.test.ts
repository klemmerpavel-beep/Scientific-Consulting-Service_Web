/**
 * Запрос с чужого сайта не выводит из кабинета (решение Р-429).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { crossSiteRequest } from '../src/lib/cabinet/same-site.ts';

const headers = (values: Record<string, string>) => new Headers(values);

describe('источник запроса (Р-429)', () => {
  it('Sec-Fetch-Site решает: свой — только same-origin', () => {
    assert.equal(crossSiteRequest(headers({ 'sec-fetch-site': 'same-origin' })), false);
    for (const site of ['cross-site', 'same-site', 'none']) {
      assert.equal(crossSiteRequest(headers({ 'sec-fetch-site': site })), true, site);
    }
  });

  it('без Sec-Fetch-Site — по Origin и Host; без обоих — свой', () => {
    assert.equal(crossSiteRequest(headers({ origin: 'https://prodisser.ru', host: 'prodisser.ru' })), false);
    assert.equal(crossSiteRequest(headers({ origin: 'https://evil.example', host: 'prodisser.ru' })), true);
    assert.equal(crossSiteRequest(headers({ origin: 'null', host: 'prodisser.ru' })), true);
    assert.equal(crossSiteRequest(headers({ host: 'prodisser.ru' })), false);
  });

  it('выход проверяет источник до отзыва сессии', () => {
    const route = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'exit', 'route.ts'), 'utf8');
    const check = route.indexOf('crossSiteRequest(request.headers)');
    assert.ok(check > 0, 'выход не проверяет источник');
    assert.ok(check < route.indexOf('await revokeSession('), 'проверка после отзыва сессии');
  });
});
