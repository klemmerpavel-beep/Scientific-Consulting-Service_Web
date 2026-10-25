/**
 * «Сегодня»: одна карточка на работу вместо «срок работы прошёл», «нет
 * плана этапов», «нет куратора» (решение Р-738, уточняет Р-304).
 *
 * Работа без плана и без куратора — одна карточка «нет плана этапов и
 * куратора»; у работы с прошедшим сроком обе беды — в строке пояснения её
 * карточки срока; работа без куратора с планом — «нет куратора», как
 * прежде. Число дел — по карточкам (`attentionCount`, Р-342).
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

describe('одна карточка на работу на «Сегодня» (Р-738)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { attentionCount, attentionParts, attentionSources } = await import('../src/lib/cabinet/attention.ts');

  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const codes: Record<string, string> = {};
  const manager = (): Actor => ({ id: ids.manager!, role: 'MANAGER', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });

  const work = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-OC-${String(stamp).slice(-6)}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        ...extra,
      },
    });
    projectIds.push(project.id);
    codes[suffix] = project.code;
    return project;
  };

  before(async () => {
    const [mgr, expert] = await Promise.all([
      prisma.user.create({ data: { email: `oc-mgr-${stamp}@example.org`, fullName: 'Менеджер карточек', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `oc-exp-${stamp}@example.org`, fullName: 'Куратор карточек', role: 'EXPERT' } }),
    ]);
    await prisma.expertProfile.create({ data: { userId: expert.id, ndaSignedAt: new Date(Date.UTC(2026, 0, 10)) } });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент карточек', normalizedName: `oc клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `oc-${stamp}`, name: 'Проверка карточек' } });
    Object.assign(ids, { manager: mgr.id, expert: expert.id, client: profile.id, type: type.id });

    const past = new Date(Date.now() - 30 * DAY);
    const future = new Date(Date.now() + 60 * DAY);
    // L — срок прошёл, плана и куратора нет; P — плана и куратора нет;
    // E — план есть, куратора нет; Q — куратор есть, плана нет.
    await work('L', { dueOn: past });
    await work('P', { dueOn: future });
    const withPlan = await work('E', { dueOn: future });
    await prisma.stage.create({ data: { projectId: withPlan.id, position: 1, title: 'Глава 1', state: 'NOT_STARTED' } });
    await work('Q', { dueOn: future, expertId: expert.id });
  });

  after(async () => {
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: ids.expert } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.expert!] } } });
  });

  it('каждая работа — одной карточкой среди «срок работы», «нет плана», «нет куратора»', async () => {
    const parts = attentionParts(await attentionSources(manager()));
    const cards = [...parts.late, ...parts.noPlan, ...parts.noExpert].map((row) => row.code);
    for (const suffix of ['L', 'P', 'E', 'Q']) {
      assert.equal(cards.filter((code) => code === codes[suffix]).length, 1, `работа ${suffix}`);
    }
  });

  it('у работы с прошедшим сроком «нет куратора» — в её карточке срока', async () => {
    const parts = attentionParts(await attentionSources(manager()));
    const late = parts.late.find((row) => row.code === codes.L);
    assert.ok(late !== undefined, 'нет карточки срока');
    assert.equal(late.noExpert, true);
    assert.equal(late._count.stages, 0, 'план работ не заведён — в той же строке');
  });

  it('без плана и без куратора — одна карточка с обеими бедами; без одного — прежняя', async () => {
    const parts = attentionParts(await attentionSources(manager()));
    assert.deepEqual(
      parts.noPlan.map((row) => [row.code, row.noExpert]).sort(),
      [[codes.P, true], [codes.Q, false]].sort(),
    );
    assert.deepEqual(parts.noExpert.map((row) => row.code), [codes.E]);
  });

  it('число дел — по карточкам', async () => {
    const sources = await attentionSources(manager());
    const parts = attentionParts(sources);
    const total = Object.values(parts).reduce((acc, part) => acc + part.length, 0);
    assert.equal(attentionCount(sources), total);
    assert.equal(parts.late.length + parts.noPlan.length + parts.noExpert.length, 4);
  });
});
