/**
 * Одноразовый ключ формы на настоящей базе (решение Р-934).
 *
 * Запуск: DATABASE_URL=… node --test tests/form-once.db.test.ts
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'k'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('одноразовый ключ формы (Р-934)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { claimFormKey, once } = await import('../src/lib/cabinet/form-once.ts');
  const { FORM_KEY_TTL_MS, FORM_REPLAY, newFormKey } = await import('../src/lib/cabinet/form-key.ts');

  const made: string[] = [];
  const fresh = () => {
    const key = newFormKey();
    made.push(key);
    return key;
  };

  after(async () => {
    await prisma.formKey.deleteMany({ where: { key: { in: made } } });
    await prisma.$disconnect();
  });

  it('первая отправка выполняется, вторая с тем же ключом — отказ, запись одна', async () => {
    const key = fresh();
    let writes = 0;
    assert.equal(await once('user-1', key, async () => (writes += 1)), 1);
    await assert.rejects(() => once('user-1', key, async () => (writes += 1)), new RegExp(FORM_REPLAY, 'u'));
    assert.equal(writes, 1);
  });

  it('две одновременные отправки одной формы: проходит ровно одна', async () => {
    const key = fresh();
    let writes = 0;
    const run = () => once('user-1', key, async () => (writes += 1));
    const results = await Promise.allSettled([run(), run(), run()]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(writes, 1);
  });

  it('отказ записи освобождает ключ: ту же форму можно отправить снова', async () => {
    const key = fresh();
    await assert.rejects(() => once('user-1', key, async () => Promise.reject(new Error('сумма неверна'))), /сумма неверна/u);
    assert.equal(await prisma.formKey.count({ where: { key } }), 0);
    assert.equal(await once('user-1', key, async () => 'записано'), 'записано');
  });

  it('без ключа и с ключом чужого вида запись идёт без защиты', async () => {
    assert.equal(await once('user-1', null, async () => 'а'), 'а');
    assert.equal(await once('user-1', 'не ключ', async () => 'б'), 'б');
  });

  it('просроченные ключи убираются при следующем занятии', async () => {
    const old = fresh();
    await prisma.formKey.create({ data: { key: old, userId: 'user-1', createdAt: new Date(Date.now() - FORM_KEY_TTL_MS - 60_000) } });
    await claimFormKey('user-1', fresh());
    assert.equal(await prisma.formKey.count({ where: { key: old } }), 0);
  });
});
