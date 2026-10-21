/**
 * Ответ «Моих работ» и «Назначенных работ» при приостановленных работах на
 * настоящей базе (решение Р-651): у клиента одна
 * приостановленная и одна завершённая работа, у куратора — одна
 * приостановленная с этапом, ждущим клиента. Дел нет, идущих работ нет, а
 * ответ — о приостановке, а не «Действующих … нет» с новой заявкой.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const tail = String(stamp).slice(-6);

describe('ответ без дел при приостановленных работах (Р-651)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const queries = await import('../src/lib/cabinet/queries.ts');
  const { idleAnswer } = await import('../src/lib/cabinet/works-answer.ts');

  const ids: Record<string, string> = {};
  const projectIds: string[] = [];
  const NDA = new Date(Date.UTC(2026, 0, 10));
  const client = (): Actor => ({
    id: ids.clientUser!,
    role: 'CLIENT',
    status: 'ACTIVE',
    clientProfileId: ids.client!,
    expertNdaSignedAt: null,
  });
  const curator = (): Actor => ({
    id: ids.curator!,
    role: 'EXPERT',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: NDA,
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role']) =>
      prisma.user.create({ data: { email: `wa-${suffix}-${stamp}@example.org`, fullName: `${role} ${stamp}`, role } });
    const [managerUser, clientUser, otherUser, curatorUser] = await Promise.all([
      make('mgr', 'MANAGER'),
      make('cl', 'CLIENT'),
      make('oth', 'CLIENT'),
      make('cur', 'EXPERT'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id, ndaSignedAt: NDA } });
    const [profile, other] = await Promise.all([
      prisma.clientProfile.create({
        data: { userId: clientUser.id, fullName: `Клиент ${stamp}`, normalizedName: `wa клиент ${stamp}` },
      }),
      prisma.clientProfile.create({
        data: { userId: otherUser.id, fullName: `Другой ${stamp}`, normalizedName: `wa другой ${stamp}` },
      }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `wa-${stamp}`, name: 'Проверка ответа' } });
    const work = (suffix: string, clientId: string, status: 'PAUSED' | 'COMPLETED', expertId: string | null) =>
      prisma.project.create({
        data: {
          code: `PD-WA-${tail}-${suffix}`,
          clientId,
          serviceTypeId: type.id,
          title: `Работа ${suffix}`,
          managerId: managerUser.id,
          expertId,
          status,
        },
      });
    const paused = await work('P', profile.id, 'PAUSED', curatorUser.id);
    const done = await work('D', profile.id, 'COMPLETED', null);
    // Чужая приостановленная работа в счёт клиента не входит.
    const foreign = await work('F', other.id, 'PAUSED', null);
    projectIds.push(paused.id, done.id, foreign.id);
    await prisma.stage.create({
      data: { projectId: paused.id, position: 1, title: 'Глава 2', state: 'AWAITING_CLIENT' },
    });
    Object.assign(ids, {
      manager: managerUser.id,
      clientUser: clientUser.id,
      otherUser: otherUser.id,
      curator: curatorUser.id,
      client: profile.id,
      other: other.id,
      type: type.id,
    });
  });

  after(async () => {
    const users = [ids.manager!, ids.clientUser!, ids.otherUser!, ids.curator!];
    await prisma.stage.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.other!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('клиенту: дел и идущих работ нет, приостановленная — одна, ответ о ней', async () => {
    assert.deepEqual(await queries.pendingActions(client()), []);
    const live = await queries.liveWorks(client());
    assert.equal(live.length, 0);
    const paused = await queries.pausedWorksCount(client());
    assert.equal(paused, 1, 'чужая или завершённая работа вошла в счёт');
    const answer = idleAnswer({ forClient: true, live: live.length, paused });
    assert.notEqual(answer.lead, 'Действующих работ нет.');
    assert.equal(answer.lead, 'Работа приостановлена — сейчас от вас ничего не требуется.');
    assert.equal(answer.request, false, 'клиента с приостановленной работой зовут в новую заявку');
  });

  it('куратору: дел и идущих работ нет, ответ — о приостановке', async () => {
    assert.deepEqual(await queries.curatorTasksData(curator()), []);
    const live = await queries.liveWorks(curator());
    assert.equal(live.length, 0);
    const paused = await queries.pausedWorksCount(curator());
    assert.equal(paused, 1);
    const answer = idleAnswer({ forClient: false, live: live.length, paused });
    assert.notEqual(answer.detail, 'Действующих назначений нет.');
    assert.equal(answer.detail, 'Ваша работа приостановлена: менеджер сообщит, когда продолжать.');
  });

  it('куратор без договора поручения приостановленных работ не видит', async () => {
    assert.equal(await queries.pausedWorksCount({ ...curator(), expertNdaSignedAt: null }), 0);
  });
});
