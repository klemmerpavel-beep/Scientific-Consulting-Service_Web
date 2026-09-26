/**
 * Вход по одноразовой ссылке на настоящей базе: выдача, погашение,
 * одноразовость, срок годности, ограничение частоты и отзыв сессий.
 *
 * Тест пропускается, если адрес базы не задан: в CI шаг проверок идёт без
 * поднятой базы, и это осознанно — матрица прав базы не требует. На стенде
 * разработки достаточно указать DATABASE_URL.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('вход по одноразовой ссылке', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const auth = await import('../src/lib/cabinet/auth.ts');
  const { createRawToken, digest } = await import('../src/lib/cabinet/token.ts');

  const email = `test-${Date.now()}@example.org`;
  let userId = '';

  before(async () => {
    const user = await prisma.user.create({
      data: { email, fullName: 'Тестовый Клиент', role: 'CLIENT' },
    });
    userId = user.id;
  });

  after(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.loginToken.deleteMany({ where: { userId } });
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: email } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  /** Выдать ссылку в обход почты: канал в тестах не настроен. */
  async function issue(): Promise<string> {
    const token = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        requestIp: '127.0.0.1',
      },
    });
    return token.value;
  }

  it('действующая ссылка открывает сессию', async () => {
    const value = await issue();
    const session = await auth.consumeLoginToken(value, '127.0.0.1', 'node-test');
    assert.ok(session, 'сессия не открыта');
    const actor = await auth.resolveSession(session);
    assert.ok(actor);
    assert.equal(actor.id, userId);
    assert.equal(actor.role, 'CLIENT');
  });

  it('ссылка срабатывает один раз', async () => {
    const value = await issue();
    assert.ok(await auth.consumeLoginToken(value, '127.0.0.1', null));
    assert.equal(await auth.consumeLoginToken(value, '127.0.0.1', null), null);
  });

  it('просроченная ссылка не срабатывает', async () => {
    const token = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId,
        expiresAt: new Date(Date.now() - 1000),
        requestIp: '127.0.0.1',
      },
    });
    assert.equal(await auth.consumeLoginToken(token.value, '127.0.0.1', null), null);
  });

  it('подделанный верификатор не срабатывает', async () => {
    const value = await issue();
    const [selector] = value.split('.');
    const forged = `${selector}.${createRawToken().verifier}`;
    assert.equal(await auth.consumeLoginToken(forged, '127.0.0.1', null), null);
    // Настоящая ссылка после неудачной попытки продолжает работать.
    assert.ok(await auth.consumeLoginToken(value, '127.0.0.1', null));
  });

  it('отзыв сессии закрывает доступ немедленно', async () => {
    const session = await auth.consumeLoginToken(await issue(), '127.0.0.1', null);
    assert.ok(session);
    await auth.revokeSession(session);
    assert.equal(await auth.resolveSession(session), null);
  });

  it('обезличенная учётная запись не восстанавливается из сессии', async () => {
    const session = await auth.consumeLoginToken(await issue(), '127.0.0.1', null);
    assert.ok(session);
    await prisma.user.update({ where: { id: userId }, data: { status: 'ERASED' } });
    assert.equal(await auth.resolveSession(session), null);
    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  it('отзыв всех сессий гасит и невыданные ссылки', async () => {
    const pending = await issue();
    const session = await auth.consumeLoginToken(await issue(), '127.0.0.1', null);
    assert.ok(session);
    await auth.revokeAllSessions(userId);
    assert.equal(await auth.resolveSession(session), null);
    assert.equal(await auth.consumeLoginToken(pending, '127.0.0.1', null), null);
  });

  it('неизвестный адрес и превышение частоты не различимы снаружи', async () => {
    // Канал объявляется настроенным: иначе запрос кончается на первой же
    // проверке и до разбора адреса не доходит.
    const unknown = `nobody-${Date.now()}@example.org`;
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      assert.equal(await auth.requestLoginLink(unknown, '10.0.0.1'), 'unknown_email');
      for (let i = 0; i < 5; i += 1) {
        await prisma.loginAttempt.create({
          data: { emailNormalized: unknown, ip: '10.0.0.1', outcome: 'sent' },
        });
      }
      assert.equal(await auth.requestLoginLink(unknown, '10.0.0.1'), 'rate_limited');
    } finally {
      delete process.env.SMTP_HOST;
      await prisma.loginAttempt.deleteMany({ where: { emailNormalized: unknown } });
    }
  });

  it('отказы по частоте не продлевают запор адреса', async () => {
    // Прежде в счёт адреса шли и сами отказы: пять чужих запросов запирали
    // человека, а каждая его попытка продлевала запор ещё на час (Р-232).
    const target = `locked-${Date.now()}@example.org`;
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      for (let i = 0; i < 10; i += 1) {
        await prisma.loginAttempt.create({
          data: { emailNormalized: target, ip: `10.1.0.${i}`, outcome: 'rate_limited' },
        });
      }
      assert.equal(await auth.requestLoginLink(target, '10.1.1.1'), 'unknown_email');
    } finally {
      delete process.env.SMTP_HOST;
      await prisma.loginAttempt.deleteMany({ where: { emailNormalized: target } });
    }
  });

  it('ненастроенная почта называется прямо, а не обещает письмо', async () => {
    // Прежде исход был «отправлено» при любом положении дел: человек ждал
    // письма, которого не существует, и считал, что перепутал адрес.
    assert.equal(process.env.SMTP_HOST, undefined, 'канал в проверках задан');
    assert.equal(await auth.requestLoginLink(email, '10.0.0.2'), 'channel_off');

    const attempt = await prisma.loginAttempt.findFirst({
      where: { emailNormalized: email },
      orderBy: { occurredAt: 'desc' },
    });
    assert.equal(attempt?.outcome, 'channel_off');

    // Ответ одинаков для любого адреса: о существовании учётной записи
    // состояние канала не говорит ничего.
    const unknown = `nobody-channel-${Date.now()}@example.org`;
    assert.equal(await auth.requestLoginLink(unknown, '10.0.0.2'), 'channel_off');
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: unknown } });
  });

  it('письмо уходит после ответа формы, если отправку отложили', async () => {
    // Знакомый адрес отвечал на время отправки письма дольше незнакомого,
    // и по времени ответа можно было перебирать клиентов (решение Р-239).
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      let deferred: (() => Promise<void>) | null = null;
      const outcome = await auth.requestLoginLink(email, '10.0.0.9', {
        defer: (task) => {
          deferred = task;
        },
      });
      assert.equal(outcome, 'sent');
      assert.ok(deferred !== null, 'отправка не отложена');
      const before = await prisma.loginAttempt.count({ where: { emailNormalized: email, ip: '10.0.0.9' } });
      assert.equal(before, 0, 'исход записан до отправки');
      await (deferred as unknown as () => Promise<void>)();
      const attempt = await prisma.loginAttempt.findFirst({
        where: { emailNormalized: email, ip: '10.0.0.9' },
      });
      assert.equal(attempt?.outcome, 'send_failed');
    } finally {
      delete process.env.SMTP_HOST;
    }
  });

  it('неудачная отправка записывается как неудачная', async () => {
    // Узел заведомо не отвечает, поэтому отправка не проходит. Наружу это
    // по-прежнему «отправлено» — иначе отказ выдал бы, что адрес существует.
    process.env.SMTP_HOST = 'smtp.invalid';
    try {
      assert.equal(await auth.requestLoginLink(email, '10.0.0.3'), 'sent');
      const attempt = await prisma.loginAttempt.findFirst({
        where: { emailNormalized: email, ip: '10.0.0.3' },
        orderBy: { occurredAt: 'desc' },
      });
      assert.equal(attempt?.outcome, 'send_failed', 'в журнал легло «отправлено» без отправки');
    } finally {
      delete process.env.SMTP_HOST;
    }
  });
});
