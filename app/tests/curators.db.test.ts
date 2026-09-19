/**
 * Разграничение между кураторами на настоящей базе (решение Р-149).
 *
 * Проверяется не разрешение как таковое — это дело матрицы и её проверок, —
 * а то, что сужение выборки работает сквозь запрос: менеджер не получает
 * чужую работу ни перечнем, ни прямым обращением по коду, ни светофором,
 * ни реестром клиентов.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('разграничение между кураторами', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const staff = (id: string, role: 'MANAGER' | 'HEAD'): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const mine = await prisma.user.create({
      data: { email: `curator-a-${stamp}@example.org`, fullName: 'Куратор А', role: 'MANAGER' },
    });
    const other = await prisma.user.create({
      data: { email: `curator-b-${stamp}@example.org`, fullName: 'Куратор Б', role: 'MANAGER' },
    });
    const boss = await prisma.user.create({
      data: { email: `head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const serviceType = await prisma.serviceType.create({
      data: { code: `type-${stamp}`, name: 'Сопровождение' },
    });
    const clientA = await prisma.clientProfile.create({
      data: { fullName: `Клиент А ${stamp}`, normalizedName: `client-a-${stamp}` },
    });
    const clientB = await prisma.clientProfile.create({
      data: { fullName: `Клиент Б ${stamp}`, normalizedName: `client-b-${stamp}` },
    });

    const own = await prisma.project.create({
      data: {
        code: `PD-TEST-${stamp}-A`,
        clientId: clientA.id,
        serviceTypeId: serviceType.id,
        title: 'Своя работа',
        managerId: mine.id,
        status: 'ACTIVE',
      },
    });
    const foreign = await prisma.project.create({
      data: {
        code: `PD-TEST-${stamp}-B`,
        clientId: clientB.id,
        serviceTypeId: serviceType.id,
        title: 'Чужая работа',
        managerId: other.id,
        status: 'ACTIVE',
      },
    });
    // Сорванный срок на чужой работе: он не должен попасть в светофор.
    await prisma.stage.create({
      data: {
        projectId: foreign.id,
        position: 1,
        title: 'Этап чужой работы',
        state: 'IN_PROGRESS',
        dueOn: new Date(Date.now() - 86_400_000),
      },
    });

    Object.assign(ids, {
      mine: mine.id,
      other: other.id,
      boss: boss.id,
      own: own.id,
      foreign: foreign.id,
      ownCode: own.code,
      foreignCode: foreign.code,
      clientB: clientB.id,
    });
  });

  after(async () => {
    await prisma.stage.deleteMany({ where: { projectId: ids.foreign } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: [ids.own!, ids.foreign!] } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: [ids.own!, ids.foreign!] } } });
    await prisma.project.deleteMany({ where: { id: { in: [ids.own!, ids.foreign!] } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.clientB } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.mine!, ids.other!, ids.boss!] } } });
    await prisma.$disconnect();
  });

  it('менеджер видит свою работу и не видит чужую', async () => {
    const actor = staff(ids.mine!, 'MANAGER');
    // Набор «все» и поиск по коду: проверка про разграничение, а не про
    // отбор, а в базе стенда работ больше страницы (решение Р-171).
    const own = (await queries.listProjects(actor, { filter: 'all', query: ids.ownCode! })).rows;
    const alien = (await queries.listProjects(actor, { filter: 'all', query: ids.foreignCode! })).rows;
    const codes = [...own, ...alien].map((project) => project.code);
    assert.ok(codes.includes(ids.ownCode!));
    assert.ok(!codes.includes(ids.foreignCode!));
    // Чужая работа по прямому адресу неотличима от несуществующей.
    assert.equal(await queries.projectByCode(actor, ids.foreignCode!), null);
  });

  it('руководитель видит обе работы', async () => {
    const boss = staff(ids.boss!, 'HEAD');
    const codes = (
      await Promise.all(
        [ids.ownCode!, ids.foreignCode!].map((code) =>
          queries.listProjects(boss, { filter: 'all', query: code }),
        ),
      )
    ).flatMap((list) => list.rows.map((p) => p.code));
    assert.ok(codes.includes(ids.ownCode!));
    assert.ok(codes.includes(ids.foreignCode!));
  });

  it('светофор и реестр клиентов у менеджера тоже сужены', async () => {
    const actor = staff(ids.mine!, 'MANAGER');
    const light = await queries.trafficLight(actor);
    assert.ok(!light.overdue.some((stage) => stage.project.code === ids.foreignCode));

    const registry = await queries.clientRegistry(actor);
    assert.ok(!registry.some((row) => row.id === ids.clientB));
  });

  it('передать работу другому куратору может только руководитель', async () => {
    await assert.rejects(
      () => projects.assignManager(staff(ids.mine!, 'MANAGER'), ids.own!, ids.other!),
      AccessDenied,
    );

    await projects.assignManager(staff(ids.boss!, 'HEAD'), ids.own!, ids.other!);
    const moved = await prisma.project.findUnique({
      where: { id: ids.own },
      select: { managerId: true },
    });
    assert.equal(moved?.managerId, ids.other);

    // Прежний куратор работу больше не видит, новый — видит.
    assert.equal(await queries.projectByCode(staff(ids.mine!, 'MANAGER'), ids.ownCode!), null);
    assert.notEqual(await queries.projectByCode(staff(ids.other!, 'MANAGER'), ids.ownCode!), null);
  });

  it('куратором нельзя назначить того, кто не ведёт работы', async () => {
    const client = await prisma.user.create({
      data: { email: `client-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    await assert.rejects(
      () => projects.assignManager(staff(ids.boss!, 'HEAD'), ids.foreign!, client.id),
      /менеджер или руководитель/iu,
    );
    await prisma.user.delete({ where: { id: client.id } });
  });
});
