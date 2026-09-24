/**
 * Финансовый контур на настоящей базе. Проверяется главное: что состав
 * ответа зависит от роли не на экране, а в объекте — маржи и начислений
 * в нём просто нет у того, кому они не положены.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('деньги проекта', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { parseAmount } = await import('../src/lib/cabinet/money.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};

  const actor = (id: string, role: Actor['role'], extra: Partial<Actor> = {}): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
    ...extra,
  });

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `fin-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const head = await prisma.user.create({
      data: { email: `fin-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const expert = await prisma.user.create({
      data: { email: `fin-expert-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({
      data: { code: `fin-${stamp}`, name: 'Кандидатская диссертация' },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-TEST-${String(stamp).slice(-3)}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Проект для проверки денег',
        managerId: manager.id,
        expertId: expert.id,
      },
    });
    Object.assign(ids, {
      manager: manager.id,
      head: head.id,
      expert: expert.id,
      client: client.id,
      type: type.id,
      project: project.id,
    });
  });

  after(async () => {
    await prisma.expertPayout.deleteMany({ where: { projectId: ids.project } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: ids.project } } });
    await prisma.contract.deleteMany({ where: { projectId: ids.project } });
    await prisma.auditEvent.deleteMany({ where: { projectId: ids.project } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: ids.project } });
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.manager, ids.head, ids.expert] } },
    });
    await prisma.$disconnect();
  });

  it('договор заводит только руководитель', async () => {
    await assert.rejects(
      finance.saveContract(actor(ids.manager, 'MANAGER'), {
        projectId: ids.project,
        number: `М-${stamp}`,
        totalAmount: parseAmount('600 000'),
      }),
      AccessDenied,
      'менеджер завёл договор, хотя финансовый контур ведёт руководитель',
    );

    const contract = await finance.saveContract(actor(ids.head, 'HEAD'), {
      projectId: ids.project,
      number: `Д-${stamp}`,
      totalAmount: parseAmount('600 000'),
    });
    ids.contract = contract.id;
    assert.equal(contract.totalAmount, 60_000_000n);
  });

  it('транши складываются, оплата требует даты', async () => {
    for (const [title, amount] of [
      ['Старт работ', '180 000'],
      ['Главы 1–2', '240 000'],
      ['Сдача работы', '180 000'],
    ] as const) {
      const { tranche, exceedsContract } = await finance.addTranche(actor(ids.head, 'HEAD'), {
        contractId: ids.contract,
        title,
        amount: parseAmount(amount),
      });
      assert.equal(exceedsContract, false, `транш «${title}» вышел за сумму договора`);
      if (title === 'Старт работ') ids.firstTranche = tranche.id;
    }

    await assert.rejects(
      finance.setTrancheStatus(actor(ids.head, 'HEAD'), ids.firstTranche, 'PAID', null),
      /дата поступления/,
    );
    const paid = await finance.setTrancheStatus(
      actor(ids.head, 'HEAD'),
      ids.firstTranche,
      'PAID',
      new Date('2026-04-14T00:00:00Z'),
    );
    assert.equal(paid.status, 'PAID');
  });

  it('оплаченный транш не откатывается, неизвестный статус не принимается', async () => {
    // Прежде статус принимался любой, в том числе PAID → PLANNED со
    // стиранием даты поступления (решение Р-224).
    await assert.rejects(
      finance.setTrancheStatus(actor(ids.head, 'HEAD'), ids.firstTranche, 'PLANNED'),
      /не переводится/u,
    );
    await assert.rejects(
      finance.setTrancheStatus(actor(ids.head, 'HEAD'), ids.firstTranche, 'REFUNDED' as never),
      /Неизвестный статус/u,
    );
    const kept = await prisma.tranche.findUniqueOrThrow({ where: { id: ids.firstTranche } });
    assert.equal(kept.status, 'PAID');
    assert.ok(kept.paidOn !== null, 'дата поступления стёрта');
  });

  it('счёт выставляется, долг списывается, списанный дальше не идёт', async () => {
    const { tranche } = await finance.addTranche(actor(ids.head, 'HEAD'), {
      contractId: ids.contract,
      title: 'Проверка списания',
      amount: parseAmount('1 000'),
    });
    try {
      const invoiced = await finance.setTrancheStatus(actor(ids.head, 'HEAD'), tranche.id, 'INVOICED');
      assert.equal(invoiced.status, 'INVOICED');
      const written = await finance.setTrancheStatus(actor(ids.head, 'HEAD'), tranche.id, 'WRITTEN_OFF');
      assert.equal(written.status, 'WRITTEN_OFF');
      await assert.rejects(
        finance.setTrancheStatus(actor(ids.head, 'HEAD'), tranche.id, 'PAID', new Date('2026-05-01T00:00:00Z')),
        /не переводится/u,
      );
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { dedupKey: { startsWith: `tranche:${tranche.id}:` } } });
      await prisma.tranche.delete({ where: { id: tranche.id } });
    }
  });

  it('транш сверх суммы договора отмечается, но не отбрасывается', async () => {
    const { tranche, exceedsContract } = await finance.addTranche(actor(ids.head, 'HEAD'), {
      contractId: ids.contract,
      title: 'Доплата по допсоглашению',
      amount: parseAmount('50 000'),
    });
    assert.equal(exceedsContract, true, 'превышение суммы договора не отмечено');
    await prisma.tranche.delete({ where: { id: tranche.id } });
  });

  it('состав ответа зависит от роли', async () => {
    await finance.addPayout(actor(ids.head, 'HEAD'), {
      projectId: ids.project,
      amount: parseAmount('200 000'),
      comment: 'Главы 1–2',
    });

    const forClient = await finance.projectMoney(
      actor(ids.client, 'CLIENT', { clientProfileId: ids.client }),
      ids.project,
    );
    assert.ok(forClient !== null);
    assert.equal(forClient.received, 18_000_000n, 'клиент видит оплаченное');
    assert.ok(!('margin' in forClient), 'клиенту показана маржа');
    assert.ok(!('payoutsAccrued' in forClient), 'клиенту показаны начисления эксперту');

    const forManager = await finance.projectMoney(actor(ids.manager, 'MANAGER'), ids.project);
    assert.ok(forManager !== null);
    assert.ok(!('margin' in forManager), 'менеджеру показана маржа');
    assert.ok(!('payoutsAccrued' in forManager), 'менеджеру показаны начисления');

    const forHead = await finance.projectMoney(actor(ids.head, 'HEAD'), ids.project);
    assert.ok(forHead !== null);
    assert.equal(forHead.payoutsAccrued, 20_000_000n);
    // Маржа = сумма договора − начисления: 600 000 − 200 000.
    assert.equal(forHead.margin, 40_000_000n);

    const forExpert = await finance.projectMoney(actor(ids.expert, 'EXPERT'), ids.project);
    assert.equal(forExpert, null, 'эксперт получил доступ к договору');
  });

  it('эксперт видит собственное вознаграждение и не видит маржи', async () => {
    const own = await finance.ownPayouts(actor(ids.expert, 'EXPERT'));
    assert.equal(own.accrued, 20_000_000n);
    assert.equal(own.paid, 0n);
    assert.equal(own.rows.length, 1);

    await assert.rejects(
      finance.financeSummary(actor(ids.expert, 'EXPERT')),
      AccessDenied,
      'эксперт получил сводку по практике',
    );
    await assert.rejects(
      finance.financeSummary(actor(ids.manager, 'MANAGER')),
      AccessDenied,
      'менеджер получил сводку по практике',
    );
  });

  it('сводка руководителя сходится по строкам', async () => {
    const { rows, totals } = await finance.financeSummary(actor(ids.head, 'HEAD'));
    const row = rows.find((r) => r.projectId === ids.project);
    assert.ok(row !== undefined);
    assert.equal(row.contracted, 60_000_000n);
    assert.equal(row.received, 18_000_000n);
    assert.equal(row.awaiting, 42_000_000n);
    assert.equal(row.margin, 40_000_000n);
    assert.ok(totals.contracted >= row.contracted);
  });

  it('строки сводки идут в устойчивом порядке', async () => {
    // Порядок строк задавался физическим порядком записей в таблице и
    // менялся при всякой правке работы: два наполнения подряд давали
    // разный снимок экрана денег (решение Р-190).
    const { rows } = await finance.financeSummary(actor(ids.head, 'HEAD'));
    const codes = rows.map((r) => r.code);
    assert.deepEqual(codes, [...codes].sort((a, b) => a.localeCompare(b)));
  });
});
