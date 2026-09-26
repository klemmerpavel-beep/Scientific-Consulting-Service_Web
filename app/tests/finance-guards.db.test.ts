/**
 * Защиты финансового контура на настоящей базе (решение Р-244): гонка
 * оплаты и списания, повторная отметка выплаты, начисление без
 * исполнителя, дата в будущем, занятый номер договора, сумма договора
 * ниже полученного, удаление только планового транша, запрет новых
 * денежных записей по обезличенной и отменённой работе, привязка
 * документа к чужому траншу, маржа без списанного, повторный счёт
 * доходит, о списании клиенту не пишется, журнал с суммами.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'g'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-fin-'));

const enabled = Boolean(process.env.DATABASE_URL);

describe('защиты финансового контура', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const finance = await import('../src/lib/cabinet/finance.ts');
  const { uploadVersion } = await import('../src/lib/cabinet/materials.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const ids: Record<string, string> = {};
  const projects: string[] = [];

  const head = (): Actor => ({
    id: ids.head!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const newProject = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const project = await prisma.project.create({
      data: {
        code: `PD-FG-${tail}-${suffix}`,
        clientId: ids.client!,
        serviceTypeId: ids.type!,
        title: `Работа ${suffix}`,
        managerId: ids.head!,
        expertId: ids.expert!,
        ...extra,
      },
    });
    projects.push(project.id);
    return project.id;
  };
  const newContract = async (projectId: string, total = 60_000_000n) =>
    finance.saveContract(head(), {
      projectId,
      number: `ФГ-${tail}-${projects.length}`,
      totalAmount: total,
    });

  before(async () => {
    const headUser = await prisma.user.create({
      data: { email: `fg-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const expert = await prisma.user.create({
      data: { email: `fg-exp-${stamp}@example.org`, fullName: 'Эксперт', role: 'EXPERT' },
    });
    const clientUser = await prisma.user.create({
      data: { email: `fg-cli-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT', notifyEmail: true },
    });
    const client = await prisma.clientProfile.create({
      data: { userId: clientUser.id, fullName: 'Клиент', normalizedName: `fg клиент ${stamp}` },
    });
    const erased = await prisma.clientProfile.create({
      data: { fullName: 'Удалено', normalizedName: `fg удалено ${stamp}`, erasedAt: new Date() },
    });
    const type = await prisma.serviceType.create({ data: { code: `fg-${stamp}`, name: 'Проверка денег' } });
    Object.assign(ids, {
      head: headUser.id,
      expert: expert.id,
      clientUser: clientUser.id,
      client: client.id,
      erased: erased.id,
      type: type.id,
    });
  });

  after(async () => {
    await prisma.materialVersion.deleteMany({ where: { material: { projectId: { in: projects } } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.expertPayout.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projects } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projects } } });
    await prisma.project.deleteMany({ where: { id: { in: projects } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.client!, ids.erased!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    const users = [ids.head!, ids.expert!, ids.clientUser!];
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('оплата и списание одновременно: проходит одно, оплата не стирается', async () => {
    const projectId = await newProject('R');
    const contract = await newContract(projectId);
    const { tranche } = await finance.addTranche(head(), {
      contractId: contract.id,
      title: 'Аванс',
      amount: 20_000_000n,
    });
    await finance.setTrancheStatus(head(), tranche.id, 'INVOICED');
    const results = await Promise.allSettled([
      finance.setTrancheStatus(head(), tranche.id, 'PAID', new Date('2026-09-01T00:00:00Z')),
      finance.setTrancheStatus(head(), tranche.id, 'WRITTEN_OFF'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const row = await prisma.tranche.findUniqueOrThrow({ where: { id: tranche.id } });
    if (row.status === 'WRITTEN_OFF') assert.equal(row.paidOn, null);
    else assert.equal(row.status, 'PAID');
  });

  it('дата поступления в будущем отклоняется', async () => {
    const projectId = await newProject('D');
    const contract = await newContract(projectId);
    const { tranche } = await finance.addTranche(head(), { contractId: contract.id, title: 'Итог', amount: 100n });
    await assert.rejects(
      () => finance.setTrancheStatus(head(), tranche.id, 'PAID', new Date('2062-09-26T00:00:00Z')),
      /позже сегодняшнего дня/u,
    );
  });

  it('повторная отметка выплаты не переписывает дату; без исполнителя не начисляется', async () => {
    const projectId = await newProject('P');
    const payout = await finance.addPayout(head(), { projectId, amount: 5_000_000n });
    await finance.markPayoutPaid(head(), payout.id, new Date('2025-12-30T00:00:00Z'));
    await assert.rejects(
      () => finance.markPayoutPaid(head(), payout.id, new Date('2026-01-10T00:00:00Z')),
      /уже отмечено/u,
    );
    const row = await prisma.expertPayout.findUniqueOrThrow({ where: { id: payout.id } });
    assert.equal(row.paidOn?.toISOString().slice(0, 10), '2025-12-30');

    const orphan = await newProject('O', { expertId: null });
    await assert.rejects(() => finance.addPayout(head(), { projectId: orphan, amount: 100n }), /исполнителя/u);
  });

  it('номер договора другой работы и сумма ниже полученного отклоняются с причиной', async () => {
    const first = await newProject('N1');
    const second = await newProject('N2');
    await finance.saveContract(head(), { projectId: first, number: `Н-${tail}`, totalAmount: 1000n });
    await assert.rejects(
      () => finance.saveContract(head(), { projectId: second, number: `Н-${tail}`, totalAmount: 1000n }),
      /уже заведён по другой работе/u,
    );
    const contract = await prisma.contract.findUniqueOrThrow({ where: { projectId: first } });
    const { tranche } = await finance.addTranche(head(), { contractId: contract.id, title: 'Весь', amount: 1000n });
    await finance.setTrancheStatus(head(), tranche.id, 'PAID', new Date('2026-01-15T00:00:00Z'));
    await assert.rejects(
      () => finance.saveContract(head(), { projectId: first, number: `Н-${tail}`, totalAmount: 500n }),
      /меньше уже полученного/u,
    );
    await finance.saveContract(head(), { projectId: first, number: `Н-${tail}-2`, totalAmount: 1500n });
    const entry = await prisma.auditEvent.findFirstOrThrow({
      where: { objectId: contract.id, action: 'CONTRACT_SAVED', payload: { path: ['numberFrom'], equals: `Н-${tail}` } },
    });
    assert.deepEqual(entry.payload, { number: `Н-${tail}-2`, total: '1500', numberFrom: `Н-${tail}`, totalFrom: '1000' });
  });

  it('удаляется только плановый транш; заведение и удаление — в журнале', async () => {
    const projectId = await newProject('T');
    const contract = await newContract(projectId);
    const { tranche: planned } = await finance.addTranche(head(), { contractId: contract.id, title: 'План', amount: 700n });
    const { tranche: invoiced } = await finance.addTranche(head(), { contractId: contract.id, title: 'Счёт', amount: 300n });
    await finance.setTrancheStatus(head(), invoiced.id, 'INVOICED');
    await assert.rejects(() => finance.removeTranche(head(), invoiced.id), /только плановый/u);
    await finance.removeTranche(head(), planned.id);
    assert.equal(await prisma.tranche.count({ where: { id: planned.id } }), 0);
    const actions = (await prisma.auditEvent.findMany({ where: { objectId: planned.id } })).map((e) => e.action);
    assert.deepEqual(actions.sort(), ['TRANCHE_ADDED', 'TRANCHE_REMOVED']);
  });

  it('по обезличенному клиенту и отменённой работе новые записи не заводятся', async () => {
    const erasedWork = await newProject('E', { clientId: ids.erased });
    await assert.rejects(() => newContract(erasedWork), /удалены по его требованию/u);

    const cancelled = await newProject('C');
    const contract = await newContract(cancelled);
    const { tranche } = await finance.addTranche(head(), { contractId: contract.id, title: 'Выставлен', amount: 400n });
    await finance.setTrancheStatus(head(), tranche.id, 'INVOICED');
    await prisma.project.update({ where: { id: cancelled }, data: { status: 'CANCELLED' } });
    await assert.rejects(
      () => finance.addTranche(head(), { contractId: contract.id, title: 'Ещё', amount: 100n }),
      /отменена/u,
    );
    await assert.rejects(() => finance.addPayout(head(), { projectId: cancelled, amount: 100n }), /отменена/u);
    // Оплату уже выставленного счёта отметить можно.
    await finance.setTrancheStatus(head(), tranche.id, 'PAID', new Date('2026-02-01T00:00:00Z'));
  });

  it('документ не привязывается к траншу чужой работы; вид — из перечня', async () => {
    const mine = await newProject('M');
    const other = await newProject('X');
    const contract = await newContract(other);
    const { tranche } = await finance.addTranche(head(), { contractId: contract.id, title: 'Чужой', amount: 100n });
    const file = {
      projectId: mine,
      kind: 'INVOICE' as const,
      trancheId: tranche.id,
      originalName: 'schet.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4'),
    };
    await assert.rejects(() => uploadVersion(head(), file), /Транш не найден/u);
    await assert.rejects(
      () => uploadVersion(head(), { ...file, trancheId: null, kind: 'SECRET' as never }),
      /Неизвестный вид/u,
    );
  });

  it('маржа — без списанного; повторный счёт доходит, о списании клиенту не пишется', async () => {
    const projectId = await newProject('G');
    const contract = await newContract(projectId, 10_000_000n);
    const { tranche: lost } = await finance.addTranche(head(), { contractId: contract.id, title: 'Долг', amount: 6_000_000n });
    await finance.setTrancheStatus(head(), lost.id, 'WRITTEN_OFF');
    await finance.addPayout(head(), { projectId, amount: 5_000_000n });
    const money = await finance.projectMoney(head(), projectId);
    assert.equal(money?.margin, -1_000_000n);

    const { tranche } = await finance.addTranche(head(), { contractId: contract.id, title: 'Счёт', amount: 100n });
    await finance.setTrancheStatus(head(), tranche.id, 'INVOICED');
    await finance.setTrancheStatus(head(), tranche.id, 'PLANNED');
    await finance.setTrancheStatus(head(), tranche.id, 'INVOICED');
    const letters = await prisma.notificationOutbox.findMany({
      where: { projectId, eventKind: 'PAYMENT_STATUS_CHANGED', channel: 'EMAIL' },
      select: { dedupKey: true },
    });
    const invoiced = letters.filter((l) => l.dedupKey.startsWith(`tranche:${tranche.id}:invoiced:`));
    assert.equal(invoiced.length, 2, 'повторный счёт не дошёл');
    assert.equal(
      letters.filter((l) => l.dedupKey.startsWith(`tranche:${lost.id}:written_off`)).length,
      0,
      'клиенту написали о списании',
    );
  });
});
