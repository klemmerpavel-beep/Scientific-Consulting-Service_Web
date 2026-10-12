/**
 * Отметки чек-листа вида работы на настоящей базе (решение Р-551): кто
 * отмечает, закрытая работа, чужой чек-лист, параллельная правка, журнал и
 * счёт на плашке.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('отметки чек-листа работы', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const marks = await import('../src/lib/cabinet/checklist-marks.ts');
  const { serviceChecklist } = await import('../src/lib/cabinet/service-checklists.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  let createdType = false;
  const list = serviceChecklist('diploma')!;
  const [s1, s2, s3] = list.steps.map((step) => step.key);

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');
  const head = () => who(ids.head!, 'HEAD');
  const curator = () => who(ids.expert!, 'EXPERT', { expertNdaSignedAt: new Date() });
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });

  const newProject = async (suffix: string, status = 'ACTIVE') => {
    const project = await prisma.project.create({
      data: {
        code: `PD-CM-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.manager!,
        expertId: ids.expert!,
        status: status as never,
      },
    });
    projectIds.push(project.id);
    return project;
  };

  before(async () => {
    const user = (key: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `cm-${key}-${stamp}@example.org`, fullName: `Сотрудник ${key}`, role } });
    ids.manager = (await user('mgr', 'MANAGER')).id;
    ids.stranger = (await user('str', 'MANAGER')).id;
    ids.head = (await user('head', 'HEAD')).id;
    ids.expert = (await user('exp', 'EXPERT')).id;
    ids.clientUser = (await user('cli', 'CLIENT')).id;
    // Вид «diploma» мог быть заведён наполнением справочника: берём его, а
    // если нет — заводим и убираем за собой.
    const existing = await prisma.serviceType.findUnique({ where: { code: 'diploma' } });
    if (existing === null) {
      ids.type = (await prisma.serviceType.create({ data: { code: 'diploma', name: 'Сопровождение ВКР' } })).id;
      createdType = true;
    } else {
      ids.type = existing.id;
    }
    ids.client = (
      await prisma.clientProfile.create({
        data: { fullName: 'Клиент Чек-листа', normalizedName: `cm клиент ${stamp}`, userId: ids.clientUser },
      })
    ).id;
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.checklistMark.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    if (createdType) await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.manager!, ids.stranger!, ids.head!, ids.expert!, ids.clientUser!] } },
    });
  });

  it('менеджер работы, куратор и руководитель отмечают; журнал пишет разницу', async () => {
    const project = await newProject('A');
    await marks.saveChecklistMarks(manager(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s1!] });
    await marks.saveChecklistMarks(curator(), { projectId: project.id, checklistKey: list.key, shown: [s1!], checked: [s1!, s2!] });
    await marks.saveChecklistMarks(head(), { projectId: project.id, checklistKey: list.key, shown: [s1!, s2!], checked: [s2!] });
    const rows = await prisma.checklistMark.findMany({ where: { projectId: project.id }, orderBy: { stepKey: 'asc' } });
    assert.deepEqual(rows.map((row) => row.stepKey), [s2]);
    assert.equal(rows[0]!.doneById, ids.expert);
    const journal = await prisma.auditEvent.findMany({ where: { projectId: project.id, action: 'CHECKLIST_MARKED' } });
    assert.equal(journal.length, 3);
    const view = await marks.workChecklist(manager(), project.code);
    assert.deepEqual(view?.progress, { done: 1, total: list.steps.length });
    assert.equal(view?.marks.get(s2!)?.by, 'Сотрудник exp');
  });

  it('чужой менеджер и клиент не видят и не отмечают', async () => {
    const project = await newProject('B');
    await assert.rejects(
      marks.saveChecklistMarks(stranger(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s1!] }),
      /не найдена/u,
    );
    assert.equal(await marks.workChecklist(stranger(), project.code), null);
    await assert.rejects(
      marks.saveChecklistMarks(client(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s1!] }),
    );
    assert.equal(await marks.workChecklist(client(), project.code), null);
    assert.equal(await prisma.checklistMark.count({ where: { projectId: project.id } }), 0);
  });

  it('закрытая работа и чужой чек-лист — отказ с причиной', async () => {
    const closed = await newProject('C', 'COMPLETED');
    await assert.rejects(
      marks.saveChecklistMarks(manager(), { projectId: closed.id, checklistKey: list.key, shown: [], checked: [s1!] }),
      /Работа закрыта/u,
    );
    const open = await newProject('D');
    await assert.rejects(
      marks.saveChecklistMarks(manager(), { projectId: open.id, checklistKey: 'service-article', shown: [], checked: [s1!] }),
      /не относится к виду этой работы/u,
    );
  });

  it('отметка коллеги после показа формы не теряется', async () => {
    const project = await newProject('E');
    // Оба открыли форму пустой; первый отметил s1, второй — s3.
    await marks.saveChecklistMarks(manager(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s1!] });
    await marks.saveChecklistMarks(curator(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s3!] });
    const keys = (await prisma.checklistMark.findMany({ where: { projectId: project.id } })).map((row) => row.stepKey).sort();
    assert.deepEqual(keys, [s1, s3].sort());
  });

  it('счёт на плашке — только у тех, кто отмечает', async () => {
    const project = await newProject('F');
    await marks.saveChecklistMarks(manager(), { projectId: project.id, checklistKey: list.key, shown: [], checked: [s1!, s2!] });
    const ref = { id: project.id, clientId: ids.client!, managerId: ids.manager!, expertId: ids.expert!, serviceCode: 'diploma' };
    assert.deepEqual((await marks.checklistCounts(manager(), [ref])).get(project.id), { done: 2, total: list.steps.length });
    assert.equal((await marks.checklistCounts(client(), [ref])).get(project.id), undefined);
    assert.equal((await marks.checklistCounts(stranger(), [ref])).get(project.id), undefined);
  });
});
