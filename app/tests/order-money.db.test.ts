/**
 * «Деньги по заказу» на настоящей базе (решения Р-870, Р-871): кто
 * записывает поступление, как считаются поступило, остаток и переплата,
 * исправление и сторно, плановый остаток по договору, закрытые и
 * перенесённые из книги работы, и что клиент не получает внутреннего
 * комментария ни в данных экрана, ни в письме.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'm'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('деньги по заказу', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { orderBalance, REST_TRANCHE_TITLE } = await import('../src/lib/cabinet/money.ts');
  const { moscowToday } = await import('../src/lib/cabinet/clock.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const users: string[] = [];

  const who = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date('2026-01-01T00:00:00Z') : null,
    ...extra,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const stranger = () => who(ids.stranger!, 'MANAGER');
  const curator = () => who(ids.expert!, 'EXPERT');
  const client = () => who(ids.clientUser!, 'CLIENT', { clientProfileId: ids.client! });
  const day = (offset: number) => new Date(moscowToday().getTime() + offset * 86_400_000);

  /** Работа с договором и плановым остатком на всю сумму — как после ручного заказа. */
  const newWork = async (suffix: string, extra: Record<string, unknown> = {}, total = 10_000_000n) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-OM-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Заказ ${suffix}`,
        managerId: ids.manager!,
        expertId: ids.expert!,
        ...extra,
      },
    });
    projects.push(project.id);
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `ОМ-${tail}-${suffix}`, totalAmount: total },
    });
    await prisma.tranche.create({
      data: { contractId: contract.id, title: REST_TRANCHE_TITLE, amount: total, status: 'PLANNED' },
    });
    return { projectId: project.id, contractId: contract.id };
  };

  const balance = async (projectId: string) => {
    const contract = await prisma.contract.findUniqueOrThrow({
      where: { projectId },
      include: { tranches: true, project: { select: { status: true } } },
    });
    return orderBalance(contract.project.status, contract.totalAmount, contract.tranches);
  };
  const restTranche = async (contractId: string) =>
    prisma.tranche.findFirst({ where: { contractId, title: REST_TRANCHE_TITLE, status: 'PLANNED' } });

  before(async () => {
    const make = async (suffix: string, role: Actor['role'], fullName: string) => {
      const user = await prisma.user.create({
        data: { email: `om-${suffix}-${stamp}@example.org`, fullName, role, notifyEmail: true },
      });
      users.push(user.id);
      return user.id;
    };
    ids.head = await make('head', 'HEAD', 'Руководитель Денег');
    ids.manager = await make('mgr', 'MANAGER', 'Менеджер Денег');
    ids.stranger = await make('other', 'MANAGER', 'Чужой Менеджер');
    ids.expert = await make('exp', 'EXPERT', 'Куратор Денег');
    ids.clientUser = await make('cli', 'CLIENT', 'Клиент Денег');
    const profile = await prisma.clientProfile.create({
      data: { userId: ids.clientUser, fullName: 'Клиент Денег', normalizedName: `om клиент ${stamp}` },
    });
    ids.client = profile.id;
    const erased = await prisma.clientProfile.create({
      data: { fullName: 'Удалено', normalizedName: `om удалено ${stamp}`, erasedAt: new Date() },
    });
    ids.erased = erased.id;
    const type = await prisma.serviceType.create({ data: { code: `om-${stamp}`, name: 'Проверка денег заказа' } });
    ids.type = type.id;
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { userId: { in: users } }] } });
    await prisma.auditEvent.deleteMany({ where: { OR: [{ projectId: { in: projects } }, { actorId: { in: users } }] } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projects } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.headCheck.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.erased!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('поступление записывают руководитель и менеджер своей работы; клиент, куратор и чужой менеджер — нет', async () => {
    const { projectId } = await newWork('R');
    const input = { projectId, amount: 1_000_000n, paidOn: day(-1), note: 'Перевод на карту' };
    await assert.rejects(finance.recordReceipt(client(), input), AccessDenied, 'клиент записал поступление');
    await assert.rejects(finance.recordReceipt(curator(), input), AccessDenied, 'куратор записал поступление');
    await assert.rejects(finance.recordReceipt(stranger(), input), AccessDenied, 'чужой менеджер записал поступление');
    await finance.recordReceipt(manager(), input);
    await finance.recordReceipt(head(), { ...input, note: '' });
    assert.equal((await balance(projectId)).received, 2_000_000n);
  });

  it('поступило, остаток и переплата; плановый остаток идёт за договором', async () => {
    const { projectId, contractId } = await newWork('S');
    await finance.recordReceipt(manager(), { projectId, amount: 3_000_000n, paidOn: day(-3) });
    assert.deepEqual(await balance(projectId), { contract: 10_000_000n, received: 3_000_000n, rest: 7_000_000n, overpaid: 0n });
    assert.equal((await restTranche(contractId))?.amount, 7_000_000n, 'плановый остаток не уменьшился');

    await finance.recordReceipt(manager(), { projectId, amount: 8_000_000n, paidOn: day(0) });
    assert.deepEqual(await balance(projectId), { contract: 10_000_000n, received: 11_000_000n, rest: 0n, overpaid: 1_000_000n });
    assert.equal(await restTranche(contractId), null, 'погашенный остаток не снят');

    const money = await finance.projectMoney(manager(), projectId);
    assert.equal(money?.received, 11_000_000n);
    assert.equal(money?.awaiting, 0n);
    assert.equal(money?.adjustment, -1_000_000n, 'переплата не видна сводке договора');
    assert.equal(money?.margin, undefined, 'менеджеру отдана маржа');
  });

  it('исправление суммы и даты, затем сторно; прежние значения — в журнале, клиенту не пишется', async () => {
    const { projectId, contractId } = await newWork('C');
    const wrong = await finance.recordReceipt(manager(), { projectId, amount: 9_000_000n, paidOn: day(-2), note: 'опечатка' });
    await assert.rejects(
      finance.correctReceipt(stranger(), wrong.id, { amount: 4_000_000n, paidOn: day(-2) }),
      AccessDenied,
    );
    await assert.rejects(
      finance.correctReceipt(manager(), wrong.id, { amount: 4_000_000n, paidOn: day(5) }),
      /позже сегодняшнего/u,
    );
    const before = await prisma.notificationOutbox.count({ where: { projectId } });
    await finance.correctReceipt(manager(), wrong.id, { amount: 4_000_000n, paidOn: day(-4), note: 'Перевод по счёту № 7' });
    assert.deepEqual(await balance(projectId), { contract: 10_000_000n, received: 4_000_000n, rest: 6_000_000n, overpaid: 0n });
    assert.equal((await restTranche(contractId))?.amount, 6_000_000n, 'остаток не вернулся после исправления');
    assert.equal(await prisma.notificationOutbox.count({ where: { projectId } }), before, 'клиенту ушло письмо об исправлении');
    const entry = await prisma.auditEvent.findFirstOrThrow({ where: { objectId: wrong.id, action: 'TRANCHE_CORRECTED' } });
    assert.deepEqual(
      { ...(entry.payload as Record<string, unknown>) },
      {
        amountFrom: '9000000',
        amountTo: '4000000',
        paidOnFrom: day(-2).toISOString().slice(0, 10),
        paidOnTo: day(-4).toISOString().slice(0, 10),
        noteChanged: true,
      },
    );
    assert.doesNotMatch(JSON.stringify(entry.payload), /счёту/u, 'текст комментария попал в журнал');

    await assert.rejects(
      finance.setTrancheStatus(manager(), wrong.id, 'REVERSED', null, ''),
      /без причины/u,
    );
    await finance.setTrancheStatus(manager(), wrong.id, 'REVERSED', null, 'Деньги вернули клиенту');
    assert.deepEqual(await balance(projectId), { contract: 10_000_000n, received: 0n, rest: 10_000_000n, overpaid: 0n });
    assert.equal((await restTranche(contractId))?.amount, 10_000_000n, 'сторно не вернуло плановый остаток');
    await assert.rejects(
      finance.correctReceipt(manager(), wrong.id, { amount: 1_000n, paidOn: day(-1) }),
      /только поступление/u,
      'сторнированное исправили',
    );
  });

  it('клиент не получает комментария ни в данных экрана, ни в письме', async () => {
    const { projectId } = await newWork('N');
    const note = 'Внутреннее: перевод от родителей, счёт 15';
    const tranche = await finance.recordReceipt(head(), { projectId, amount: 2_500_000n, paidOn: day(-1), note });
    const own = await finance.projectContract(head(), projectId);
    assert.equal(own?.tranches.find((row) => row.id === tranche.id)?.note, note);
    const seen = await finance.projectContract(client(), projectId);
    const row = seen?.tranches.find((item) => item.id === tranche.id);
    assert.ok(row !== undefined, 'клиент не видит поступления');
    assert.equal('note' in row, false, 'комментарий в данных экрана клиента');
    assert.doesNotMatch(JSON.stringify(seen, (_, value) => (typeof value === 'bigint' ? value.toString() : value)), /родителей/u);
    const letters = await prisma.notificationOutbox.findMany({ where: { projectId, userId: ids.clientUser } });
    assert.ok(letters.length > 0, 'клиенту не ушло письмо о поступлении');
    for (const letter of letters) {
      assert.doesNotMatch(`${letter.subject}\n${letter.body}`, /родителей|счёт 15/u, 'комментарий в письме клиенту');
    }
    assert.match(letters[0]!.body, /25\s000\s₽/u);
  });

  it('закрытая и перенесённая из книги работа: поступление и исправление принимаются, письма клиенту нет', async () => {
    const { projectId } = await newWork('I', { status: 'COMPLETED', source: 'IMPORT', closedOn: day(-30) });
    const tranche = await finance.recordReceipt(manager(), { projectId, amount: 5_000_000n, paidOn: day(-20) });
    await finance.correctReceipt(manager(), tranche.id, { amount: 6_000_000n, paidOn: day(-20) });
    assert.equal((await balance(projectId)).received, 6_000_000n);
    assert.equal(
      await prisma.notificationOutbox.count({ where: { projectId, userId: ids.clientUser } }),
      0,
      'клиенту работы из книги ушло письмо',
    );
  });

  it('отменённая работа принимает поступление; остаток у неё — ноль', async () => {
    const { projectId } = await newWork('X', { status: 'CANCELLED', closedOn: day(-5) });
    await finance.recordReceipt(head(), { projectId, amount: 1_000_000n, paidOn: day(-10) });
    assert.deepEqual(await balance(projectId), { contract: 10_000_000n, received: 1_000_000n, rest: 0n, overpaid: 0n });
  });

  it('без договора, по обезличенному клиенту, с датой в будущем и длинным комментарием — отказ', async () => {
    const bare = await prisma.project.create({
      data: {
        code: `PD-OM-${tail}-B`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: 'Без договора',
        managerId: ids.manager!,
      },
    });
    projects.push(bare.id);
    await assert.rejects(
      finance.recordReceipt(manager(), { projectId: bare.id, amount: 100n, paidOn: day(-1) }),
      /сумму договора/u,
    );
    const { projectId } = await newWork('E', { clientId: ids.erased });
    await assert.rejects(
      finance.recordReceipt(head(), { projectId, amount: 100n, paidOn: day(-1) }),
      /удалены по его требованию/u,
    );
    const { projectId: live } = await newWork('F');
    await assert.rejects(
      finance.recordReceipt(manager(), { projectId: live, amount: 100n, paidOn: day(3) }),
      /позже сегодняшнего/u,
    );
    await assert.rejects(
      finance.recordReceipt(manager(), { projectId: live, amount: 100n, paidOn: day(-1), note: 'я'.repeat(501) }),
      /не длиннее 500/u,
    );
    await assert.rejects(finance.recordReceipt(manager(), { projectId: live, amount: 0n, paidOn: day(-1) }), /больше нуля/u);
  });

  it('журнал: поступление — сумма, дата и признак комментария, без текста', async () => {
    const { projectId } = await newWork('J');
    const tranche = await finance.recordReceipt(manager(), { projectId, amount: 700_000n, paidOn: day(-1), note: 'секрет' });
    const entry = await prisma.auditEvent.findFirstOrThrow({ where: { objectId: tranche.id, action: 'TRANCHE_RECEIVED' } });
    assert.deepEqual(entry.payload, { amount: '700000', paidOn: day(-1).toISOString().slice(0, 10), noted: true });
    assert.equal(entry.actorRole, 'MANAGER');
  });
});
