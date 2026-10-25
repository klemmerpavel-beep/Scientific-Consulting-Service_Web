/**
 * Письма куратору о ходе этапа на базе (решение Р-734): «Ход за вами»
 * при запуске этапа и «возвращён вам» начинаются «Работа {код} —
 * {название}.»; темы прежние (Р-643); куратору без договора поручения
 * писем нет, как прежде (Р-237).
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 't'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('письма куратору называют работу (Р-734)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const handover = await import('../src/lib/cabinet/handover.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');

  const ids: Record<string, string> = {};
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const manager = (): Actor => ({ id: ids.manager!, role: 'MANAGER', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const code = `PD-WL-${String(stamp).slice(-6)}`;
  const letters = (userId: string) =>
    prisma.notificationOutbox.findMany({
      where: { userId, channel: 'EMAIL', projectId: ids.project },
      orderBy: { createdAt: 'asc' },
      select: { subject: true, body: true, eventKind: true },
    });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `wl-${suffix}-${stamp}@example.org`, fullName, role } });
    const [managerUser, curator, unsigned] = await Promise.all([
      make('mgr', 'MANAGER', 'Менеджер Писем'),
      make('cur', 'EXPERT', 'Куратор Писем'),
      make('uns', 'EXPERT', 'Куратор Без Договора'),
    ]);
    await prisma.expertProfile.createMany({ data: [{ userId: curator.id, ndaSignedAt: NDA }, { userId: unsigned.id }] });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент Писем', normalizedName: `wl клиент ${stamp}` } });
    const type = await prisma.serviceType.create({ data: { code: `wl-${stamp}`, name: 'Проверка писем' } });
    const project = await prisma.project.create({
      data: {
        code,
        title: 'Сопровождение диссертационного исследования',
        clientId: profile.id,
        serviceTypeId: type.id,
        managerId: managerUser.id,
        expertId: curator.id,
      },
    });
    const stage = await prisma.stage.create({
      data: { projectId: project.id, position: 1, title: 'Глава 3', state: 'NOT_STARTED' },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      curator: curator.id,
      unsigned: unsigned.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      stage: stage.id,
    });
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: [ids.manager!, ids.curator!, ids.unsigned!] } }] } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.stageStateChange.deleteMany({ where: { stageId: ids.stage } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: [ids.curator!, ids.unsigned!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.curator!, ids.unsigned!] } } });
  });

  it('«Ход за вами» при запуске этапа — с названием работы; тема прежняя', async () => {
    await projects.setStageState(manager(), ids.stage!, 'IN_PROGRESS');
    const turn = (await letters(ids.curator!)).find((row) => row.eventKind === 'CURATOR_TURN');
    assert.ok(turn !== undefined, 'нет письма «Ход за вами»');
    assert.equal(turn.subject, 'Ход за вами: этап «Глава 3»');
    assert.ok(turn.body.startsWith(`Работа ${code} — Сопровождение диссертационного исследования.\n`), turn.body);
  });

  it('«возвращён вам» — с названием работы', async () => {
    await prisma.stage.update({ where: { id: ids.stage }, data: { handedOverAt: new Date() } });
    await handover.handBackStage(manager(), ids.stage!, 'Добавьте выводы');
    const back = (await letters(ids.curator!)).find((row) => row.subject === 'Этап «Глава 3» возвращён вам');
    assert.ok(back !== undefined, 'нет письма «возвращён вам»');
    assert.ok(back.body.startsWith(`Работа ${code} — Сопровождение диссертационного исследования.\n`), back.body);
  });

  it('куратору без договора поручения писем о ходе этапа нет', async () => {
    await prisma.project.update({ where: { id: ids.project }, data: { expertId: ids.unsigned } });
    await prisma.stage.update({ where: { id: ids.stage }, data: { handedOverAt: new Date() } });
    await handover.handBackStage(manager(), ids.stage!, 'Ещё раз');
    assert.equal((await letters(ids.unsigned!)).length, 0);
  });
});
