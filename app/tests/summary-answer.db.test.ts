/**
 * Ответ «Сводки» руководителя — по всей практике (решения Р-207, Р-695):
 * сорванный срок в работе менеджера входит во фразу «Сорвано сроков этапов
 * и работ», хотя в «Моих» делах руководителя его нет (Р-337). Прежде фраза
 * брала набор «Моих» и рядом с «Действующих работ» по всей практике
 * писала сорванные сроки одних своих работ.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('ответ «Сводки» руководителя — по всей практике (Р-695)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const attention = await import('../src/lib/cabinet/attention.ts');
  const { answerDetail } = await import('../src/lib/cabinet/summary-answer.ts');
  const { moscowToday, now } = await import('../src/lib/cabinet/clock.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const code = `PD-SA-${String(stamp).slice(-6)}`;
  // Набор сужается до работы проверки: в общей базе могут быть чужие.
  const ours = <S extends { project: { code: string } }, W extends { code: string }>(light: {
    overdue: readonly S[];
    lateWorks: readonly W[];
  }) => ({
    overdue: light.overdue.filter((stage) => stage.project.code === code),
    lateWorks: light.lateWorks.filter((work) => work.code === code),
  });

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `sa-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Ответа'),
      make('mgr', 'MANAGER', 'Менеджер Ответа'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Клиент Ответа', normalizedName: `sa клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `sa-${stamp}`, name: 'Проверка ответа' } });
    // Работа менеджера: у руководителя своих работ нет вовсе.
    const project = await prisma.project.create({
      data: {
        code,
        title: `Работа менеджера ${stamp}`,
        status: 'ACTIVE',
        clientId: profile.id,
        serviceTypeId: type.id,
        managerId: managerUser.id,
      },
    });
    await prisma.stage.create({
      data: {
        projectId: project.id,
        position: 1,
        title: 'Сорванная глава',
        state: 'IN_PROGRESS',
        // Срок — день, московский (Р-257): десять дней назад ровно.
        dueOn: new Date(moscowToday(now()).getTime() - 10 * DAY),
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: ids.project }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: users } }] } });
    await prisma.stage.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('«Мои» дела руководителя сорванного срока менеджера не содержат (Р-337)', async () => {
    const sources = await attention.attentionSources(head());
    const mine = ours(sources.light);
    assert.equal(mine.overdue.length, 0);
    // Прежняя фраза — по набору «Моих»: сорванного срока в ней нет.
    assert.doesNotMatch(
      answerDetail({ light: mine, live: 1, comments: 0, versions: 0, leads: 0 }) ?? '',
      /Сорвано сроков/u,
    );
  });

  it('фраза ответа руководителя называет сорванный срок менеджера', async () => {
    const sources = await attention.attentionSources(head());
    const light = ours(await attention.practiceLight(head(), sources));
    assert.equal(light.overdue.length, 1);
    const detail = answerDetail({ light, live: 1, comments: 0, versions: 0, leads: 0 }) ?? '';
    assert.match(detail, /Сорвано сроков этапов и работ — 1; старший — «Сорванная глава», 10 дней\./u);
    assert.match(detail, /Действующих работ — 1\./u);
  });

  it('менеджеру ответ — тот же набор, что у плашек', async () => {
    const sources = await attention.attentionSources(manager());
    assert.equal(await attention.practiceLight(manager(), sources), sources.light);
    assert.equal(ours(sources.light).overdue.length, 1);
  });
});
