/**
 * Замечания к материалу вне этапов (требование М-02, решение Р-284).
 *
 * Прежде дела модерации вне этапа сводились по названию материала:
 * одноимённые материалы разных работ сливались в одно дело, а ссылка вела
 * на общий перечень работ, где замечание разобрать было нельзя.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'm'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('замечания к материалу вне этапов', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { pendingComments } = await import('../src/lib/cabinet/materials.ts');
  const { projectMaterials } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const codes = [`PD-MO-${tail}-A`, `PD-MO-${tail}-B`];

  const curator = (): Actor => ({
    id: ids.manager!,
    role: 'MANAGER',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `mo-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `mo-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const type = await prisma.serviceType.create({ data: { code: `mo-${stamp}`, name: 'Проверка модерации' } });
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Клиент', normalizedName: `mo клиент ${stamp}` },
    });
    Object.assign(ids, { manager: manager.id, expert: expert.id, type: type.id, client: client.id });

    for (const [index, code] of codes.entries()) {
      const project = await prisma.project.create({
        data: { code, clientId: client.id, serviceTypeId: type.id, title: `Работа ${index}`, managerId: manager.id },
      });
      const material = await prisma.material.create({
        data: { projectId: project.id, title: 'Черновик', createdById: expert.id },
      });
      const version = await prisma.materialVersion.create({
        data: {
          materialId: material.id,
          number: 1,
          storageKey: `mo-${stamp}-${index}`,
          originalName: 'draft.docx',
          sizeBytes: 10n,
          sha256: '0'.repeat(64),
          contentType: 'application/octet-stream',
          uploadedById: expert.id,
        },
      });
      await prisma.versionComment.create({
        data: { versionId: version.id, authorId: expert.id, body: `Замечание ${index}` },
      });
    }
  });

  after(async () => {
    await prisma.project.deleteMany({ where: { code: { in: codes } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.expert!] } } });
  });

  it('одноимённые материалы разных работ — два дела со ссылкой на свой материал', async () => {
    const rows = (await pendingComments(curator())).filter((row) => codes.includes(row.projectCode));
    assert.equal(rows.length, 2, 'дела слились по названию материала');
    assert.notEqual(rows[0]!.materialId, rows[1]!.materialId);
    for (const row of rows) assert.equal(row.stageId, null);
  });

  it('экран материалов получает текст замечания для разбора на месте', async () => {
    const project = await projectMaterials(curator(), codes[0]!);
    const comment = project?.materials[0]?.versions[0]?.comments[0];
    assert.equal(comment?.body, 'Замечание 0');
    assert.equal(comment?.moderationStatus, 'PENDING');
  });
});
