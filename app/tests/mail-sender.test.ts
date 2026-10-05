/**
 * Отправитель писем и адрес для ответа (решение Р-278).
 *
 * Описание сервиса подставляет незаданную переменную пустой строкой, и
 * через `??` письмо уходило с пустым полем From. Проверка держит правило
 * `||` и честный ответ «канал не настроен», когда отправителя нет вовсе.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { mailConfigured, mailReplyTo, mailSender } from '../src/lib/cabinet/mail.ts';

const KEYS = ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'MAIL_REPLY_TO'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

describe('отправитель писем', () => {
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('пустой SMTP_FROM не становится отправителем — берётся SMTP_USER', () => {
    setEnv({ SMTP_HOST: 'smtp.example.org', SMTP_FROM: '', SMTP_USER: 'site@example.org' });
    assert.equal(mailSender(), 'site@example.org');
    assert.equal(mailConfigured(), true);
  });

  it('без отправителя канал не настроен, а не шлёт письмо с пустым From', () => {
    setEnv({ SMTP_HOST: 'smtp.example.org', SMTP_FROM: '', SMTP_USER: '' });
    assert.equal(mailSender(), null);
    assert.equal(mailConfigured(), false);
  });

  it('заданный SMTP_FROM главнее учётной записи', () => {
    setEnv({ SMTP_HOST: 'smtp.example.org', SMTP_FROM: 'ProDisser <site@example.org>', SMTP_USER: 'login' });
    assert.equal(mailSender(), 'ProDisser <site@example.org>');
  });

  it('пустой адрес для ответа заголовка не даёт', () => {
    setEnv({ MAIL_REPLY_TO: '' });
    assert.equal(mailReplyTo(), undefined);
    setEnv({ MAIL_REPLY_TO: 'info@example.org' });
    assert.equal(mailReplyTo(), 'info@example.org');
  });
});
