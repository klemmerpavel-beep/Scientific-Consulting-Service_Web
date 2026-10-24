/**
 * Реестры ведут дальше (решение Р-757): число работ клиента — ссылка
 * на «Мои работы» с отбором «Все» и поиском по ФИО; почта и телефон —
 * ссылками `mailto:` и `tel:`, как на карточке заявки (Р-276); помеченное
 * сообщение — ссылкой на переписку своей работы и с ФИО клиента. Прежде
 * строки были текстом: к работам клиента менеджер шёл через «Мои работы»
 * в четыре действия, а помеченное сообщение подписывалось одним названием
 * работы, хотя одноимённых работ у него несколько. Выборки реестра —
 * в пределах видимого (Р-220), код работы на экран не выводится (Р-189).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { contactHref } from '../src/lib/cabinet/lead-labels.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const registry = read('app', 'cabinet', 'manage', 'registry', 'page.tsx');
const projects = read('app', 'cabinet', 'projects', 'page.tsx');
const queries = read('lib', 'cabinet', 'queries.ts');
const messages = read('lib', 'cabinet', 'messages.ts');

describe('реестр клиентов: работы и контакты — ссылками (Р-757)', () => {
  it('число работ — ссылка на «Мои работы» с отбором «Все» и поиском по ФИО', () => {
    assert.match(
      registry,
      /function clientWorksHref\(fullName: string\): string \{\s*return `\/cabinet\/projects\?\$\{new URLSearchParams\(\{ state: 'all', q: fullName \}\)\.toString\(\)\}`;/u,
    );
    assert.match(
      registry,
      /<a href=\{clientWorksHref\(client\.fullName\)\}[^>]*>\s*\{client\.projects\}\s*\{client\.active > 0 \? ` · \$\{client\.active\} в работе` : ''\}\s*<\/a>/u,
    );
  });

  it('«Мои работы» принимают отбор и поиск из адреса, поиск сотрудника идёт и по ФИО клиента', () => {
    assert.match(projects, /filter: FILTERS\.includes\(sp\.state as ProjectFilter\)/u);
    assert.match(projects, /const query = sp\.q \?\? '';/u);
    assert.match(queries, /\[\{ client: \{ fullName: \{ contains: needle, mode: 'insensitive' as const \} \} \}\]/u);
  });

  it('почта и телефон — ссылками общего правила карточки заявки', () => {
    assert.match(registry, /<ContactLinks email=\{client\.email\} phone=\{client\.phone\} \/>/u);
    assert.match(registry, /const link = contactHref\(kind, value\);/u);
    assert.match(registry, /\{link === null \? value : \(\s*<a href=\{link\}/u);
    // Прежней склейки текстом нет.
    assert.doesNotMatch(registry, /\[client\.email, client\.phone\]\.filter\(Boolean\)\.join/u);
  });

  it('правило ссылок связи: почта — mailto:, телефон — tel: с +7', () => {
    assert.equal(contactHref('email', 'client30@artboard.example'), 'mailto:client30@artboard.example');
    assert.equal(contactHref('phone', '+7 900 000-00-40'), 'tel:+79000000040');
    assert.equal(contactHref('phone', 'нет'), null);
  });

  it('ссылка в строке ячейки не раздвигает строку: отступ, а не коробка 44 px (Р-679, Р-184)', () => {
    assert.match(registry, /const LINE_LINK = \{ padding: '14px 0' \} as const;/u);
    assert.doesNotMatch(registry, /cab-mark/u);
  });
});

describe('«Контакты в переписке»: сообщение ведёт к переписке своей работы (Р-757)', () => {
  it('название работы — ссылка на её переписку у поля ответа', () => {
    assert.match(
      registry,
      /<a href=\{`\/cabinet\/projects\/\$\{project\.code\}\/messages#body`\}[^>]*>\s*\{project\.title\}\s*<\/a>/u,
    );
  });

  it('в подписи — автор, как прежде, и ФИО клиента из карточки; сам клиент под тем же именем — без повтора', () => {
    assert.match(
      registry,
      /const selfClient =\s*project !== null &&\s*message\.author\.role === 'CLIENT' &&\s*message\.author\.fullName === project\.client\.fullName;/u,
    );
    assert.match(registry, /\{selfClient \? `\$\{message\.author\.fullName\}, клиент` : message\.author\.fullName\}/u);
    assert.match(registry, /\{selfClient \? null : ` · клиент \$\{project\.client\.fullName\}`\}/u);
  });

  it('код работы на экран не выводится (Р-189)', () => {
    assert.doesNotMatch(registry, />\s*\{(?:message\.)?project\.code\}/u);
    assert.doesNotMatch(registry, /\$\{(?:message\.)?project\.code\}[^/]/u);
  });

  it('выборка помеченных — своих работ и несёт клиента для подписи (Р-220)', () => {
    const body = /export async function flaggedMessages[\s\S]*?\n\}/u.exec(messages)?.[0] ?? '';
    assert.match(body, /const scope = scopeProjects\(actor\);/u);
    assert.match(body, /where: \{ containsContactHint: true, \.\.\.CLIENT_THREAD, project: scope \}/u);
    assert.match(body, /project: \{ select: \{ code: true, title: true, client: \{ select: \{ fullName: true \} \} \} \}/u);
  });
});
