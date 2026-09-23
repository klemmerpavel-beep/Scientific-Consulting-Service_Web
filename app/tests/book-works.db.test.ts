/**
 * Работа из книги заказов на сводке руководителя (решение Р-216).
 *
 * Перенос книги заводит работы без этапов: в книге одна строка на заказ.
 * Прежде такая работа выпадала и из «Требует внимания», и из графика
 * «Чем занята практика», и сводка практики, ведущей учёт книгой, молчала
 * о просроченных заказах.
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('работа из книги без плана на сводке', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { stageLoad } = await import('../src/lib/cabinet/summary.ts');
  const { trafficLight } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const day = 86_400_000;
  const ids: Record<string, string> = {};

  const head = (): Actor => ({
    id: ids.boss!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  async function work(suffix: string, dueOn: Date | null, stage?: { state: 'IN_PROGRESS'; dueOn: Date }) {
    const project = await prisma.project.create({
      data: {
        code: `PD-BOOK-${stamp}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.boss!,
        status: 'ACTIVE',
        source: 'IMPORT',
        dueOn,
      },
    });
    if (stage !== undefined) {
      await prisma.stage.create({
        data: { projectId: project.id, position: 1, title: `Этап ${suffix}`, ...stage },
      });
    }
    return project.id;
  }

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `book-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const type = await prisma.serviceType.create({
      data: { code: `book-type-${stamp}`, name: 'Сопровождение' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `book-client-${stamp}` },
    });
    Object.assign(ids, { boss: boss.id, type: type.id, client: client.id });
    const now = Date.now();
    Object.assign(ids, {
      // без плана, срок прошёл — на сводку
      late: await work('late', new Date(now - 30 * day)),
      // без плана, срок впереди — не на сводку
      ahead: await work('ahead', new Date(now + 30 * day)),
      // срок прошёл, но этап тоже просрочен — уже назван этапом
      staged: await work('staged', new Date(now - 30 * day), {
        state: 'IN_PROGRESS',
        dueOn: new Date(now - 10 * day),
      }),
    });
  });

  after(async () => {
    const projects = [ids.late!, ids.ahead!, ids.staged!];
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: ids.boss } });
    await prisma.$disconnect();
  });

  it('просроченная работа без плана попадает в «Требует внимания»', async () => {
    const light = await trafficLight(head());
    const codes = light.lateWorks.map((work) => work.code);
    assert.ok(codes.includes(`PD-BOOK-${stamp}-late`));
    assert.ok(!codes.includes(`PD-BOOK-${stamp}-ahead`), 'срок впереди — не просрочка');
  });

  it('работа, уже названная просроченным этапом, второй раз не встаёт', async () => {
    const light = await trafficLight(head());
    assert.ok(!light.lateWorks.some((work) => work.code === `PD-BOOK-${stamp}-staged`));
    assert.ok(light.overdue.some((stage) => stage.project.code === `PD-BOOK-${stamp}-staged`));
  });

  it('работы без плана стоят в графике практики своей строкой и в счёте просрочки', async () => {
    const load = await stageLoad(head());
    const planless = load.points.find((point) => point.key === 'PLANLESS');
    assert.ok(planless !== undefined && planless.count >= 2);
    assert.ok(load.overdue >= 2);
  });
});
