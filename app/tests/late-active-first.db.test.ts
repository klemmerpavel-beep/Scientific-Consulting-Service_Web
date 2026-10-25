/**
 * «Сегодня» на базе (решение Р-720): у менеджера дела «срок работы
 * прошёл» идут действующими работами вперёд приостановленных, хотя срок
 * приостановленной давнее; число дел то же.
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

describe('дела «срок работы прошёл»: действующие первыми (Р-720)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');
  const { attentionParts, attentionSources } = await import('../src/lib/cabinet/attention.ts');

  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const code = (suffix: string) => `PD-AF-${String(stamp).slice(-6)}-${suffix}`;
  const manager = (): Actor => ({ id: ids.manager!, role: 'MANAGER', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });

  before(async () => {
    const user = await prisma.user.create({
      data: { email: `af-mgr-${stamp}@example.org`, fullName: 'Менеджер Порядка', role: 'MANAGER' },
    });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент Порядка', normalizedName: `af клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `af-${stamp}`, name: 'Проверка порядка' } });
    Object.assign(ids, { manager: user.id, client: profile.id, type: type.id });
    const day = (offset: number) => new Date(moscowToday().getTime() + offset * DAY);
    for (const [suffix, status, due] of [
      ['pause-old', 'PAUSED', day(-631)],
      ['pause', 'PAUSED', day(-510)],
      ['run-old', 'ACTIVE', day(-387)],
      ['run', 'ACTIVE', day(-21)],
    ] as const) {
      const project = await prisma.project.create({
        data: {
          code: code(suffix),
          title: `Работа ${suffix}`,
          clientId: profile.id,
          serviceTypeId: type.id,
          managerId: user.id,
          status,
          dueOn: due,
          source: 'IMPORT',
        },
      });
      projects.push(project.id);
    }
  });

  after(async () => {
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: ids.manager } });
  });

  it('действующие — первыми, по сроку; приостановленные — следом; число то же', async () => {
    const sources = await attentionSources(manager());
    const late = attentionParts(sources).late.map((work) => work.code);
    assert.deepEqual(late, [code('run-old'), code('run'), code('pause-old'), code('pause')]);
    assert.equal(sources.light.lateWorks.length, 4);
  });
});
