/**
 * Ссылка входа гасится нажатием, а не открытием (решение Р-232).
 *
 * Предпросмотр ссылки в мессенджере и проверщик ссылок в почте делают
 * GET и HEAD сами. Пока ключ гасился обработчиком GET, ссылка тратилась
 * раньше человека, а первый запросивший получал сессию. Проверки держат
 * устройство: у адреса входа нет обработчика запросов, страница ключ не
 * гасит, гасит его серверное действие формы.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const ENTER = path.join(SRC, 'app', 'cabinet', 'enter', '[token]');

describe('вход по ссылке', () => {
  it('у адреса входа нет обработчика GET', () => {
    assert.equal(existsSync(path.join(ENTER, 'route.ts')), false);
  });

  it('страница только показывает кнопку и ключ не гасит', () => {
    const page = readFileSync(path.join(ENTER, 'page.tsx'), 'utf8');
    assert.doesNotMatch(page, /consumeLoginToken/u);
    assert.match(page, /action=\{enterByLink\}/u);
    assert.match(page, /referrer: 'no-referrer'/u);
  });

  it('ключ гасит действие формы, и прежняя сессия браузера отзывается', () => {
    const actions = readFileSync(path.join(SRC, 'app', 'cabinet', 'actions.ts'), 'utf8');
    const body = actions.slice(actions.indexOf('export async function enterByLink'));
    const end = body.indexOf('\n}\n');
    const fn = body.slice(0, end);
    assert.match(fn, /consumeLoginToken/u);
    assert.match(fn, /revokeSession/u);
  });

  it('cookie сессии стирается тем же набором свойств, что выдаётся', () => {
    // `delete` отправлял запись без Secure, и браузер отвергал её для
    // имени с приставкой __Host-: отозванное значение оставалось.
    const session = readFileSync(path.join(SRC, 'lib', 'cabinet', 'session.ts'), 'utf8');
    assert.doesNotMatch(session, /jar\.delete\(/u);
    assert.match(session, /sessionCookieOptions\(0\)/u);
  });
});
