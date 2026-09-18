/**
 * Контур эксперта на настоящей базе (решение Р-150).
 *
 * Проверяется то, что нельзя увидеть в матрице: договор поручения обработки
 * персональных данных работает как условие доступа, назначение ограничивает
 * выборку сквозь запрос, а чужое вознаграждение эксперту недоступно.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('контур эксперта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  /** Эксперт с договором поручения и без него — различие в одном поле. */
  const expert = (id: string, signed: boolean): Actor => ({
    id,
    role: 'EXPERT',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: signed ? new Date('2026-01-01T00:00:00Z') : null,
  });

  before(async () => {
    const mine = await prisma.user.create({
      data: { email: `expert-a-${stamp}@example.org`, fullName: 'Эксперт А', role: 'EXPERT' },
    });
    const other = await prisma.user.create({
      data: { email: `expert-b-${stamp}@example.org`, fullName: 'Эксперт Б', role: 'EXPERT' },
    });
    const manager = await prisma.user.create({
      data: { email: `curator-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    for (const id of [mine.id, other.id]) {
      await prisma.expertProfile.create({
        data: { userId: id, specialization: 'Надёжность машин', ndaSignedAt: new Date() },
      });
    }
    const serviceType = await prisma.serviceType.create({
      data: { code: `type-e-${stamp}`, name: 'Сопровождение' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `client-e-${stamp}` },
    });

    const assigned = await prisma.project.create({
      data: {
        code: `PD-EXP-${stamp}-A`,
        clientId: client.id,
        serviceTypeId: serviceType.id,
        title: 'Назначенная работа',
        managerId: manager.id,
        expertId: mine.id,
        status: 'ACTIVE',
      },
    });
    const foreign = await prisma.project.create({
      data: {
        code: `PD-EXP-${stamp}-B`,
        clientId: client.id,
        serviceTypeId: serviceType.id,
        title: 'Работа другого эксперта',
        managerId: manager.id,
        expertId: other.id,
        status: 'ACTIVE',
      },
    });

    // По одному начислению каждому: своё эксперт видит, чужое — нет.
    await prisma.expertPayout.create({
      data: { projectId: assigned.id, expertId: mine.id, amount: 30_000_00n, status: 'ACCRUED' },
    });
    await prisma.expertPayout.create({
      data: { projectId: foreign.id, expertId: other.id, amount: 50_000_00n, status: 'ACCRUED' },
    });

    Object.assign(ids, {
      mine: mine.id,
      other: other.id,
      manager: manager.id,
      client: client.id,
      assigned: assigned.id,
      foreign: foreign.id,
      assignedCode: assigned.code,
      foreignCode: foreign.code,
    });
  });

  after(async () => {
    await prisma.expertPayout.deleteMany({
      where: { projectId: { in: [ids.assigned!, ids.foreign!] } },
    });
    await prisma.project.deleteMany({ where: { id: { in: [ids.assigned!, ids.foreign!] } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: [ids.mine!, ids.other!] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.mine!, ids.other!, ids.manager!] } },
    });
    await prisma.$disconnect();
  });

  it('без договора поручения эксперт не получает ни одной работы', async () => {
    const actor = expert(ids.mine!, false);
    assert.deepEqual(await queries.listProjects(actor), []);
    assert.equal(await queries.projectByCode(actor, ids.assignedCode!), null);
  });

  it('с договором виден только назначенный проект', async () => {
    const actor = expert(ids.mine!, true);
    const codes = (await queries.listProjects(actor)).map((project) => project.code);
    assert.deepEqual(codes, [ids.assignedCode]);
    assert.notEqual(await queries.projectByCode(actor, ids.assignedCode!), null);
    assert.equal(await queries.projectByCode(actor, ids.foreignCode!), null);
  });

  it('контакты клиента эксперту не передаются', async () => {
    const project = await queries.projectByCode(expert(ids.mine!, true), ids.assignedCode!);
    assert.ok(project !== null);
    // ФИО клиента эксперт видит (решение Р-150), контактов в объекте нет.
    assert.equal(typeof project.client.fullName, 'string');
    assert.ok(!('phone' in project.client) || project.client.phone === null);
  });

  it('эксперт видит своё вознаграждение и не видит чужое', async () => {
    const { rows, accrued } = await finance.ownPayouts(expert(ids.mine!, true));
    assert.equal(rows.length, 1);
    assert.equal(accrued, 30_000_00n);
    assert.ok(rows.every((row) => row.expertId === ids.mine));
  });

  it('маржа и начисления практики эксперту закрыты', async () => {
    const actor = expert(ids.mine!, true);
    await assert.rejects(() => finance.financeSummary(actor), AccessDenied);
  });
});
