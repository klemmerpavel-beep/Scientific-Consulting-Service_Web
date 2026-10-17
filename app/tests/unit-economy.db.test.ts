/**
 * Экономика работы на настоящей базе (план по образцу, К-4, решение
 * Р-594): доля расходов вида ложится на работы этого вида по поступлениям
 * месяца, «Деньги по работам» и экран оплат считают её одинаково, а
 * менеджер, клиент и куратор её не получают.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('экономика работы', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const projects: string[] = [];

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
      data: { email: `eco-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    const head = await prisma.user.create({
      data: { email: `eco-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const expert = await prisma.user.create({
      data: { email: `eco-expert-${stamp}@example.org`, fullName: 'Куратор', role: 'EXPERT' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: `Клиент ${stamp}`, normalizedName: `клиент ${stamp}` },
    });
    const type = await prisma.serviceType.create({ data: { code: `eco-${stamp}`, name: 'Вид для проверки экономики' } });
    const other = await prisma.serviceType.create({ data: { code: `eco-other-${stamp}`, name: 'Другой вид' } });
    Object.assign(ids, { manager: manager.id, head: head.id, expert: expert.id, client: client.id, type: type.id, other: other.id });

    // Две работы одного вида: в сентябре поступило 300 000 и 100 000.
    // Третья — другого вида: на неё расход первого вида не ложится.
    for (const [index, typeId, amount] of [
      [1, type.id, 30_000_000n],
      [2, type.id, 10_000_000n],
      [3, other.id, 50_000_000n],
    ] as const) {
      const project = await prisma.project.create({
        data: {
          code: `PD-ECO-${String(stamp).slice(-4)}-${index}`,
          clientId: client.id,
          serviceTypeId: typeId,
          title: `Работа ${index}`,
          managerId: manager.id,
          expertId: expert.id,
        },
      });
      projects.push(project.id);
      await prisma.contract.create({
        data: {
          projectId: project.id,
          number: `ЭК-${stamp}-${index}`,
          totalAmount: amount * 2n,
          tranches: {
            create: [{ title: 'Аванс', amount, status: 'PAID', paidOn: new Date(Date.UTC(2026, 8, 10)) }],
          },
        },
      });
    }
    await prisma.expertPayout.create({
      data: { projectId: projects[0]!, expertId: expert.id, amount: 6_000_000n, status: 'ACCRUED' },
    });

    // Расходы вида: август (поступлений нет — перейдёт на сентябрь) и
    // сентябрь; октябрь — поступлений после него нет, расход не разложен.
    // Общий расход без вида на работы не ложится вовсе.
    const category = await prisma.expenseCategory.findUniqueOrThrow({ where: { id: 'promotion' } });
    await prisma.expense.createMany({
      data: [
        { month: new Date(Date.UTC(2026, 7, 1)), categoryId: category.id, amount: 1_000_000n, serviceTypeId: type.id, createdById: head.id },
        { month: new Date(Date.UTC(2026, 8, 1)), categoryId: category.id, amount: 3_000_000n, serviceTypeId: type.id, createdById: head.id },
        { month: new Date(Date.UTC(2026, 9, 1)), categoryId: category.id, amount: 700_000n, serviceTypeId: type.id, createdById: head.id },
        { month: new Date(Date.UTC(2026, 8, 1)), categoryId: category.id, amount: 9_000_000n, serviceTypeId: null, createdById: head.id, note: `eco-${stamp}` },
      ],
    });
  });

  after(async () => {
    await prisma.expense.deleteMany({ where: { OR: [{ serviceTypeId: { in: [ids.type!, ids.other!] } }, { note: `eco-${stamp}` }] } });
    await prisma.expertPayout.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projects } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: { in: [ids.type!, ids.other!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager!, ids.head!, ids.expert!] } } });
    await prisma.$disconnect();
  });

  it('руководитель: доля расходов вида — по поступлениям месяца, с переносом августа на сентябрь', async () => {
    const first = await finance.projectTypeExpenses(actor(ids.head!, 'HEAD'), projects[0]!);
    const second = await finance.projectTypeExpenses(actor(ids.head!, 'HEAD'), projects[1]!);
    const third = await finance.projectTypeExpenses(actor(ids.head!, 'HEAD'), projects[2]!);
    // (10 000 + 30 000) делятся 3 : 1.
    assert.equal(first?.share, 3_000_000n);
    assert.equal(second?.share, 1_000_000n);
    assert.equal(first?.pending, 700_000n);
    assert.equal(first?.typeName, 'Вид для проверки экономики');
    // Другой вид и общий расход на работу не легли.
    assert.equal(third?.share, 0n);
    assert.equal(third?.pending, 0n);
  });

  it('«Деньги по работам» считают ту же долю и маржу после неё', async () => {
    const summary = await finance.financeSummary(actor(ids.head!, 'HEAD'));
    const row = summary.rows.find((item) => item.projectId === projects[0]);
    assert.ok(row);
    assert.equal(row.typeExpenses, 3_000_000n);
    // Маржа = 300 000 + 300 000 − 60 000; после расходов вида — минус 30 000.
    assert.equal(row.margin, 54_000_000n);
    assert.equal(row.net, 51_000_000n);
    assert.equal(row.netShare, 85);
  });

  it('менеджер, клиент и куратор долю расходов вида не получают', async () => {
    assert.equal(await finance.projectTypeExpenses(actor(ids.manager!, 'MANAGER'), projects[0]!), null);
    assert.equal(
      await finance.projectTypeExpenses(actor(ids.client!, 'CLIENT', { clientProfileId: ids.client! }), projects[0]!),
      null,
    );
    assert.equal(await finance.projectTypeExpenses(actor(ids.expert!, 'EXPERT'), projects[0]!), null);
  });
});
