/**
 * Заказ, заведённый вручную, и строка книги в карточке работы (решение Р-269).
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'm'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('заказ вручную', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { createManualOrder, OrderInputError } = await import('../src/lib/cabinet/manual-order.ts');
  const { bookRowOf, paidShare } = await import('../src/lib/cabinet/book-row.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const projects: string[] = [];
  const customer = `Заказчиков Тест Ручной ${stamp}`;

  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `order-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `order-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const expert = await prisma.user.create({
      data: { email: `order-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const type = await prisma.serviceType.create({ data: { code: `order-${stamp}`, name: 'Вид для заказа' } });
    Object.assign(ids, { head: head.id, manager: manager.id, expert: expert.id, type: type.id });
  });

  after(async () => {
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projects } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    const clients = await prisma.project.findMany({ where: { id: { in: projects } }, select: { clientId: true } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clients.map((c) => c.clientId) } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!, ids.expert!] } } });
    await prisma.$disconnect();
  });

  it('заводит работу, карточку клиента и договор с поступлением и остатком', async () => {
    const created = await createManualOrder(actor(ids.head!, 'HEAD'), {
      customer,
      email: 'Client@Example.org',
      serviceTypeId: ids.type!,
      title: 'Научная статья Q2',
      topic: 'Статья по итогам эксперимента',
      orderedOn: new Date('2026-09-01T00:00:00Z'),
      dueOn: new Date('2026-12-15T00:00:00Z'),
      cost: 5_000_000n,
      paid: 2_000_000n,
      managerId: ids.manager!,
    });
    projects.push(created.projectId);
    assert.match(created.code, /^PD-2026-\d{3}$/u);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: created.projectId },
      include: { client: true, contract: { include: { tranches: true } } },
    });
    assert.equal(project.managerId, ids.manager);
    assert.equal(project.status, 'ACTIVE');
    assert.equal(project.client.fullName, customer);
    assert.equal(project.client.email, 'client@example.org');
    assert.equal(project.contract?.totalAmount, 5_000_000n);
    const tranches = project.contract!.tranches.map((t) => `${t.status}:${t.amount}`).sort();
    assert.deepEqual(tranches, ['PAID:2000000', 'PLANNED:3000000']);
  });

  it('повторный заказ того же человека ложится в его карточку', async () => {
    const created = await createManualOrder(actor(ids.head!, 'HEAD'), {
      customer: `  ${customer.replace(/ /gu, '  ')} `,
      serviceTypeId: ids.type!,
      title: 'Доработка',
    });
    projects.push(created.projectId);
    const [first, second] = await prisma.project.findMany({
      where: { id: { in: projects } },
      orderBy: { createdAt: 'asc' },
      select: { clientId: true, contract: { select: { id: true } } },
    });
    assert.equal(second!.clientId, first!.clientId);
    assert.equal(second!.contract, null, 'без стоимости договор не заводится');
  });

  it('менеджер заводит заказ только на себя', async () => {
    const created = await createManualOrder(actor(ids.manager!, 'MANAGER'), {
      customer: `Другой ${customer}`,
      serviceTypeId: ids.type!,
      title: 'Диплом',
      managerId: ids.head!,
    });
    projects.push(created.projectId);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.projectId } });
    assert.equal(project.managerId, ids.manager);
  });

  it('оплата больше стоимости и пустой заказчик отклоняются понятной причиной', async () => {
    const head = actor(ids.head!, 'HEAD');
    await assert.rejects(
      createManualOrder(head, { customer, serviceTypeId: ids.type!, title: 'Статья', cost: 100n, paid: 200n }),
      OrderInputError,
    );
    await assert.rejects(
      createManualOrder(head, { customer: ' ', serviceTypeId: ids.type!, title: 'Статья' }),
      OrderInputError,
    );
  });

  it('эксперт заказ не заводит, строку книги не видит', async () => {
    const expert = actor(ids.expert!, 'EXPERT');
    await assert.rejects(
      createManualOrder(expert, { customer, serviceTypeId: ids.type!, title: 'Статья' }),
      AccessDenied,
    );
    assert.equal(await bookRowOf(expert, projects[0]!), null);
  });

  it('переплата по книге заводится доплатой сверх стоимости (Р-273)', async () => {
    const { openContract, EXTRA_TITLE } = await import('../src/lib/cabinet/import/apply.ts');
    const created = await createManualOrder(actor(ids.head!, 'HEAD'), {
      customer: `Доплатин ${customer}`,
      serviceTypeId: ids.type!,
      title: 'Диссертация с доп. услугой',
    });
    projects.push(created.projectId);
    await prisma.$transaction((tx) =>
      openContract(tx, {
        projectId: created.projectId,
        code: created.code,
        orderDate: null,
        deadline: null,
        rowCost: 2_500_000n,
        rowPaid: 3_000_000n,
      }),
    );
    const contract = await prisma.contract.findUniqueOrThrow({
      where: { projectId: created.projectId },
      include: { tranches: true },
    });
    assert.equal(contract.totalAmount, 3_000_000n, 'сумма договора — всё полученное');
    const tranches = contract.tranches.map((t) => `${t.status}:${t.amount}:${t.title}`).sort();
    assert.deepEqual(tranches, [
      `PAID:2500000:Поступление по книге учёта`,
      `PAID:500000:${EXTRA_TITLE}`,
    ]);
  });

  it('у заказа не из книги строки книги нет; доля оплаты считается как в книге', async () => {
    assert.equal(await bookRowOf(actor(ids.head!, 'HEAD'), projects[0]!), null);
    assert.equal(paidShare({ cost: 12_500_000n, paid: 4_166_700n }), '33 %');
    assert.equal(paidShare({ cost: 0n, paid: 0n }), null);
  });
});
