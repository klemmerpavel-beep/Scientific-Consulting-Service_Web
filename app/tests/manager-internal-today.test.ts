/**
 * Ответ руководителя и внутреннее сообщение по работе видны на «Сегодня»
 * (решение Р-739, дополняет Р-304; Р-336). На базе —
 * `manager-internal-today.db.test.ts`; здесь — плашки, ссылки и то, что
 * клиенту число внутренних сообщений не считается вовсе.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const attention = readFileSync(path.join(SRC, 'lib', 'cabinet', 'attention.ts'), 'utf8');
const manage = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');
const card = readFileSync(path.join(SRC, 'app', 'cabinet', 'projects', '[code]', 'page.tsx'), 'utf8');
const digest = readFileSync(path.join(SRC, 'lib', 'cabinet', 'head-digest.ts'), 'utf8');

describe('ответ руководителя и внутренняя переписка на «Сегодня» (Р-739)', () => {
  it('дела строятся тем же счётом, что у ветки и вкладки, и только менеджеру', () => {
    assert.match(attention, /actor\.role === 'MANAGER' \? staffThreadUnread\(actor, actor\.id\) : Promise\.resolve\(0\),/u);
    assert.match(attention, /internalInbox\(actor\),/u);
    assert.match(attention, /headReply: sources\.headReplies > 0 \? \[\{ count: sources\.headReplies \}\] : \[\],/u);
    assert.match(attention, /internal: sources\.internal,/u);
  });

  it('«Ответ руководителя · N новых» ведёт на /cabinet/head', () => {
    const block = manage.slice(manage.indexOf('...parts.headReply.map('), manage.indexOf('...parts.internal.map('));
    assert.match(block, /title: 'Ответ руководителя',/u);
    assert.match(block, /mark: `\$\{row\.count\} \$\{plural\(row\.count, 'новое', 'новых', 'новых'\)\}`,/u);
    assert.match(block, /href: '\/cabinet\/head',/u);
  });

  it('дело по работе — название, клиент, ссылка на вкладку «Внутренняя»', () => {
    const block = manage.slice(manage.indexOf('...parts.internal.map('), manage.indexOf('...parts.comment.map('));
    assert.match(block, /title: row\.title,/u);
    assert.match(block, /mark: `внутренняя переписка · \$\{row\.count\}/u);
    assert.match(block, /detail: row\.client,/u);
    assert.match(block, /href: `\/cabinet\/projects\/\$\{row\.code\}\/messages\?tab=internal#body`,/u);
  });

  it('«Новых ответов» в нижней карточке — тем же набором', () => {
    assert.match(manage, /const \{ headReplies \} = sources;/u);
    assert.doesNotMatch(manage, /await staffThreadUnread\(/u);
  });

  it('в утренней сводке виды подписаны', () => {
    assert.match(digest, /headReply: 'ответ руководителя',/u);
    assert.match(digest, /internal: 'внутренняя переписка по работе',/u);
  });

  it('на карточке работы «внутренняя · N новых» — только участнику ветки', () => {
    assert.match(card, /const internalNew = can\(actor, 'INTERNAL_MESSAGE', ref\) \? await internalUnread\(actor, project\.id\) : 0;/u);
    assert.match(card, /internalNew > 0\s*\? \{\s*href: `\/cabinet\/projects\/\$\{project\.code\}\/messages\?tab=internal#body`,\s*label: `внутренняя · \$\{internalNew\}/u);
  });
});

describe('сообщения клиента — впереди новых дел менеджера (Р-739, Р-257)', () => {
  it('«N непрочитанных» клиента стоят до «Ответа руководителя» и внутренней переписки: общий предел свёртки их не вытесняет', () => {
    const manage = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');
    const unread = manage.indexOf('...parts.unread.map(');
    assert.ok(unread > 0 && unread < manage.indexOf('...parts.headReply.map(') && unread < manage.indexOf('...parts.internal.map('));
  });
});
