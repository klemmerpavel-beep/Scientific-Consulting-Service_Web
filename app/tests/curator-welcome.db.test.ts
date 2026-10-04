/**
 * «Сообщить руководителю» и первый вход куратора на настоящей базе
 * (требование Э-12, решение Р-331): кнопка даёт руководителю строку
 * очереди и дело на «Сегодня»; повтор раньше суток — отказ без письма;
 * отметка договора гасит дело; блок первого входа закрывается один раз
 * для учётной записи; почта менеджера — куратору, но не клиенту (С-4).
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('«Сообщить руководителю» и первый вход куратора (Э-12)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const admin = await import('../src/lib/cabinet/admin.ts');
  const channels = await import('../src/lib/cabinet/channels.ts');
  const { projectByCode, todayItems } = await import('../src/lib/cabinet/queries.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const curator = () => who(ids.curator!, 'EXPERT');
  const head = () => who(ids.head!, 'HEAD');
  const letters = () =>
    prisma.notificationOutbox.findMany({ where: { userId: ids.head, eventKind: 'NDA_WAITING', channel: 'EMAIL' } });
  const waiting = async () => (await todayItems(head())).ndaWaiting.filter((row) => row.id === ids.curator);

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `cw-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, clientUser, curatorUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Договоров'),
      make('mgr', 'MANAGER', 'Менеджер Договоров'),
      make('cl', 'CLIENT', 'Клиент Договоров'),
      make('cur', 'EXPERT', 'Куратор Без Договора'),
    ]);
    await prisma.expertProfile.create({ data: { userId: curatorUser.id } });
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Договоров', normalizedName: `cw клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `cw-${stamp}`, name: 'Проверка договора' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-CW-${String(stamp).slice(-6)}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа для проверки договора',
        managerId: managerUser.id,
        expertId: curatorUser.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      managerEmail: managerUser.email,
      clientUser: clientUser.id,
      curator: curatorUser.id,
      client: profile.id,
      type: type.id,
      project: project.id,
      code: project.code,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!, ids.clientUser!, ids.curator!];
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: users } }, { objectId: { in: users } }] } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.expertProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('назначение без договора уже даёт руководителю дело', async () => {
    const [row] = await waiting();
    assert.equal(row?.requestedAt, null);
    assert.equal(row?.works, 1);
  });

  it('кнопка: руководителю — письмо и дело «куратор ждёт договор»', async () => {
    const at = await admin.requestNda(curator());
    const [letter, ...rest] = await letters();
    assert.equal(rest.length, 0);
    assert.equal(letter?.subject, 'Куратор Куратор Без Договора ждёт договор поручения');
    assert.equal(letter?.path, `/cabinet/manage/users#nda-${ids.curator}`);
    const [row] = await waiting();
    assert.deepEqual(row?.requestedAt, at);
    assert.deepEqual(await admin.ndaRequestedAt(curator()), at);
  });

  it('повтор раньше суток — отказ без второго письма; через сутки — можно', async () => {
    await assert.rejects(admin.requestNda(curator()), /через сутки/u);
    assert.equal((await letters()).length, 1);
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await admin.requestNda(curator(), later);
    assert.equal((await letters()).length, 2);
  });

  it('не куратору кнопка не разрешена', async () => {
    await assert.rejects(admin.requestNda(who(ids.manager!, 'MANAGER')), /не разрешено/u);
  });

  it('отметка договора гасит пометку и дело; после неё сообщать нечего', async () => {
    await admin.signExpertNda(head(), ids.curator!, new Date(Date.UTC(2026, 9, 1)));
    assert.equal(await admin.ndaRequestedAt(curator()), null);
    assert.deepEqual(await waiting(), []);
    await assert.rejects(admin.requestNda(curator()), /уже отмечен/u);
  });

  it('почта менеджера — куратору в данных карточки, клиенту — нет (С-4)', async () => {
    const signed = who(ids.curator!, 'EXPERT', { expertNdaSignedAt: new Date(Date.UTC(2026, 9, 1)) });
    const own = await projectByCode(signed, ids.code!);
    assert.equal(own?.manager.email, ids.managerEmail);
    const seen = await projectByCode(who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! }), ids.code!);
    assert.ok(!JSON.stringify(seen).includes(ids.managerEmail!), 'почта менеджера в данных клиента');
  });

  it('блок первого входа куратора закрывается один раз для учётной записи', async () => {
    assert.equal((await channels.welcomeState(curator())).open, true);
    await channels.closeWelcome(curator());
    const first = await prisma.user.findUniqueOrThrow({ where: { id: ids.curator }, select: { welcomeClosedAt: true } });
    assert.ok(first.welcomeClosedAt !== null);
    assert.equal((await channels.welcomeState(curator())).open, false);
    await channels.closeWelcome(curator());
    const second = await prisma.user.findUniqueOrThrow({ where: { id: ids.curator }, select: { welcomeClosedAt: true } });
    assert.deepEqual(second.welcomeClosedAt, first.welcomeClosedAt, 'повторное «Понятно» переписало дату');
  });
});
