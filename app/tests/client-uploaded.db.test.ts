/**
 * Дела клиента после загрузки (решение Р-728) — на базе: версия клиента
 * после перехода этапа в «Ждём ваших данных» даёт делу день загрузки и
 * ставит его после дел без загрузки — только у клиента, у менеджера и
 * куратора порядок прежний; версия до перехода и версия куратора дела не
 * меняют; этап, переведённый в работу, из дел уходит.
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

describe('дела клиента после загрузки (Р-728)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { pendingActions } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const client = (): Actor => ({
    id: ids.clientUser!,
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfileId: ids.client!,
    expertNdaSignedAt: null,
  });
  const staff = (role: 'MANAGER' | 'EXPERT'): Actor => ({
    id: role === 'MANAGER' ? ids.manager! : ids.curator!,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
  });

  before(async () => {
    const [manager, clientUser, curator] = await Promise.all([
      prisma.user.create({ data: { email: `cu-mgr-${stamp}@example.org`, fullName: 'Менеджер Загрузки', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `cu-cl-${stamp}@example.org`, fullName: 'Клиент Загрузки', role: 'CLIENT' } }),
      prisma.user.create({ data: { email: `cu-cur-${stamp}@example.org`, fullName: 'Куратор Загрузки', role: 'EXPERT' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Загрузки', normalizedName: `cu клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cu-${stamp}`, name: 'Проверка загрузки' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CU-${String(stamp).slice(-6)}`,
        title: 'Работа с загрузкой',
        clientId: profile.id,
        serviceTypeId: type.id,
        managerId: manager.id,
        expertId: curator.id,
        status: 'ACTIVE',
      },
    });
    const now = Date.now();
    const stage = (position: number, title: string, state: 'AWAITING_CLIENT' | 'IN_APPROVAL', due: number, since: number | null) =>
      prisma.stage.create({
        data: {
          projectId: project.id,
          position,
          title,
          state,
          dueOn: new Date(now + due * DAY),
          awaitingClientSince: since === null ? null : new Date(now - since * DAY),
        },
      });
    // Раньше по сроку — этап с загрузкой: без правила он шёл бы первым.
    const uploaded = await stage(1, 'С загрузкой', 'AWAITING_CLIENT', 3, 10);
    const early = await stage(2, 'Загрузка до просьбы', 'AWAITING_CLIENT', 5, 2);
    const approval = await stage(3, 'Согласование', 'IN_APPROVAL', 8, null);
    const version = async (stageId: string, by: string, daysAgo: number, n: number) => {
      const material = await prisma.material.create({
        data: { projectId: project.id, stageId, title: `Материал ${n}`, createdById: by },
      });
      await prisma.materialVersion.create({
        data: {
          materialId: material.id,
          number: 1,
          storageKey: `cu/${stamp}/${n}`,
          originalName: 'file.docx',
          sizeBytes: 10n,
          sha256: 'c'.repeat(64),
          contentType: 'application/octet-stream',
          uploadedById: by,
          uploadedAt: new Date(now - daysAgo * DAY),
        },
      });
    };
    await version(uploaded.id, clientUser.id, 1, 1);
    // До перехода в «Ждём ваших данных» — формулировку не меняет.
    await version(early.id, clientUser.id, 4, 2);
    // Версия куратора после перехода — не загрузка клиента.
    await version(early.id, curator.id, 1, 3);
    Object.assign(ids, {
      manager: manager.id,
      clientUser: clientUser.id,
      curator: curator.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      uploaded: uploaded.id,
      early: early.id,
      approval: approval.id,
    });
  });

  after(async () => {
    const versions = await prisma.materialVersion.findMany({ where: { material: { projectId: ids.project } }, select: { id: true } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versions.map((row) => row.id) } } });
    await prisma.material.deleteMany({ where: { projectId: ids.project } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.clientUser!, ids.curator!] } } });
  });

  it('загрузка после просьбы — день загрузки и место после дел без неё', async () => {
    const rows = await pendingActions(client());
    assert.deepEqual(
      rows.map((row) => [row.id, row.clientUploadedAt !== null]),
      [
        [ids.early, false],
        [ids.approval, false],
        [ids.uploaded, true],
      ],
    );
  });

  it('у менеджера и куратора порядок прежний — по сроку', async () => {
    for (const role of ['MANAGER', 'EXPERT'] as const) {
      const rows = (await pendingActions(staff(role))).filter((row) => row.projectId === ids.project);
      assert.deepEqual(
        rows.map((row) => row.id),
        [ids.uploaded, ids.early, ids.approval],
        role,
      );
    }
  });

  it('этап переведён в работу — дело уходит, как прежде', async () => {
    await prisma.stage.update({ where: { id: ids.uploaded }, data: { state: 'IN_PROGRESS' } });
    const rows = await pendingActions(client());
    assert.ok(!rows.some((row) => row.id === ids.uploaded));
  });
});
