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
    const unknown = `nobody-${Date.now()}@example.org`;
    assert.equal(await auth.requestLoginLink(unknown, '10.0.0.1'), 'unknown_email');
    for (let i = 0; i < 5; i += 1) {
      await prisma.loginAttempt.create({
        data: { emailNormalized: unknown, ip: '10.0.0.1', outcome: 'sent' },
      });
    }
    assert.equal(await auth.requestLoginLink(unknown, '10.0.0.1'), 'rate_limited');
    await prisma.loginAttempt.deleteMany({ where: { emailNormalized: unknown } });
  });
});
