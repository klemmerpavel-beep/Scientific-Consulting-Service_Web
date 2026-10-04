/**
 * «Команда» (требование РК-06, решение Р-343) — шаг H.5: числа строки
 * менеджера и куратора совпадают с перечнем «Работы» по отбору этого
 * человека; просрочено, клиент ждёт ответа, ждёт публикации и сдано —
 * его дела без срока реакции; у куратора — его дела «Что сделать сейчас»,
 * договор поручения и способ связи; блок «Сводки» — первыми те, у кого
 * больше просроченного и ждущего; менеджеру «Команда» не отдаётся.
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

describe('«Команда» (РК-06)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { teamBrief, teamLoad } = await import('../src/lib/cabinet/team.ts');
  const { curatorTasksData, listProjects } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? NDA : null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const code = (suffix: string) => `PD-TL-${String(stamp).slice(-6)}-${suffix}`;

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `tl-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, curatorUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Команды'),
      make('mgr', 'MANAGER', `Аааа Менеджер ${stamp}`),
      make('cur', 'EXPERT', `Аааа Куратор ${stamp}`),
      make('cl', 'CLIENT', 'Клиент Команды'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    await prisma.contactChannel.create({
      data: { userId: curatorUser.id, kind: 'TELEGRAM', value: '@kurator_tl', preferred: true },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Команды', normalizedName: `tl клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `tl-${stamp}`, name: 'Проверка команды' } });
    const base = { clientId: profile.id, serviceTypeId: type.id, managerId: managerUser.id, expertId: curatorUser.id };
    const [running, paused, done] = await Promise.all([
      prisma.project.create({ data: { ...base, code: code('run'), title: `Идущая ${stamp}`, status: 'ACTIVE' } }),
      prisma.project.create({ data: { ...base, code: code('pause'), title: `Пауза ${stamp}`, status: 'PAUSED' } }),
      prisma.project.create({ data: { ...base, code: code('done'), title: `Сданная ${stamp}`, status: 'COMPLETED' } }),
    ]);
    const now = Date.now();
    const [late] = await Promise.all([
      // Сорванный срок и сдан куратором — ход за менеджером.
      prisma.stage.create({
        data: {
          projectId: running.id,
          position: 1,
          title: 'Глава 1',
          state: 'IN_PROGRESS',
          dueOn: new Date(now - 3 * DAY),
          handedOverAt: new Date(now - DAY),
        },
      }),
      prisma.stage.create({
        data: { projectId: paused.id, position: 1, title: 'Глава 2', state: 'AWAITING_CLIENT', dueOn: new Date(now + 9 * DAY) },
      }),
    ]);
    await prisma.message.create({ data: { projectId: running.id, authorId: clientUser.id, body: 'Когда будет глава?' } });
    await prisma.material.create({
      data: {
        projectId: running.id,
        stageId: late.id,
        title: 'Глава куратора',
        createdById: curatorUser.id,
        versions: {
          create: {
            number: 1,
            storageKey: `tl/${stamp}/v1`,
            originalName: 'glava.docx',
            sizeBytes: 10n,
            sha256: 'e'.repeat(64),
            contentType: 'application/octet-stream',
            uploadedById: curatorUser.id,
            moderation: { create: {} },
          },
        },
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      curator: curatorUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      running: running.id,
      paused: paused.id,
      done: done.id,
    });
  });

  after(async () => {
    const projects = [ids.running!, ids.paused!, ids.done!];
    const users = [ids.head!, ids.manager!, ids.curator!, ids.clientUser!];
    const versions = await prisma.materialVersion.findMany({ where: { material: { projectId: { in: projects } } }, select: { id: true } });
    const versionIds = versions.map((version) => version.id);
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: { in: projects } }] } });
    await prisma.message.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.versionModeration.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.contactChannel.deleteMany({ where: { userId: { in: users } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.5: работ у менеджера и куратора — столько же, сколько в «Работах» по отбору', async () => {
    const team = await teamLoad(head());
    const manager = team.managers.find((row) => row.id === ids.manager)!;
    const curator = team.curators.find((row) => row.id === ids.curator)!;
    const byManager = await listProjects(head(), { filter: 'active', manager: ids.manager! });
    const byCurator = await listProjects(head(), { filter: 'active', curator: ids.curator! });
    assert.equal(manager.works, byManager.total);
    assert.equal(curator.works, byCurator.total);
    assert.equal(manager.works, 2);
    assert.equal(manager.paused, 1);
    assert.equal(manager.href, `/cabinet/projects?state=active&manager=${ids.manager}`);
    assert.deepEqual(
      manager.points.map((point) => [point.key, point.count]),
      [
        ['IN_PROGRESS', 1],
        ['AWAITING_CLIENT', 1],
      ],
    );
  });

  it('у менеджера — просрочено и его дела без срока реакции', async () => {
    const manager = (await teamLoad(head())).managers.find((row) => row.id === ids.manager)!;
    assert.equal(manager.overdue, 1);
    assert.equal(manager.clientWaiting, 1);
    assert.equal(manager.moderation, 1);
    assert.equal(manager.handedOver, 1);
    assert.equal(manager.decide, 3);
  });

  it('у куратора — его дела, договор поручения и способ связи', async () => {
    const curator = (await teamLoad(head())).curators.find((row) => row.id === ids.curator)!;
    const own = await curatorTasksData(who(ids.curator!, 'EXPERT'));
    assert.equal(curator.decide, own.length);
    assert.equal(curator.ndaSignedAt?.getTime(), NDA.getTime());
    assert.equal(curator.contact?.value, '@kurator_tl');
  });

  it('блок «Сводки» — первыми те, у кого больше просроченного и ждущего; до пяти строк', async () => {
    const brief = teamBrief(await teamLoad(head()));
    assert.ok(brief.length <= 5);
    const manager = brief.find((row) => row.id === ids.manager);
    assert.ok(manager !== undefined, 'менеджер с делами не попал в блок');
    assert.equal(manager.side, 'менеджер');
  });

  it('менеджеру «Команда» не отдаётся', async () => {
    assert.deepEqual(await teamLoad(who(ids.manager!, 'MANAGER')), { managers: [], curators: [] });
  });
});
