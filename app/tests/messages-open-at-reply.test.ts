/**
 * Переписка открывается с полем ответа (решение Р-740). Ссылки «вся
 * переписка» и «вся · N новых» с карточки работы и кнопка письма о новом
 * сообщении (на базе — `messages-open-at-reply.db.test.ts`) ведут на
 * `/messages#body`: якорь поля уже есть (заготовки, Р-316), после потоковой
 * загрузки его доводит `HashScroll` (Р-697). Порядок ленты, окно в сто
 * сообщений (Р-636) и «Показать ранние сообщения» не меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const card = readFileSync(path.join(SRC, 'app', 'cabinet', 'projects', '[code]', 'page.tsx'), 'utf8');
const screen = readFileSync(path.join(SRC, 'app', 'cabinet', 'projects', '[code]', 'messages', 'page.tsx'), 'utf8');
const lib = readFileSync(path.join(SRC, 'lib', 'cabinet', 'messages.ts'), 'utf8');

describe('переписка открывается с полем ответа (Р-740)', () => {
  it('ссылки колонки переписки на карточке — на поле ответа', () => {
    const column = card.slice(card.indexOf("title={forClient ? 'Переписка с менеджером' : 'Переписка с клиентом'}"));
    assert.match(column.slice(0, 600), /href=\{`\/cabinet\/projects\/\$\{project\.code\}\/messages#body`\}/u);
    assert.match(column.slice(0, 900), /`вся · \$\{unread\} \$\{plural\(unread, 'новое', 'новых', 'новых'\)\}`\s*: 'вся переписка'/u);
  });

  it('кнопка письма о новом сообщении — на поле ответа', () => {
    assert.match(lib, /eventKind: 'MESSAGE_RECEIVED',[\s\S]{0,900}path: `\/cabinet\/projects\/\$\{project\.code\}\/messages#body`,/u);
    assert.doesNotMatch(lib, /path: `\/cabinet\/projects\/\$\{project\.code\}\/messages`,/u);
  });

  it('у поля ответа ветки клиента — якорь `body`, его доводит HashScroll', () => {
    assert.match(screen, /<Form\s+action=\{postMessage\}[\s\S]*?<Field\s+label=\{form\.label\}\s+name="body"/u);
    const shell = readFileSync(path.join(SRC, 'components', 'cabinet', 'Shell.tsx'), 'utf8');
    assert.match(shell, /HashScroll/u);
  });

  it('«Показать ранние сообщения» и порядок ленты прежние', () => {
    assert.match(
      screen,
      /`\/cabinet\/projects\/\$\{project\.code\}\/messages\?\$\{internalTab \? 'tab=internal&' : ''\}show=\$\{shown \+ THREAD_WINDOW\}`/u,
    );
    assert.match(screen, /await listMessages\(actor, project\.id, \{ last: shown \+ 1 \}\)/u);
  });
});
