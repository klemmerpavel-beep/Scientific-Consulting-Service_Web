/**
 * Поле и кнопка переписки называют адресата (решение Р-726): у
 * менеджера и руководителя на ветке «С клиентом» — «Сообщение клиенту» и
 * «Отправить клиенту», на «Внутренней» — «…руководителю (клиент не
 * видит)» / «…менеджеру работы…» и «Отправить руководителю» / «Отправить
 * менеджеру»; короткая форма на карточке работы — «Отправить клиенту».
 * Клиенту подписи прежние.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { messageFormTexts } from '../src/lib/cabinet/staff-texts.ts';

const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]');

describe('подписи формы переписки', () => {
  it('клиенту — прежние', () => {
    for (const thread of ['client', 'internal'] as const) {
      assert.deepEqual(messageFormTexts('CLIENT', thread), { label: 'Новое сообщение', button: 'Отправить' });
    }
  });

  it('ветка «С клиентом» — клиенту', () => {
    for (const role of ['MANAGER', 'HEAD'] as const) {
      assert.deepEqual(messageFormTexts(role, 'client'), { label: 'Сообщение клиенту', button: 'Отправить клиенту' });
    }
  });

  it('«Внутренняя» — руководителю или менеджеру, клиент не видит', () => {
    assert.deepEqual(messageFormTexts('MANAGER', 'internal'), {
      label: 'Сообщение руководителю (клиент не видит)',
      button: 'Отправить руководителю',
    });
    assert.deepEqual(messageFormTexts('HEAD', 'internal'), {
      label: 'Сообщение менеджеру работы (клиент не видит)',
      button: 'Отправить менеджеру',
    });
  });
});

describe('экраны берут подписи по ветке и роли', () => {
  const messages = readFileSync(path.join(SCREENS, 'messages', 'page.tsx'), 'utf8');
  const card = readFileSync(path.join(SCREENS, 'page.tsx'), 'utf8');

  it('экран переписки: обе формы', () => {
    assert.match(messages, /messageFormTexts\(actor\.role, internalTab \? 'internal' : 'client'\)/u);
    assert.equal(messages.match(/label=\{form\.label\}/gu)?.length, 2);
    assert.equal(messages.match(/<Button>\{form\.button\}<\/Button>/gu)?.length, 2);
    assert.doesNotMatch(messages, /label="Новое сообщение"|<Button>Отправить<\/Button>/u);
  });

  it('карточка работы: сотрудникам — «Отправить клиенту»', () => {
    assert.match(card, /<Button>\{forClient \? 'Отправить' : messageFormTexts\(actor\.role, 'client'\)\.button\}<\/Button>/u);
    assert.match(card, /label=\{forClient \? 'Сообщение' : 'Сообщение клиенту'\}/u);
  });
});
