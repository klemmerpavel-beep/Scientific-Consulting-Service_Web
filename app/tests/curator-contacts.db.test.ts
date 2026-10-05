/**
 * Способы связи и профиль куратора на настоящей базе (требование Э-10,
 * решение Р-330): способы связи куратора видят менеджер его работы и
 * руководитель, но не менеджер чужой работы и не клиент; в данные экранов
 * клиента они не попадают; свой профиль куратор читает сам, и строка
 * «Так вас видит клиент» совпадает со строкой клиента в «О работе».
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'k'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('способы связи и профиль куратора (Э-10)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const { expertLine } = await import('../src/lib/cabinet/access.ts');
  const { projectByCode } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
    ...extra,
  });
  const ref = () => ({ id: ids.project!, clientId: ids.client!, managerId: ids.manager!, expertId: ids.curator! });
  const PHONE = `+7 900 ${String(stamp).slice(-3)}-44-55`;

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `ck-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, otherManager, headUser, clientUser, curatorUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('mgr2', 'MANAGER'),
      make('head', 'HEAD'),
      make('cl', 'CLIENT'),
      make('cur', 'EXPERT'),
    ]);
    await prisma.expertProfile.create({
      data: { userId: curatorUser.id, ndaSignedAt: NDA, degree: 'к.т.н.', specialtyCode: '2.8.6', university: 'Горный университет' },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `ck клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `ck-${stamp}`, name: 'Проверка связи' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CK-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки связи',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      otherManager: otherManager.id,
      head: headUser.id,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
    await channels.addContact(who(curatorUser.id, 'EXPERT'), {
      kind: 'PHONE_CALL',
      value: PHONE,
      note: 'после 18:00',
      preferred: true,
    });
  });

  after(async () => {
    const users = [ids.manager!, ids.otherManager!, ids.head!, ids.clientUser!, ids.curator!];
    await prisma.contactChannel.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('менеджер работы и руководитель видят способы связи куратора', async () => {
    for (const actor of [who(ids.manager!, 'MANAGER'), who(ids.head!, 'HEAD')]) {
      const rows = await channels.curatorContacts(actor, ref());
      assert.deepEqual(
        rows.map((row) => [row.kind, row.value, row.preferred]),
        [['PHONE_CALL', PHONE, true]],
      );
    }
  });

  it('менеджер чужой работы, клиент и сам куратор — нет', async () => {
    for (const actor of [
      who(ids.otherManager!, 'MANAGER'),
      who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }),
      who(ids.curator!, 'EXPERT'),
    ]) {
      await assert.rejects(channels.curatorContacts(actor, ref()), /не разрешено/u, actor.role);
    }
  });

  it('в данные экрана клиента способы связи куратора не попадают', async () => {
    const seen = await projectByCode(who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), ids.code!);
    assert.ok(seen !== null);
    const text = JSON.stringify(seen, (_key, value) => (typeof value === 'bigint' ? String(value) : value));
    assert.ok(!text.includes(PHONE), 'телефон куратора в данных клиента');
    assert.ok(!text.includes('после 18:00'), 'оговорка куратора в данных клиента');
  });

  it('свой профиль куратор читает сам; строка для клиента — та же, что в «О работе»', async () => {
    const own = await admin.ownCuratorProfile(who(ids.curator!, 'EXPERT'));
    assert.equal(own?.degree, 'к.т.н.');
    assert.equal(own?.university, 'Горный университет');
    assert.deepEqual(own?.ndaSignedAt, NDA);
    const seen = await projectByCode(who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), ids.code!);
    assert.equal(expertLine(own ?? null), expertLine(seen!.expert!.expertProfile));
    assert.equal(expertLine(own ?? null), 'к.т.н., 2.8.6');
    assert.equal(await admin.ownCuratorProfile(who(ids.manager!, 'MANAGER')), null);
  });
});
