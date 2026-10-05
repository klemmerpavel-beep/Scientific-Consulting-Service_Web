/**
 * Ближайшие сроки на сводке руководителя (решение Р-182; требование
 * РК-04, решение Р-342).
 *
 * Окно — две недели, и граница окна здесь и проверяется: далёкое в
 * перечень не попадает, сорванное — попадает сверху с числом дней
 * просрочки, а порядок идёт от раннего срока к позднему.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('ближайшие сроки на сводке', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { stageLoad, upcomingDeadlines } = await import('../src/lib/cabinet/summary.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const day = 86_400_000;

  const head = (id: string): Actor => ({
    id,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  /** Работа с одним незавершённым этапом и заданным сроком. */
  async function work(suffix: string, dueOn: Date | null): Promise<string> {
    const project = await prisma.project.create({
      data: {
        code: `PD-SOON-${stamp}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.boss!,
        status: 'ACTIVE',
      },
    });
    await prisma.stage.create({
      data: {
        projectId: project.id,
        position: 1,
        title: `Этап ${suffix}`,
        state: 'IN_PROGRESS',
        dueOn,
      },
    });
    return project.id;
  }

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `soon-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `soon-type-${stamp}`, name: 'Сопровождение' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `soon-client-${stamp}` },
    });
    Object.assign(ids, { boss: boss.id, type: type.id, client: client.id });

    const now = Date.now();
    Object.assign(ids, {
      late: await work('late', new Date(now - 3 * day)),
      near: await work('near', new Date(now + 10 * day)),
      nearer: await work('nearer', new Date(now + 2 * day)),
      far: await work('far', new Date(now + 40 * day)),
      none: await work('none', null),
    });
  });

  after(async () => {
    const projects = [ids.late!, ids.near!, ids.nearer!, ids.far!, ids.none!];
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: ids.boss } });
    await prisma.$disconnect();
  });

  it('в окно попадают сроки ближайших двух недель и сорванные — сорванные сверху', async () => {
    const soon = await upcomingDeadlines(head(ids.boss!));
    const mine = soon.filter((row) => row.code.startsWith(`PD-SOON-${stamp}-`));
    assert.deepEqual(
      mine.map((row) => row.code),
      [`PD-SOON-${stamp}-late`, `PD-SOON-${stamp}-nearer`, `PD-SOON-${stamp}-near`],
    );
  });

  it('сорванное — с числом дней просрочки; в счёте просрочки «Чем занята практика» тоже', async () => {
    const load = await stageLoad(head(ids.boss!));
    assert.ok(load.overdue > 0);
    const late = (await upcomingDeadlines(head(ids.boss!))).find((row) => row.code === `PD-SOON-${stamp}-late`);
    assert.ok(late !== undefined && late.late !== null && late.late >= 2);
    const nearer = (await upcomingDeadlines(head(ids.boss!))).find((row) => row.code === `PD-SOON-${stamp}-nearer`);
    assert.equal(nearer?.late, null);
  });

  it('в записи стоит и этап, и клиент: по одному коду работу не узнать', async () => {
    const row = (await upcomingDeadlines(head(ids.boss!))).find((item) => item.code === `PD-SOON-${stamp}-nearer`);
    assert.ok(row !== undefined);
    assert.equal(row.stage, 'Этап nearer');
    assert.equal(row.client, `Клиент ${stamp}`);
  });
});
