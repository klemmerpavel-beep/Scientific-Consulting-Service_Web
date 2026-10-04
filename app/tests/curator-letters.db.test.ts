/**
 * Письма куратору на настоящей базе (требование Э-03, решение Р-323): путь
 * «письмо → вход → работа» без сообщений вне кабинета.
 *
 * Руководитель заводит учётную запись куратора — уходит приглашение с
 * кнопкой на «Назначенные работы»; ссылка входа возвращает на этот экран.
 * Назначение без договора поручения — письмо без названия и темы; отметка
 * договора — письмо «Доступ к материалам открыт», один раз; назначение с
 * договором — письмо с кнопкой на карточку работы, которую куратор видит.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'c'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('письма куратору (Э-03)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const projects = await import('../src/lib/cabinet/projects.ts');
  const auth = await import('../src/lib/cabinet/auth.ts');
  const { projectByCode } = await import('../src/lib/cabinet/queries.ts');
  const { createRawToken, digest } = await import('../src/lib/cabinet/token.ts');

  const ids: Record<string, string> = {};
  const head = (): Actor => ({ id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null });
  const letters = (userId: string, eventKind: string) =>
    prisma.notificationOutbox.findMany({ where: { userId, eventKind, channel: 'EMAIL' }, orderBy: { createdAt: 'asc' } });

  before(async () => {
    const [chief, manager] = await Promise.all([
      prisma.user.create({ data: { email: `cl-head-${stamp}@example.org`, fullName: 'Руководитель писем', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `cl-mgr-${stamp}@example.org`, fullName: 'Менеджер писем', role: 'MANAGER' } }),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { fullName: 'Заказчикова Анна Петровна', normalizedName: `cl клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cl-${stamp}`, name: 'Сопровождение ВКР' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CL-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Выпускная работа по обогащению руд',
        topic: 'Флотация медно-никелевых руд Норильского месторождения',
        dueOn: new Date(Date.UTC(2026, 11, 15)),
        managerId: manager.id,
      },
    });
    Object.assign(ids, { head: chief.id, manager: manager.id, profile: profile.id, type: type.id, project: project.id, code: project.code });
  });

  after(async () => {
    const people = [ids.head, ids.manager, ids.curator, ids.switched].filter((id): id is string => id !== undefined);
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: people } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: ids.project }, { actorId: { in: people } }, { objectId: { in: people } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.profile } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.session.deleteMany({ where: { userId: { in: people } } });
    await prisma.loginToken.deleteMany({ where: { userId: { in: people } } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: people } } });
    await prisma.user.deleteMany({ where: { id: { in: people } } });
  });

  it('учётная запись куратора — приглашение с кнопкой на «Назначенные работы»', async () => {
    const user = await admin.createUser(head(), { email: `cl-cur-${stamp}@example.org`, fullName: 'Куратор Писем', role: 'EXPERT' });
    ids.curator = user.id;
    const [letter, ...rest] = await letters(user.id, 'CURATOR_INVITED');
    assert.equal(rest.length, 0);
    assert.equal(letter?.subject, 'Вам открыт кабинет куратора ProDisser');
    assert.equal(letter?.path, '/cabinet/projects');
    assert.match(letter!.body, /договора поручения/u);
    assert.doesNotMatch(letter!.body, /\/cabinet\/enter\//u, 'ссылка входа в письме (Р-162)');
  });

  it('вход по ссылке возвращает на экран из письма', async () => {
    const token = createRawToken();
    await prisma.loginToken.create({
      data: {
        selector: token.selector,
        verifierHash: digest(token.verifier),
        userId: ids.curator!,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        requestIp: '127.0.0.1',
        returnPath: '/cabinet/projects',
      },
    });
    const entered = await auth.enterWithToken(token.value, '127.0.0.1', 'node-test');
    assert.equal(entered?.returnPath, '/cabinet/projects');
  });

  it('назначение без договора — без названия, темы и данных клиента (ОЭ-5)', async () => {
    await projects.assignExpert(head(), ids.project!, ids.curator!);
    const [letter] = await letters(ids.curator!, 'WORK_ASSIGNED');
    assert.equal(letter?.subject, `Вас назначили куратором работы ${ids.code}`);
    assert.equal(letter?.path, '/cabinet/projects');
    assert.match(letter!.body, /Тип сопровождения: Сопровождение ВКР\./u);
    assert.match(letter!.body, /Срок работы: 15 декабря 2026\./u);
    assert.match(letter!.body, /Менеджер: Менеджер писем\./u);
    assert.doesNotMatch(letter!.body, /обогащению|Флотация|Заказчикова/u);
  });

  it('отметка договора — «Доступ к материалам открыт», один раз', async () => {
    await admin.signExpertNda(head(), ids.curator!, new Date(Date.UTC(2026, 9, 1)));
    await admin.signExpertNda(head(), ids.curator!, new Date(Date.UTC(2026, 9, 2)));
    const rows = await letters(ids.curator!, 'NDA_SIGNED');
    assert.equal(rows.length, 1, 'исправление даты дало второе письмо');
    assert.equal(rows[0]!.subject, 'Доступ к материалам открыт');
    assert.equal(rows[0]!.path, '/cabinet/projects');
  });

  it('назначение с договором — название и тема, кнопка на карточку, которую куратор видит', async () => {
    await projects.assignExpert(head(), ids.project!, null);
    await projects.assignExpert(head(), ids.project!, ids.curator!);
    const rows = await letters(ids.curator!, 'WORK_ASSIGNED');
    const letter = rows.at(-1)!;
    assert.equal(rows.length, 2);
    assert.equal(letter.path, `/cabinet/projects/${ids.code}`);
    assert.match(letter.body, /Выпускная работа по обогащению руд/u);
    assert.match(letter.body, /Тема: Флотация/u);
    assert.doesNotMatch(letter.body, /Заказчикова/u, 'ФИО клиента в письме');
    const curator: Actor = {
      id: ids.curator!,
      role: 'EXPERT',
      status: 'ACTIVE',
      clientProfileId: null,
      expertNdaSignedAt: new Date(Date.UTC(2026, 9, 2)),
    };
    assert.ok((await projectByCode(curator, ids.code!)) !== null, 'кнопка ведёт на закрытую карточку');
  });

  it('смена роли на куратора — приглашение один раз', async () => {
    const user = await admin.createUser(head(), { email: `cl-sw-${stamp}@example.org`, fullName: 'Сменивший роль', role: 'MANAGER' });
    ids.switched = user.id;
    await admin.setUserRole(head(), user.id, 'EXPERT');
    await admin.setUserRole(head(), user.id, 'MANAGER');
    await admin.setUserRole(head(), user.id, 'EXPERT');
    assert.equal((await letters(user.id, 'CURATOR_INVITED')).length, 1);
  });
});
