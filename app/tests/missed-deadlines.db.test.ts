/**
 * Одно правило «срок сорван» (решение Р-719) — на базе: «Просрочено»
 * менеджера в «Команде», сорванные строки «Ближайших сроков» и счёт
 * «Чем занята практика» равны числу сорванных сроков ответа «Сводки»
 * (`trafficLight`: сорванные этапы и работы без сорванного этапа).
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('одно правило «срок сорван» (Р-719)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');
  const { trafficLight } = await import('../src/lib/cabinet/queries.ts');
  const { stageLoad, upcomingDeadlines } = await import('../src/lib/cabinet/summary.ts');
  const { teamLoad } = await import('../src/lib/cabinet/team.ts');

  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const code = (suffix: string) => `PD-MS-${String(stamp).slice(-6)}-${suffix}`;
  const day = (offset: number) => new Date(moscowToday().getTime() + offset * DAY);

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `ms-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Сроков'),
      make('mgr', 'MANAGER', `Менеджер Сроков ${stamp}`),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Сроков', normalizedName: `ms клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `ms-${stamp}`, name: 'Проверка сроков' } });
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, client: profile.id, type: type.id });

    const work = async (
      suffix: string,
      status: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
      dueOn: Date | null,
      stages: [string, Date | null][] = [],
    ) => {
      const project = await prisma.project.create({
        data: {
          code: code(suffix),
          title: `Работа ${suffix} ${stamp}`,
          clientId: profile.id,
          serviceTypeId: type.id,
          managerId: managerUser.id,
          status,
          dueOn,
        },
      });
      projects.push(project.id);
      for (const [index, [state, due]] of stages.entries()) {
        await prisma.stage.create({
          data: { projectId: project.id, position: index + 1, title: `Этап ${index + 1}`, state: state as 'DONE', dueOn: due },
        });
      }
    };
    // Два сорванных этапа идущей работы — два срока; срок работы при них
    // отдельно не считается.
    await work('two', 'ACTIVE', day(-30), [
      ['IN_PROGRESS', day(-20)],
      ['NOT_STARTED', day(-10)],
    ]);
    // С планом, этапы в срок, срок работы прошёл — «срок работы прошёл».
    await work('plan', 'ACTIVE', day(-21), [
      ['DONE', day(-60)],
      ['IN_APPROVAL', day(10)],
    ]);
    // Приостановленная с прошедшим сроком: срок работы, этапы — нет.
    await work('pause', 'PAUSED', day(-100), [['IN_PROGRESS', day(-90)]]);
    // Приостановленная со сроком впереди: этап в прошлом сорванным не считается.
    await work('pause-ahead', 'PAUSED', day(40), [['IN_PROGRESS', day(-5)]]);
    // Без плана — идущая и приостановленная.
    await work('book', 'ACTIVE', day(-116));
    await work('book-pause', 'PAUSED', day(-631));
    // Сорванный этап при сроке работы впереди.
    await work('stage', 'ACTIVE', day(60), [['AWAITING_CLIENT', day(-3)]]);
    // Закрытая работа не считается.
    await work('done', 'COMPLETED', day(-50));
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: [ids.head!, ids.manager!] } }] } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  const mine = (value: string) => value.startsWith(code(''));

  it('ответ «Сводки» по этим работам — семь сорванных сроков', async () => {
    const light = await trafficLight(head());
    const count =
      light.overdue.filter((stage) => mine(stage.project.code)).length + light.lateWorks.filter((w) => mine(w.code)).length;
    assert.equal(count, 7);
  });

  it('«Просрочено» менеджера в «Команде» — столько же', async () => {
    const manager = (await teamLoad(head())).managers.find((row) => row.id === ids.manager);
    assert.ok(manager !== undefined);
    assert.equal(manager.overdue, 7);
  });

  it('«Ближайшие сроки»: строк «просрочено» столько же; срок работы с планом — своей строкой', async () => {
    const rows = (await upcomingDeadlines(head())).filter((row) => mine(row.code));
    const late = rows.filter((row) => row.late !== null);
    assert.equal(late.length, 7);
    const plan = late.find((row) => row.code === code('plan'));
    assert.ok(plan !== undefined, 'нет строки «срок работы прошёл» у работы с планом');
    assert.equal(plan.stage, null);
    assert.equal(plan.planless, false);
    assert.equal(late.find((row) => row.code === code('book'))?.planless, true);
    assert.ok(!rows.some((row) => row.code === code('pause-ahead') && row.late !== null), 'этап приостановленной работы назван сорванным');
    assert.ok(!rows.some((row) => row.code === code('pause') && row.stage !== null && row.late !== null));
    assert.ok(!rows.some((row) => row.code === code('done')));
  });

  it('«Чем занята практика» считает просрочку тем же правилом, что ответ', async () => {
    const [load, light] = await Promise.all([stageLoad(head()), trafficLight(head())]);
    assert.equal(load.overdue, light.overdue.length + light.lateWorks.length);
  });
});
