/**
 * Отбор работ по сотруднику (требование РК-03, решение Р-341): отбор по
 * менеджеру и по куратору отдаёт ровно работы этого человека; менеджеру
 * параметр выборку не расширяет; менеджер и куратор — в данных строки.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('отбор по сотруднику (РК-03)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { listProjects } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const codes: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
  });
  const head = () => who(ids.head!, 'HEAD');

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `hf-${suffix}-${stamp}@example.org`, fullName: `${suffix} ${stamp}`, role } });
    const [headUser, m1, m2, c1] = await Promise.all([make('head', 'HEAD'), make('m1', 'MANAGER'), make('m2', 'MANAGER'), make('c1', 'EXPERT')]);
    const profile = await prisma.clientProfile.create({ data: { fullName: `Клиент ${stamp}`, normalizedName: `hf клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `hf-${stamp}`, name: 'Проверка отбора' } });
    const make2 = (n: number, managerId: string, expertId: string | null) =>
      prisma.project.create({
        data: {
          code: `PD-HF${n}-${String(stamp).slice(-6)}`,
          clientId: profile.id,
          serviceTypeId: type.id,
          title: `Отбор ${n} ${stamp}`,
          managerId,
          expertId,
        },
      });
    const projects = await Promise.all([make2(1, m1.id, c1.id), make2(2, m1.id, null), make2(3, m2.id, c1.id)]);
    codes.push(...projects.map((project) => project.code));
    Object.assign(ids, { head: headUser.id, m1: m1.id, m2: m2.id, c1: c1.id, client: profile.id, type: type.id });
  });

  after(async () => {
    await prisma.project.deleteMany({ where: { code: { in: codes } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.m1!, ids.m2!, ids.c1!] } } });
  });

  const mine = (rows: { code: string }[]) => rows.map((row) => row.code).filter((code) => codes.includes(code)).sort();

  it('по менеджеру и по куратору — ровно работы этого человека', async () => {
    const byManager = await listProjects(head(), { filter: 'all', query: String(stamp), manager: ids.m1 });
    assert.deepEqual(mine(byManager.rows), [codes[0], codes[1]].sort());
    const byCurator = await listProjects(head(), { filter: 'all', query: String(stamp), curator: ids.c1 });
    assert.deepEqual(mine(byCurator.rows), [codes[0], codes[2]].sort());
    const both = await listProjects(head(), { filter: 'all', query: String(stamp), manager: ids.m2, curator: ids.c1 });
    assert.deepEqual(mine(both.rows), [codes[2]]);
    assert.equal(byManager.rows[0]?.manager.id, ids.m1);
  });

  it('менеджеру параметр выборку не расширяет', async () => {
    const asManager = await listProjects(who(ids.m1!, 'MANAGER'), { filter: 'all', query: String(stamp), manager: ids.m2 });
    assert.deepEqual(mine(asManager.rows), [codes[0], codes[1]].sort());
  });
});
