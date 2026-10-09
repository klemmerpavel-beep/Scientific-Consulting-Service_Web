/**
 * Заведение учётной записи одной транзакцией (решение Р-542): сбой после
 * создания записи — например, при записи в журнал — не оставляет учётную
 * запись без профиля и журнала, и повтор с тем же адресом проходит.
 *
 * Сбой воспроизводится триггером базы на строку журнала этого теста.
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('заведение учётной записи атомарно (Р-542)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');

  const email = `atomic-${stamp}@example.org`;
  let head: Actor;
  const fn = `test_fail_user_created_${stamp}`;
  const trigger = `test_fail_user_created_${stamp}`;

  before(async () => {
    const user = await prisma.user.create({
      data: { email: `atomic-head-${stamp}@example.org`, fullName: 'Руководитель Заведения', role: 'HEAD' },
    });
    head = { id: user.id, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    const made = await prisma.user.findMany({ where: { email }, select: { id: true } });
    const ids = made.map((row) => row.id);
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: ids } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: head.id } });
    await prisma.user.deleteMany({ where: { id: { in: [...ids, head.id] } } });
  });

  it('сбой записи в журнал откатывает учётную запись, профиль и письмо; повтор проходит', async () => {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN ` +
        `IF NEW."action" = 'USER_CREATED' AND NEW."actorId" = '${head.id}' THEN RAISE EXCEPTION 'сбой журнала'; END IF; ` +
        `RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    await assert.rejects(
      admin.createUser(head, { email, fullName: 'Куратор Атомарный', role: 'EXPERT', position: 'доцент' }),
    );
    assert.equal(await prisma.user.count({ where: { email } }), 0, 'учётная запись осталась без журнала');

    await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "AuditEvent"`);
    const user = await admin.createUser(head, { email, fullName: 'Куратор Атомарный', role: 'EXPERT', position: 'доцент' });
    const profile = await prisma.expertProfile.findUnique({ where: { userId: user.id } });
    assert.equal(profile?.position, 'доцент');
    assert.equal(await prisma.notificationOutbox.count({ where: { userId: user.id, eventKind: 'CURATOR_INVITED' } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: head.id, action: 'USER_CREATED', objectId: user.id } }), 1);
  });
});
