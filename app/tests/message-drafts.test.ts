/**
 * Заготовки сообщений (требование Т-20, решение Р-316): заготовка
 * подставляет текст и ничего не отправляет; чужая роли заготовка не
 * открывается; ссылки заготовок — ссылки, а не кнопки.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { draftText, draftsFor } from '../src/lib/cabinet/message-drafts.ts';

const context = { stage: 'Обзор литературы', today: '3 октября 2026' };

describe('заготовки клиента (Т-20)', () => {
  it('созвон и перенос срока текущего этапа', () => {
    assert.deepEqual(
      draftsFor('CLIENT').map((draft) => draft.label),
      ['Попросить созвон', 'Попросить перенести срок этапа'],
    );
    assert.equal(draftText('CLIENT', 'call', context), 'Прошу созвониться по работе. Удобное время: ');
    assert.equal(
      draftText('CLIENT', 'due', context),
      'Прошу перенести срок этапа «Обзор литературы» на . Причина: ',
    );
    assert.equal(draftText('CLIENT', 'due', { ...context, stage: null }), 'Прошу перенести срок этапа на . Причина: ');
  });

  it('неизвестный ключ и чужая роль — ничего', () => {
    assert.equal(draftText('CLIENT', 'nope', context), null);
    assert.equal(draftText('CLIENT', undefined, context), null);
    assert.equal(draftText('EXPERT', 'call', context), null);
  });
});

describe('разметка заготовок', () => {
  it('заготовки — ссылки на тот же экран, а не кнопки отправки', () => {
    const page = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'messages', 'page.tsx'),
      'utf8',
    );
    const start = page.indexOf('{draftsFor(actor.role).map(');
    assert.ok(start > 0, 'ссылок заготовок на экране нет');
    const block = page.slice(start, page.indexOf('))}', start));
    assert.match(block, /href=\{`\/cabinet\/projects\/\$\{project\.code\}\/messages\?draft=\$\{item\.key\}/u);
    assert.doesNotMatch(block, /type="submit"|<Button|<Form/u, 'заготовка отправляет сообщение сама');
  });
});
