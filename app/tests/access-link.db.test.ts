/**
 * Выдача ссылки входа руководителем из кабинета (решение Р-195).
 *
 * Пропускается без заданного адреса базы: запускается командой
 * `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('ссылка входа из кабинета', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const { digest, splitToken } = await import('../src/lib/cabinet/token.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const who = (id: string, role: 'CLIENT' | 'MANAGER' | 'HEAD'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
      // Служебные роли наборов заводятся с закрытым доступом: уведомления
      // о новых заявках ставятся всем действующим менеджерам и
      // руководителям, и каждый оставшийся от прежних прогонов набор
      // растил общую очередь стенда, пока набор на саму очередь не
      // переставал видеть свою строку в пачке (решение Р-195).
    const head = await prisma.user.create({
      data: {
        email: `link-head-${stamp}@example.org`,
        fullName: 'Руководитель',
        role: 'HEAD',
        status: 'SUSPENDED',
      },
    });
    const client = await prisma.user.create({
      data: { email: `link-client-${stamp}@example.org`, fullName: 'Заказчик', role: 'CLIENT' },
    });
    const suspended = await prisma.user.create({
      data: {
        email: `link-off-${stamp}@example.org`,
        fullName: 'Приостановленный',
        role: 'CLIENT',
        status: 'SUSPENDED',
      },
    });
    ids.head = head.id;
    ids.client = client.id;
    ids.suspended = suspended.id;
  });

  it('руководитель выдаёт рабочую ссылку и она ложится в журнал', async () => {
    const issued = await admin.issueAccessLink(who(ids.head!, 'HEAD'), ids.client!, '127.0.0.1');
    assert.match(issued.link, /\/cabinet\/enter\//u);
    assert.ok(issued.expiresAt.getTime() > Date.now());

    // Ссылка действительно открывает вход: селектор найден, а свёртка
    // проверочной части сходится.
    const value = issued.link.split('/cabinet/enter/')[1]!;
    const token = splitToken(value);
    assert.ok(token !== null, 'ссылка не разбирается на селектор и проверочную часть');
    const row = await prisma.loginToken.findUnique({ where: { selector: token.selector } });
    assert.ok(row !== null, 'токен не заведён');
    assert.equal(row.userId, ids.client);
    assert.equal(row.usedAt, null);
    assert.equal(row.verifierHash, digest(token.verifier));

    const logged = await prisma.auditEvent.findFirst({
      where: { action: 'ACCESS_LINK_ISSUED', objectId: ids.client },
    });
    assert.ok(logged !== null, 'выдача ссылки не попала в журнал действий');
  });

  it('клиенту и менеджеру выдача закрыта', async () => {
    await assert.rejects(
      () => admin.issueAccessLink(who(ids.client!, 'CLIENT'), ids.head!),
      AccessDenied,
      'клиент выдал себе ссылку на чужую запись',
    );
    await assert.rejects(
      () => admin.issueAccessLink(who(ids.head!, 'MANAGER'), ids.client!),
      AccessDenied,
      'менеджер получил доступ к чужим учётным записям',
    );
  });

  it('приостановленной записи ссылка не выдаётся', async () => {
    await assert.rejects(
      () => admin.issueAccessLink(who(ids.head!, 'HEAD'), ids.suspended!),
      /приостановлен/iu,
      'ссылка выдана записи с закрытым доступом',
    );
  });
});
