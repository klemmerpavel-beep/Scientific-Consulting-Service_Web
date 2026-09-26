/**
 * Разбор и сверка одноразовых токенов входа. Проверяется то, что не требует
 * базы: форма токена, свойства свёртки и нормализация адреса.
 *
 * Секрет подставляется до импорта модуля: он читается при вычислении свёртки,
 * и без него вход не поднимается — это намеренно.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.SESSION_SECRET = 'x'.repeat(48);

const {
  createRawToken,
  digest,
  loginLink,
  loginRateExceeded,
  maskEmail,
  normalizeEmail,
  RATE_PER_EMAIL,
  RATE_PER_EMAIL_IP,
  RATE_PER_IP,
  sameDigest,
  SESSION_MAX_DAYS,
  SESSION_TTL_DAYS,
  splitToken,
  TOKEN_TTL_MINUTES,
} = await import('../src/lib/cabinet/token.ts');

describe('форма токена', () => {
  it('токен состоит из селектора и верификатора', () => {
    const token = createRawToken();
    assert.equal(token.value, `${token.selector}.${token.verifier}`);
    assert.ok(token.selector.length >= 16);
    assert.ok(token.verifier.length >= 40);
  });

  it('два токена не совпадают', () => {
    const a = createRawToken();
    const b = createRawToken();
    assert.notEqual(a.value, b.value);
    assert.notEqual(a.selector, b.selector);
  });

  it('разбирается ровно то, что было собрано', () => {
    const token = createRawToken();
    const parsed = splitToken(token.value);
    assert.ok(parsed !== null);
    assert.equal(parsed.selector, token.selector);
    assert.equal(parsed.verifier, token.verifier);
  });

  it('любая неожиданная форма токеном не является', () => {
    for (const bad of [
      '',
      'без-точки',
      'слишком.много.точек',
      '.пустой-селектор',
      'пустой-верификатор.',
      'про%бел.значение',
      'значение.с пробелом',
    ]) {
      assert.equal(splitToken(bad), null, `принято негодное значение: ${bad}`);
    }
  });
});

describe('свёртка', () => {
  it('одно значение даёт одну свёртку', () => {
    assert.equal(digest('значение'), digest('значение'));
  });

  it('разные значения дают разные свёртки', () => {
    assert.notEqual(digest('а'), digest('б'));
  });

  it('сам верификатор в свёртке не читается', () => {
    const token = createRawToken();
    const d = digest(token.verifier);
    assert.ok(!d.includes(token.verifier));
    assert.match(d, /^[0-9a-f]{64}$/);
  });

  it('сравнение свёрток различает совпадение и расхождение', () => {
    const a = digest('одно');
    const b = digest('другое');
    assert.equal(sameDigest(a, a), true);
    assert.equal(sameDigest(a, b), false);
    assert.equal(sameDigest(a, a.slice(0, 10)), false);
  });
});

describe('адрес и ссылка', () => {
  it('адрес приводится к нижнему регистру без краевых пробелов', () => {
    assert.equal(normalizeEmail('  Ivan.Petrov@Example.ORG '), 'ivan.petrov@example.org');
  });

  it('ссылка ведёт на маршрут входа кабинета', () => {
    const token = createRawToken();
    assert.ok(loginLink(token.value).endsWith(`/cabinet/enter/${token.value}`));
  });

  it('срок жизни ссылки — пятнадцать минут', () => {
    assert.equal(TOKEN_TTL_MINUTES, 15);
  });
});

describe('адрес владельца ссылки на странице входа (Р-251)', () => {
  it('видны первая буква и домен, остальное скрыто', () => {
    assert.equal(maskEmail('ivan.petrov@mail.ru'), 'i***@mail.ru');
    assert.equal(maskEmail('a@example.org'), 'a***@example.org');
  });

  it('длина имени по маске не угадывается', () => {
    assert.equal(maskEmail('ab@x.ru'), maskEmail('abcdefgh@x.ru'));
    assert.equal(maskEmail('ab@x.ru'), 'a***@x.ru');
  });

  it('кириллица и знаки вне основной плоскости не рвутся посередине', () => {
    assert.equal(maskEmail('иван@почта.рф'), 'и***@почта.рф');
    assert.equal(maskEmail('😀x@ex.org'), '😀***@ex.org');
  });

  it('адрес без имени или без @ не показывается вовсе', () => {
    assert.equal(maskEmail('@mail.ru'), '***');
    assert.equal(maskEmail('nobody'), '***');
  });
});

describe('частота ссылок входа (Р-251)', () => {
  const calm = { byPair: 0, byEmail: 0, byIp: 0, knownIp: false };

  it('потолок адреса выше предела пары', () => {
    assert.ok(RATE_PER_EMAIL > RATE_PER_EMAIL_IP);
    assert.ok(RATE_PER_IP >= RATE_PER_EMAIL);
  });

  it('пара «адрес + IP» ограничена и для своего узла', () => {
    assert.equal(loginRateExceeded({ ...calm, byPair: RATE_PER_EMAIL_IP - 1 }), false);
    assert.equal(loginRateExceeded({ ...calm, byPair: RATE_PER_EMAIL_IP }), true);
    assert.equal(loginRateExceeded({ ...calm, byPair: RATE_PER_EMAIL_IP, knownIp: true }), true);
  });

  it('чужие узлы, исчерпав потолок адреса, не запирают владельца на его узле', () => {
    const exhausted = { ...calm, byEmail: RATE_PER_EMAIL };
    assert.equal(loginRateExceeded(exhausted), true, 'новый узел проходит сверх потолка');
    assert.equal(loginRateExceeded({ ...exhausted, knownIp: true }), false, 'свой узел заперт');
  });

  it('предел узла действует на любые адреса', () => {
    assert.equal(loginRateExceeded({ ...calm, byIp: RATE_PER_IP }), true);
    assert.equal(loginRateExceeded({ ...calm, byIp: RATE_PER_IP, knownIp: true }), true);
  });
});

describe('срок сессии (Р-251)', () => {
  it('абсолютный предел длиннее скользящего срока', () => {
    assert.equal(SESSION_MAX_DAYS, 90);
    assert.ok(SESSION_MAX_DAYS > SESSION_TTL_DAYS);
  });
});
