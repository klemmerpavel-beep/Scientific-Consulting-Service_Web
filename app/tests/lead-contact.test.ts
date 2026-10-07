/**
 * Связь с заявителем из карточки заявки в одно нажатие (решение Р-276).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contactHref } from '../src/lib/cabinet/lead-labels.ts';

describe('ссылка для связи с заявителем', () => {
  it('телефон с восьмёрки и с семёрки приводится к +7', () => {
    assert.equal(contactHref('phone', '8 (999) 970-55-64'), 'tel:+79999705564');
    assert.equal(contactHref('phone', '7 999 970 55 64'), 'tel:+79999705564');
    assert.equal(contactHref('phone', '+7 999 970-55-64'), 'tel:+79999705564');
  });

  it('почта даёт mailto', () => {
    assert.equal(contactHref('email', ' client@example.org '), 'mailto:client@example.org');
  });

  it('адрес не подставляет в письмо текст и получателей (Р-433)', () => {
    const href = contactHref('email', 'a@b.ru?body=Срочно%20переведите&subject=Оплата')!;
    assert.ok(href.startsWith('mailto:'));
    assert.doesNotMatch(href.slice('mailto:'.length), /[?&=]/u, href);
    assert.equal(contactHref('email', 'ivan+work@почта.рф'), `mailto:ivan%2Bwork@${encodeURIComponent('почта.рф')}`);
  });

  it('нечитаемое значение ссылки не получает', () => {
    assert.equal(contactHref('phone', 'звоните вечером'), null);
    assert.equal(contactHref('email', 'не почта'), null);
  });
});
