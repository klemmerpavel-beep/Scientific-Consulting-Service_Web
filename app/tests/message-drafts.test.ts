/**
 * Заготовки сообщений (требования Т-20 и М-21, решения Р-316 и Р-317): заготовка
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
    assert.equal(draftText('CLIENT', 'remind', context), null, 'заготовка куратора открылась клиенту');
    assert.equal(draftText('CLIENT', 'nope', context), null);
    assert.equal(draftText('CLIENT', undefined, context), null);
    assert.equal(draftText('EXPERT', 'call', context), null);
  });
});

describe('заготовки куратора (М-21)', () => {
  it('напоминание, итог созвона с датой по часам кабинета, перенос срока', () => {
    assert.deepEqual(
      draftsFor('MANAGER').map((draft) => draft.label),
      ['Напоминание о материалах', 'Итог созвона', 'Перенос срока', 'Напоминание об оплате'],
    );
    assert.match(
      draftText('MANAGER', 'remind', context) ?? '',
      /^Напоминаем: для этапа «Обзор литературы» ждём от вас материалы/u,
    );
    assert.equal(draftText('MANAGER', 'callnote', context), 'Итог созвона 3 октября 2026: договорились — ');
    assert.match(draftText('HEAD', 'reschedule', context) ?? '', /^Предлагаем перенести срок этапа «Обзор литературы»/u);
    assert.equal(draftText('MANAGER', 'call', context), null, 'заготовка клиента открылась куратору');
  });

  it('напоминание об оплате — назначение и срок, без сумм (РК-10, Р-345)', () => {
    const text = draftText('HEAD', 'payment', { ...context, payment: { title: 'Аванс за главу 2', date: '1 октября 2026' } }) ?? '';
    assert.match(text, /^Напоминаем: срок оплаты «Аванс за главу 2» прошёл 1 октября 2026\./u);
    assert.doesNotMatch(text, /\d[\d\s]*₽|руб/u, 'сумма в заготовке');
    assert.match(draftText('MANAGER', 'payment', context) ?? '', /срок очередной оплаты по договору прошёл/u);
    assert.equal(draftText('CLIENT', 'payment', context), null, 'заготовка практики открылась клиенту');
  });

  it('дело «Напомнить клиенту» ведёт в переписку с заготовкой', () => {
    const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');
    assert.match(page, /todo: 'Напомнить клиенту о материалах',[\s\S]{0,240}messages\?draft=remind/u);
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
