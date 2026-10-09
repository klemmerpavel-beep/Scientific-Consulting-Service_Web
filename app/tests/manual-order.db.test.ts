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
  const { ClientChoiceNeeded, NEW_CLIENT } = await import('../src/lib/cabinet/client-match.ts');
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
    await prisma.notificationOutbox.deleteMany({ where: { projectId: { in: projects } } });
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
    assert.match(created.code, /^PD-2026-\d{3,}$/u);
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

  it('совпадение только по ФИО — выбор менеджера; почта находит карточку сама (М-18, Р-308)', async () => {
    const head = actor(ids.head!, 'HEAD');
    const first = await prisma.project.findUniqueOrThrow({ where: { id: projects[0]! }, select: { clientId: true } });
    const before = await prisma.clientProfile.findUniqueOrThrow({ where: { id: first.clientId } });

    // Однофамилец без почты и телефона — отказ с выбором; карточка не тронута.
    await assert.rejects(
      createManualOrder(head, { customer: `  ${customer.replace(/ /gu, '  ')} `, phone: '+7 900 555-44-33', serviceTypeId: ids.type!, title: 'Доработка' }),
      ClientChoiceNeeded,
    );
    const untouched = await prisma.clientProfile.findUniqueOrThrow({ where: { id: first.clientId } });
    assert.equal(untouched.phone, before.phone, 'карточка однофамильца изменена без выбора');

    // Кандидаты — ФИО, маски, число работ; без полной почты.
    const { nameCandidates } = await import('../src/lib/cabinet/manual-order.ts');
    const { candidateLine } = await import('../src/lib/cabinet/client-match.ts');
    const found = await nameCandidates(actor(ids.manager!, 'MANAGER'), customer);
    assert.ok(found.some((row) => row.id === first.clientId && row.works >= 1));
    assert.ok(found.every((row) => !candidateLine(row).includes('client@example.org')));

    // Выбор «новая карточка» — однофамилец получает свою.
    const fresh = await createManualOrder(head, {
      customer, serviceTypeId: ids.type!, title: 'Другой человек', clientChoice: NEW_CLIENT,
    });
    projects.push(fresh.projectId);
    const freshProject = await prisma.project.findUniqueOrThrow({ where: { id: fresh.projectId } });
    assert.notEqual(freshProject.clientId, first.clientId);

    // Выбор найденной карточки — заказ ложится в неё, пустой телефон дополняется.
    const chosen = await createManualOrder(head, {
      customer, phone: '+7 900 555-44-33', serviceTypeId: ids.type!, title: 'Доработка', clientChoice: first.clientId,
    });
    projects.push(chosen.projectId);
    const chosenProject = await prisma.project.findUniqueOrThrow({ where: { id: chosen.projectId }, include: { client: true } });
    assert.equal(chosenProject.clientId, first.clientId);
    assert.equal(chosenProject.client.phone, '+7 900 555-44-33');

    // Чужой идентификатор в выборе не принимается.
    await assert.rejects(
      createManualOrder(head, { customer, serviceTypeId: ids.type!, title: 'Статья', clientChoice: 'nope' }),
      /среди найденных нет/u,
    );

    // Почта и телефон находят карточку и при другом написании ФИО.
    const byMail = await createManualOrder(head, {
      customer: 'Совсем Другое Имя', email: 'CLIENT@example.org', serviceTypeId: ids.type!, title: 'По почте',
    });
    projects.push(byMail.projectId);
    const byPhone = await createManualOrder(head, {
      customer: 'Ещё Одно Имя', phone: '8 (900) 555 44 33', serviceTypeId: ids.type!, title: 'По телефону',
    });
    projects.push(byPhone.projectId);
    const [mailProject, phoneProject] = await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: byMail.projectId } }),
      prisma.project.findUniqueOrThrow({ where: { id: byPhone.projectId } }),
    ]);
    assert.equal(mailProject.clientId, first.clientId);
    assert.equal(phoneProject.clientId, first.clientId);
  });

  it('клиент другого менеджера менеджеру не предлагается и заказа от него не принимает (Р-419)', async () => {
    const { nameCandidates } = await import('../src/lib/cabinet/manual-order.ts');
    const other = await prisma.user.create({
      data: { email: `order-mgr2-${stamp}@example.org`, fullName: 'Другой менеджер', role: 'MANAGER' },
    });
    try {
      const foreignName = `Чужой Клиент Заказа ${stamp}`;
      const foreign = await createManualOrder(actor(ids.head!, 'HEAD'), {
        customer: foreignName,
        email: `foreign-${stamp}@example.org`,
        phone: '+7 911 222-33-44',
        serviceTypeId: ids.type!,
        title: 'Работа другого менеджера',
        managerId: other.id,
      });
      projects.push(foreign.projectId);
      const manager = actor(ids.manager!, 'MANAGER');

      // По ФИО карточка менеджеру не предлагается — заводится своя.
      assert.equal((await nameCandidates(manager, foreignName)).length, 0);
      assert.equal((await nameCandidates(actor(ids.head!, 'HEAD'), foreignName)).length, 1);
      const own = await createManualOrder(manager, { customer: foreignName, serviceTypeId: ids.type!, title: 'Однофамилец' });
      projects.push(own.projectId);
      const ownProject = await prisma.project.findUniqueOrThrow({ where: { id: own.projectId } });
      const foreignProject = await prisma.project.findUniqueOrThrow({ where: { id: foreign.projectId } });
      assert.notEqual(ownProject.clientId, foreignProject.clientId, 'заказ менеджера лёг в карточку чужого клиента');

      // По почте и телефону — отказ: заказ вносит руководитель.
      for (const contact of [{ email: `FOREIGN-${stamp}@example.org` }, { phone: '8 911 222 33 44' }]) {
        await assert.rejects(
          createManualOrder(manager, { customer: 'Кто Угодно', serviceTypeId: ids.type!, title: 'Обход', ...contact }),
          /клиент другого менеджера/u,
        );
      }
      assert.equal(await prisma.project.count({ where: { clientId: foreignProject.clientId } }), 1);
    } finally {
      await prisma.user.delete({ where: { id: other.id } }).catch(() => undefined);
    }
  });

  it('почта — по формату и не сотрудника', async () => {
    const head = actor(ids.head!, 'HEAD');
    await assert.rejects(
      createManualOrder(head, { customer: `Почтовый ${customer}`, email: 'кто-то@почта', serviceTypeId: ids.type!, title: 'Статья' }),
      /с ошибкой/u,
    );
    await assert.rejects(
      createManualOrder(head, { customer: `Почтовый ${customer}`, email: `order-mgr-${stamp}@example.org`, serviceTypeId: ids.type!, title: 'Статья' }),
      /адрес сотрудника/u,
    );
  });

  it('договор менеджера — письмо руководителю с суммой; в Telegram суммы нет; от руководителя — нет', async () => {
    const byManager = await createManualOrder(actor(ids.manager!, 'MANAGER'), {
      customer: `Договорной ${customer}`, serviceTypeId: ids.type!, title: 'Статья', cost: 12_500_000n, paid: 2_500_000n,
    });
    projects.push(byManager.projectId);
    const rows = await prisma.notificationOutbox.findMany({
      where: { projectId: byManager.projectId, eventKind: 'ORDER_WITH_CONTRACT', userId: ids.head! },
    });
    const mail = rows.find((row) => row.channel === 'EMAIL');
    assert.ok(mail !== undefined, 'руководитель не узнал о договоре');
    // Суммы в письме нет: она — в деле «Проверьте договор» (РК-13, Р-347).
    assert.equal(mail.subject, `Заведён заказ с договором: ${byManager.code}`);
    for (const row of rows) {
      assert.doesNotMatch(`${row.subject} ${row.body}`, /125|₽/u, 'сумма в уведомлении');
    }

    const byHead = await createManualOrder(actor(ids.head!, 'HEAD'), {
      customer: `Договорной ${customer}`, email: `contract-${stamp}@example.org`, serviceTypeId: ids.type!, title: 'Статья', cost: 100_00n,
      clientChoice: NEW_CLIENT,
    });
    projects.push(byHead.projectId);
    assert.equal(
      await prisma.notificationOutbox.count({ where: { projectId: byHead.projectId, eventKind: 'ORDER_WITH_CONTRACT' } }),
      0,
    );
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

  it('оплата без стоимости отклоняется, а не теряется молча (Р-505)', async () => {
    const head = actor(ids.head!, 'HEAD');
    const before = await prisma.project.count({ where: { title: 'Статья без стоимости' } });
    for (const cost of [null, 0n]) {
      await assert.rejects(
        createManualOrder(head, {
          customer,
          serviceTypeId: ids.type!,
          title: 'Статья без стоимости',
          cost,
          paid: 5_000_000n,
          clientChoice: 'new',
        }),
        (error: unknown) => error instanceof OrderInputError && /стоимост/u.test(error.message),
      );
    }
    assert.equal(await prisma.project.count({ where: { title: 'Статья без стоимости' } }), before);
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
    // Пока есть остаток — не больше 99 % (Р-444).
    assert.equal(paidShare({ cost: 1_000_000n, paid: 999_500n }), '99 %');
    assert.equal(paidShare({ cost: 1_000_000n, paid: 1_000_000n }), '100 %');
    assert.equal(paidShare({ cost: 1_000_000n, paid: 1_100_000n }), '110 %');
    assert.equal(paidShare({ cost: 3_000_000n, paid: 2_000_000n }), '67 %');
  });
});
