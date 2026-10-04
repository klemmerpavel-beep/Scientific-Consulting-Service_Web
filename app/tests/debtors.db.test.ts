/**
 * «Деньги → Должники» (требование РК-10, решение Р-345) — шаг H.12: сумма
 * перечня равна плитке «Просрочено по траншам»; давние сверху; транш
 * отменённой работы и будущий в перечень не входят; перенос даты — с
 * причиной в журнал и только руководителем; после отметки оплаты и
 * списания строка исчезает; клиенту и менеджеру перечень не отдаётся,
 * заготовка напоминания — без сумм.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'v'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('«Должники» (РК-10)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { moneyBrief } = await import('../src/lib/cabinet/summary.ts');
  const { draftText } = await import('../src/lib/cabinet/message-drafts.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const mine = async () => (await finance.overdueTranches(head())).filter((row) => row.title.endsWith(String(stamp)));
  const day = (offset: number) => {
    const today = new Date(Math.floor(Date.now() / DAY) * DAY);
    return new Date(today.getTime() + offset * DAY);
  };

  before(async () => {
    const make = (suffix: string, role: Actor['role'], fullName: string) =>
      prisma.user.create({ data: { email: `db-${suffix}-${stamp}@example.org`, fullName, role } });
    const [headUser, managerUser, clientUser] = await Promise.all([
      make('head', 'HEAD', 'Руководитель Долгов'),
      make('mgr', 'MANAGER', 'Менеджер Долгов'),
      make('cl', 'CLIENT', 'Клиент Долгов'),
    ]);
    const profile = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент Долгов', normalizedName: `db клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `db-${stamp}`, name: 'Проверка долгов' } });
    const base = { clientId: profile.id, serviceTypeId: type.id, managerId: managerUser.id };
    const [live, cancelled] = await Promise.all([
      prisma.project.create({ data: { ...base, code: `PD-DB-${String(stamp).slice(-6)}-L`, title: 'Работа с долгом', status: 'ACTIVE' } }),
      prisma.project.create({ data: { ...base, code: `PD-DB-${String(stamp).slice(-6)}-C`, title: 'Отменённая', status: 'CANCELLED' } }),
    ]);
    const [contract, deadContract] = await Promise.all([
      prisma.contract.create({ data: { projectId: live.id, number: `DB-${stamp}`, totalAmount: 30_000_000n } }),
      prisma.contract.create({ data: { projectId: cancelled.id, number: `DBC-${stamp}`, totalAmount: 1_000_000n } }),
    ]);
    const tranche = (contractId: string, title: string, amount: bigint, plannedDate: Date, status: 'PLANNED' | 'INVOICED') =>
      prisma.tranche.create({ data: { contractId, title: `${title} ${stamp}`, amount, plannedDate, status } });
    const [old, invoiced, future, dead] = await Promise.all([
      tranche(contract.id, 'Аванс', 5_000_000n, day(-20), 'PLANNED'),
      tranche(contract.id, 'Глава 1', 7_000_000n, day(-5), 'INVOICED'),
      tranche(contract.id, 'Глава 2', 9_000_000n, day(10), 'PLANNED'),
      tranche(deadContract.id, 'Отменённой', 1_000_000n, day(-30), 'PLANNED'),
    ]);
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      clientUser: clientUser.id,
      client: profile.id,
      type: type.id,
      live: live.id,
      cancelled: cancelled.id,
      contract: contract.id,
      deadContract: deadContract.id,
      old: old.id,
      invoiced: invoiced.id,
      future: future.id,
      dead: dead.id,
    });
  });

  after(async () => {
    const projects = [ids.live!, ids.cancelled!];
    const users = [ids.head!, ids.manager!, ids.clientUser!];
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ userId: { in: users } }, { projectId: { in: projects } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.tranche.deleteMany({ where: { contractId: { in: [ids.contract!, ids.deadContract!] } } });
    await prisma.contract.deleteMany({ where: { id: { in: [ids.contract!, ids.deadContract!] } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('H.12: сумма перечня равна плитке «Просрочено по траншам»; давние сверху', async () => {
    const [rows, brief] = await Promise.all([finance.overdueTranches(head()), moneyBrief(head())]);
    assert.equal(rows.reduce((acc, row) => acc + row.amount, 0n), brief.overdue);
    const own = await mine();
    assert.deepEqual(
      own.map((row) => row.trancheId),
      [ids.old, ids.invoiced],
      'отменённая работа или будущий платёж в перечне',
    );
    assert.equal(own[0]!.manager, 'Менеджер Долгов');
    assert.equal(own[0]!.client, 'Клиент Долгов');
    assert.ok(own[0]!.late >= 19);
  });

  it('перенос даты — только руководителем и с причиной; причина в журнале', async () => {
    await assert.rejects(finance.rescheduleTranche(manager(), ids.invoiced!, day(14), 'Просил клиент'), AccessDenied);
    await assert.rejects(finance.rescheduleTranche(head(), ids.invoiced!, day(14), '  '), /причину переноса/u);
    await finance.rescheduleTranche(head(), ids.invoiced!, day(14), 'Клиент ждёт стипендию');
    assert.deepEqual((await mine()).map((row) => row.trancheId), [ids.old]);
    const entry = await prisma.auditEvent.findFirst({ where: { objectId: ids.invoiced, action: 'TRANCHE_RESCHEDULED' } });
    assert.equal((entry?.payload as Record<string, unknown> | null)?.reason, 'Клиент ждёт стипендию');
  });

  it('после отметки оплаты строка исчезает; списание — тоже, без письма клиенту', async () => {
    await finance.setTrancheStatus(head(), ids.old!, 'PAID', day(-1));
    assert.deepEqual(await mine(), []);
    await finance.rescheduleTranche(head(), ids.invoiced!, day(-2), 'Ошибка в дате');
    assert.deepEqual((await mine()).map((row) => row.trancheId), [ids.invoiced]);
    await finance.setTrancheStatus(head(), ids.invoiced!, 'WRITTEN_OFF');
    assert.deepEqual(await mine(), []);
    const letters = await prisma.notificationOutbox.findMany({ where: { userId: ids.clientUser, body: { contains: 'списан' } } });
    assert.deepEqual(letters, []);
  });

  it('клиенту и менеджеру перечень не отдаётся; заготовка напоминания — без сумм', async () => {
    await assert.rejects(finance.overdueTranches(client()), AccessDenied);
    await assert.rejects(finance.overdueTranches(manager()), AccessDenied);
    const reminder = await finance.trancheForReminder(head(), ids.live!, ids.future!);
    assert.equal(reminder?.title, `Глава 2 ${stamp}`);
    assert.equal(await finance.trancheForReminder(head(), ids.cancelled!, ids.future!), null, 'транш чужой работы');
    const text = draftText('HEAD', 'payment', { stage: null, today: '', payment: { title: reminder!.title, date: '1 октября 2026' } }) ?? '';
    assert.doesNotMatch(text, /90 000|₽/u);
  });
});
