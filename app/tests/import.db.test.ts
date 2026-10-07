/**
 * Перенос книги заказов на настоящей базе.
 *
 * Проверяется то, ради чего заведён естественный ключ: повторная загрузка
 * того же файла не создаёт ни одного нового проекта. Книга здесь та же
 * синтетическая, что и в `import.test.ts`: настоящая содержит ФИО клиентов
 * и суммы договоров и в репозиторий не попадает.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { excelSerial, makeWorkbook, type TestRow } from './helpers/make-workbook.ts';

process.env.SESSION_SECRET ??= 'f'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

const GREEN = 'FF00B050';
const RED = 'FFFF0000';

const HEADER: TestRow = [
  'Дата',
  'Заказчик (ФИО)',
  'Тип работы',
  'Описание работы',
  'Дедлайн',
  'Стоимость',
  'Статутус работы',
  'Оплачено',
];

/** Метка прогона отделяет данные проверки от всего, что есть в базе. */
const stamp = Date.now();

function book(paidSecond = '40000', extra: TestRow[] = [], deadlineSecond = '20.12.2025'): Buffer {
  return makeWorkbook([
    HEADER,
    [
      excelSerial('2024-10-14'),
      `Иванов Иван ${stamp}`,
      'Диссертция',
      'Кандидатская, физика',
      excelSerial('2025-06-01'),
      '150000',
      { value: 'закрыт', fill: GREEN },
      '150000',
    ],
    [
      excelSerial('2025-02-03'),
      `Иванов Иван ${stamp}`,
      'Аспирнтура',
      'Пакет поступления',
      deadlineSecond,
      '90000',
      { value: 'в работе', fill: GREEN },
      paidSecond,
    ],
    [
      excelSerial('2025-04-07'),
      `Сидоров Пётр ${stamp}`,
      'Консультационное сопровождение до защиты',
      'Сопровождение',
      'к лету',
      '200000',
      { value: 'остановлен', fill: RED },
      '50000',
    ],
    [
      excelSerial('2025-05-19'),
      `Кузнецова Мария ${stamp}`,
      'Сопроводительное письмо в редакцию',
      'Письмо',
      '20.12.2025',
      '35000',
      { value: 'на старте', fill: null },
      '0',
    ],
    ...extra,
  ]);
}

describe('перенос книги заказов', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const { applyBatch, loadBatch, mergeClients, previewBook } = await import(
    '../src/lib/cabinet/import/apply.ts'
  );

  const ids: Record<string, string> = {};
  const batches: string[] = [];

  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: role === 'EXPERT' ? new Date() : null,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `imp-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `imp-manager-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    Object.assign(ids, { head: head.id, manager: manager.id });

    // Справочник: коды те же, что отдаёт свод написаний.
    for (const [code, name] of [
      ['dissertation', 'Сопровождение диссертационного исследования'],
      ['postgrad', 'Сопровождение аспирантуры'],
      ['consulting', 'Научный консалтинг'],
    ]) {
      const type = await prisma.serviceType.upsert({
        where: { code: code! },
        create: { code: code!, name: name! },
        update: {},
      });
      ids[code!] = type.id;
    }
  });

  after(async () => {
    const projects = await prisma.project.findMany({
      where: { client: { normalizedName: { contains: String(stamp) } } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    await prisma.importRow.deleteMany({ where: { batchId: { in: batches } } });
    await prisma.importBatch.deleteMany({ where: { id: { in: batches } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projectIds } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({
      where: { normalizedName: { contains: String(stamp) } },
    });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.head, ids.manager] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head, ids.manager] } } });
    await prisma.$disconnect();
  });

  it('предпросмотр доступен только руководителю', async () => {
    for (const role of ['MANAGER', 'EXPERT', 'CLIENT'] as const) {
      await assert.rejects(
        previewBook(actor(ids.manager, role), { fileName: 'книга.xlsx', bytes: book() }),
        AccessDenied,
        `роль ${role} получила доступ к переносу истории`,
      );
    }
  });

  it('предпросмотр показывает отчёт и не создаёт проектов', async () => {
    // Счёт ведётся по работам этой проверки: проверки идут параллельно.
    const mine = { managerId: ids.manager };
    const before = await prisma.project.count({ where: mine });
    const preview = await previewBook(actor(ids.head, 'HEAD'), {
      fileName: `книга-${stamp}.xlsx`,
      bytes: book(),
    });
    batches.push(preview.batchId);

    assert.equal(await prisma.project.count({ where: mine }), before, 'предпросмотр создал проект');
    assert.equal(preview.rows.length, 4);
    assert.equal(preview.counts.CREATE, 4);
    assert.equal(preview.totals.cost, 47_500_000n);
    assert.equal(preview.totals.paid, 24_000_000n);
    // Остаток — сумма остатков строк; переплат в этой книге нет (Р-257).
    assert.equal(preview.totals.outstanding, preview.totals.cost - preview.totals.paid);
    assert.equal(preview.totals.overpaid, 0n);
    // Однофамильцы и несведённые написания выведены отдельно.
    assert.equal(preview.duplicates.length, 1);
    assert.deepEqual(preview.duplicates[0]?.rowNumbers, [2, 3]);
    assert.deepEqual(
      preview.unresolvedTypes.map((type) => type.spelling),
      ['Сопроводительное письмо в редакцию'],
    );
    assert.deepEqual(
      preview.conflicts.map((conflict) => conflict.rowNumber),
      [3],
    );
  });

  it('переплата одной строки не гасит остаток другой', async () => {
    // Вторая работа — 90 000 ₽, оплачено 95 000 ₽: переплата 5 000 ₽.
    // Остаток книги — 50 000 (закрыто полностью: 0) + 150 000 + 35 000,
    // а не разность итогов, меньшая на переплату (решение Р-257).
    const preview = await previewBook(actor(ids.head, 'HEAD'), {
      fileName: `книга-${stamp}-переплата.xlsx`,
      bytes: book('95000'),
    });
    batches.push(preview.batchId);
    assert.equal(preview.totals.overpaid, 500_000n);
    assert.equal(preview.totals.outstanding, 18_500_000n);
    assert.equal(
      preview.totals.cost - preview.totals.paid,
      preview.totals.outstanding - preview.totals.overpaid,
    );
  });

  it('фиксация заводит проекты, договоры и транши', async () => {
    const preview = await previewBook(actor(ids.head, 'HEAD'), {
      fileName: `книга-${stamp}-2.xlsx`,
      bytes: book(),
    });
    batches.push(preview.batchId);

    const report = await applyBatch(actor(ids.head, 'HEAD'), preview.batchId, {
      managerId: ids.manager,
    });

    // Четвёртая строка не сведена к позиции справочника и отклонена с причиной.
    assert.equal(report.created, 3);
    assert.equal(report.rejected.length, 1);
    assert.equal(report.rejected[0]?.rowNumber, 5);
    assert.match(report.rejected[0]?.reason ?? '', /не сведено/u);
    assert.equal(report.clientsCreated, 2, 'однофамильцы в книге дали одну карточку');

    // Отчёт зафиксированной загрузки говорит об итоге и помнит лист:
    // прежде фиксация затирала сведения предпросмотра (решение Р-257).
    const reopened = await loadBatch(actor(ids.head, 'HEAD'), preview.batchId);
    assert.notEqual(reopened?.sheet, '', 'лист загрузки потерян при фиксации');
    assert.deepEqual(reopened?.applied, { created: 3, updated: 0, skipped: 0, rejected: 1 });
    assert.equal(preview.applied, null);

    const projects = await prisma.project.findMany({
      where: { client: { normalizedName: { contains: String(stamp) } } },
      select: {
        code: true,
        status: true,
        source: true,
        startedOn: true,
        closedOnPlanned: true,
        contract: { select: { totalAmount: true, tranches: true } },
      },
      orderBy: { code: 'asc' },
    });
    assert.equal(projects.length, 3);
    for (const project of projects) assert.equal(project.source, 'IMPORT');

    // Код выдаётся по году заказа, а не по году переноса.
    assert.match(projects[0]?.code ?? '', /^PD-2024-\d{3}$/u);
    assert.equal(projects[0]?.status, 'COMPLETED');
    // Дата закрытия книги — плановый срок; незавершённые без пометки (РК-23, Р-355).
    for (const project of projects) assert.equal(project.closedOnPlanned, project.status === 'COMPLETED');
    assert.equal(projects[0]?.contract?.totalAmount, 15_000_000n);
    assert.deepEqual(
      projects[0]?.contract?.tranches.map((tranche) => [tranche.status, tranche.amount]),
      [['PAID', 15_000_000n]],
    );

    // Оплачено 40 000 из 90 000: поступление и остаток разнесены.
    const partial = projects.find((project) => project.contract?.totalAmount === 9_000_000n);
    assert.deepEqual(
      partial?.contract?.tranches.map((tranche) => [tranche.status, tranche.amount]).sort(),
      [
        ['PAID', 4_000_000n],
        ['PLANNED', 5_000_000n],
      ].sort(),
    );

    // Красная заливка переводит работу в остановленную.
    const stopped = projects.find((project) => project.status === 'PAUSED');
    assert.ok(stopped !== undefined, 'остановленная работа не перенесена');
  });

  it('повторная загрузка того же файла не создаёт ни одного проекта', async () => {
    // Считаются работы этой проверки, а не все в базе: проверки идут
    // параллельно, и общий счётчик ловил бы чужие записи.
    const mine = { managerId: ids.manager };
    const before = await prisma.project.count({ where: mine });

    const preview = await previewBook(actor(ids.head, 'HEAD'), {
      fileName: `книга-${stamp}-3.xlsx`,
      bytes: book(),
    });
    batches.push(preview.batchId);
    assert.equal(preview.counts.CREATE, 1, 'перенесённые строки снова показаны как новые');
    assert.equal(preview.counts.SKIP, 3);
    assert.equal(
      preview.rows.filter((row) => row.existingCode !== null).length,
      3,
      'в отчёте нет кода проекта, которым строка уже закрыта',
    );

    const report = await applyBatch(actor(ids.head, 'HEAD'), preview.batchId, {
      managerId: ids.manager,
    });
    assert.equal(report.created, 0);
    assert.equal(await prisma.project.count({ where: mine }), before);
  });

  it('зафиксированная загрузка второй раз не фиксируется', async () => {
    const batchId = batches[batches.length - 1]!;
    await assert.rejects(
      applyBatch(actor(ids.head, 'HEAD'), batchId, { managerId: ids.manager }),
      /уже зафиксирована/u,
    );
  });

  it('изменившаяся строка правит свою работу, а не заводит вторую', async () => {
    // Прежде предпросмотр не запоминал прежнюю работу строки, и
    // «обновление» при фиксации заводило вторую — с договором на всю сумму
    // и оплатой ещё раз (решение Р-233).
    const mine = { managerId: ids.manager };
    const before = await prisma.project.count({ where: mine });
    const head = actor(ids.head, 'HEAD');

    // Две загрузки одной книги до фиксации: вторая не должна повторить
    // первую.
    const first = await previewBook(head, { fileName: `книга-${stamp}-4.xlsx`, bytes: book('90000') });
    const second = await previewBook(head, { fileName: `книга-${stamp}-5.xlsx`, bytes: book('90000') });
    batches.push(first.batchId, second.batchId);
    assert.equal(first.counts.UPDATE, 1);

    const report = await applyBatch(head, first.batchId, { managerId: ids.manager });
    assert.equal(report.updated, 1);
    assert.equal(report.created, 0);
    assert.equal(await prisma.project.count({ where: mine }), before);

    const partial = await prisma.contract.findFirstOrThrow({
      where: { totalAmount: 9_000_000n, project: { managerId: ids.manager } },
      select: { tranches: { select: { status: true, amount: true } } },
    });
    const paid = partial.tranches
      .filter((tranche) => tranche.status === 'PAID')
      .reduce((sum, tranche) => sum + tranche.amount, 0n);
    assert.equal(paid, 9_000_000n, 'доплата из книги не дошла до траншей');
    assert.equal(
      partial.tranches.filter((tranche) => tranche.status === 'PLANNED').length,
      0,
      'погашенный остаток остался к получению',
    );

    const again = await applyBatch(head, second.batchId, { managerId: ids.manager });
    assert.equal(again.created, 0, 'вторая загрузка той же книги завела работы');
    assert.equal(again.updated, 0);
    assert.equal(await prisma.project.count({ where: mine }), before);
  });

  it('правка строки книги не отменяет сторно, сделанное в кабинете (Р-435)', async () => {
    const head = actor(ids.head, 'HEAD');
    const contract = await prisma.contract.findFirstOrThrow({
      where: { totalAmount: 9_000_000n, project: { managerId: ids.manager } },
      select: { id: true, tranches: { where: { status: 'PAID' }, orderBy: { amount: 'asc' }, select: { id: true, amount: true } } },
    });
    const reversed = contract.tranches[0]!;
    await prisma.tranche.update({ where: { id: reversed.id }, data: { status: 'REVERSED' } });

    // В книге поменялся только срок; оплата та же, что прежде.
    const preview = await previewBook(head, {
      fileName: `книга-${stamp}-сторно.xlsx`,
      bytes: book('90000', [], '25.12.2025'),
    });
    batches.push(preview.batchId);
    await applyBatch(head, preview.batchId, { managerId: ids.manager });

    const after = await prisma.tranche.findMany({ where: { contractId: contract.id }, select: { status: true, amount: true } });
    const sum = (status: string) => after.filter((row) => row.status === status).reduce((acc, row) => acc + row.amount, 0n);
    assert.equal(sum('PAID'), 9_000_000n - reversed.amount, 'сторнированная оплата заведена заново');
    assert.equal(sum('REVERSED'), reversed.amount);
    assert.equal(sum('PLANNED'), reversed.amount, 'сторнированное не встало к получению');
  });

  it('правка оплаты в книге не возвращает «в работу» работу, отменённую в кабинете (Р-451)', async () => {
    const head = actor(ids.head, 'HEAD');
    const contract = await prisma.contract.findFirstOrThrow({
      where: { totalAmount: 9_000_000n, project: { managerId: ids.manager } },
      select: { projectId: true },
    });
    await prisma.project.update({ where: { id: contract.projectId }, data: { status: 'CANCELLED', closedOn: new Date('2025-11-01T00:00:00Z') } });
    const before = await prisma.project.findUniqueOrThrow({ where: { id: contract.projectId } });

    // В книге поменялась только оплата; состояние и срок — прежние.
    const preview = await previewBook(head, { fileName: `книга-${stamp}-оплата.xlsx`, bytes: book('80000', [], '25.12.2025') });
    batches.push(preview.batchId);
    const report = await applyBatch(head, preview.batchId, { managerId: ids.manager });
    assert.equal(report.updated, 1);

    const after = await prisma.project.findUniqueOrThrow({ where: { id: contract.projectId } });
    assert.equal(after.status, 'CANCELLED', 'работа, отменённая в кабинете, вернулась в работу');
    assert.equal(after.closedOn?.toISOString(), before.closedOn?.toISOString());
    assert.equal(after.dueOn?.toISOString(), before.dueOn?.toISOString());
  });

  it('одну загрузку нельзя зафиксировать дважды и одновременно', async () => {
    const head = actor(ids.head, 'HEAD');
    const extra: TestRow[] = [
      [
        excelSerial('2025-06-02'),
        `Орлова Анна ${stamp}`,
        'Диссертция',
        'Кандидатская',
        '20.12.2025',
        '50000',
        { value: 'в работе', fill: null },
        '0',
      ],
    ];
    const preview = await previewBook(head, { fileName: `книга-${stamp}-6.xlsx`, bytes: book('90000', extra) });
    batches.push(preview.batchId);
    const results = await Promise.allSettled([
      applyBatch(head, preview.batchId, { managerId: ids.manager }),
      applyBatch(head, preview.batchId, { managerId: ids.manager }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      await prisma.project.count({ where: { client: { normalizedName: { contains: `орлова анна ${stamp}` } } } }),
      1,
    );
  });

  it('нечитаемая сумма — замечание и отказ, а не договор на ноль', async () => {
    const head = actor(ids.head, 'HEAD');
    const extra: TestRow[] = [
      [
        excelSerial('2025-07-01'),
        `Петров Олег ${stamp}`,
        'Диссертция',
        'Кандидатская',
        '20.12.2025',
        'договорная',
        { value: 'в работе', fill: null },
        '50000',
      ],
    ];
    const preview = await previewBook(head, { fileName: `книга-${stamp}-7.xlsx`, bytes: book('90000', extra) });
    batches.push(preview.batchId);
    const row = preview.rows.find((candidate) => candidate.customer === `Петров Олег ${stamp}`);
    assert.equal(row?.severity, 'ERROR');
    assert.ok(row?.issues.some((issue) => issue.code === 'AMOUNT_UNREADABLE'));

    const report = await applyBatch(head, preview.batchId, { managerId: ids.manager });
    assert.ok(report.rejected.some((item) => item.rowNumber === row?.rowNumber));
    assert.equal(
      await prisma.project.count({ where: { client: { normalizedName: { contains: `петров олег ${stamp}` } } } }),
      0,
    );
  });

  it('оставленная на разбор строка в отчёте не значится «завести»', async () => {
    // Р-260: мост с Диска исключает строки с ошибкой разбора. Прежде такая
    // строка хранила действие предпросмотра, и отчёт зафиксированной
    // загрузки показывал «завести» у строки, которой в кабинете нет.
    const head = actor(ids.head, 'HEAD');
    const extra: TestRow[] = [
      [
        excelSerial('2025-08-01'),
        `Орлова Вера ${stamp}`,
        'Диссертция',
        'Кандидатская, химия',
        'когда-нибудь',
        '120000',
        { value: 'в работе', fill: null },
        '0',
      ],
    ];
    const preview = await previewBook(head, { fileName: `книга-${stamp}-8.xlsx`, bytes: book('90000', extra) });
    batches.push(preview.batchId);
    const held = preview.rows.find((candidate) => candidate.customer === `Орлова Вера ${stamp}`);
    assert.equal(held?.severity, 'ERROR');
    assert.equal(held?.action, 'CREATE');

    await applyBatch(head, preview.batchId, { managerId: ids.manager, excludeRows: [held!.rowNumber] });

    const report = await loadBatch(head, preview.batchId);
    const kept = report?.rows.find((row) => row.rowNumber === held!.rowNumber);
    assert.equal(kept?.action, 'SKIP');
    assert.equal(kept?.existingCode, null);
    assert.equal(
      await prisma.project.count({ where: { client: { normalizedName: { contains: `орлова вера ${stamp}` } } } }),
      0,
    );
  });

  it('карточки сводятся вручную, проекты переходят к основной', async () => {
    const clients = await prisma.clientProfile.findMany({
      where: { normalizedName: { contains: String(stamp) }, mergedIntoId: null },
      select: { id: true, normalizedName: true },
      orderBy: { normalizedName: 'asc' },
    });
    assert.ok(clients.length >= 2);
    const [source, target] = clients;

    const { moved } = await mergeClients(actor(ids.head, 'HEAD'), source!.id, target!.id);
    assert.ok(moved > 0, 'при сведении карточек проекты остались на прежней');

    const merged = await prisma.clientProfile.findUnique({
      where: { id: source!.id },
      select: { mergedIntoId: true },
    });
    // Карточка не удаляется: на неё ссылаются журналы и требования об удалении.
    assert.equal(merged?.mergedIntoId, target!.id);
    assert.equal(
      await prisma.project.count({ where: { clientId: source!.id } }),
      0,
      'проекты не переведены на основную карточку',
    );
  });

  it('новая строка с написанием сведённой карточки ложится в основную (Р-453)', async () => {
    const merged = await prisma.clientProfile.findFirstOrThrow({
      where: { normalizedName: { contains: String(stamp) }, mergedIntoId: { not: null } },
      select: { id: true, fullName: true, mergedIntoId: true },
    });
    const head = actor(ids.head, 'HEAD');
    const extra: TestRow = [
      excelSerial('2025-08-17'),
      merged.fullName,
      'Диссертция',
      'Новая глава',
      '01.12.2025',
      '77000',
      { value: 'в работе', fill: GREEN },
      '0',
    ];
    const preview = await previewBook(head, { fileName: `книга-${stamp}-сведённая.xlsx`, bytes: book('80000', [extra], '25.12.2025') });
    batches.push(preview.batchId);
    await applyBatch(head, preview.batchId, { managerId: ids.manager });
    const created = await prisma.project.findFirstOrThrow({
      where: { managerId: ids.manager, contract: { totalAmount: 7_700_000n } },
      select: { clientId: true },
    });
    assert.equal(created.clientId, merged.mergedIntoId, 'новая работа легла не в основную карточку');
    const dupes = await prisma.clientProfile.count({ where: { fullName: merged.fullName, mergedIntoId: null } });
    assert.equal(dupes, 0, 'заведена карточка-дубль сведённой');
  });

  it('перенос записан в журнал действий', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { actorId: ids.head, action: { in: ['IMPORT_PREVIEWED', 'IMPORT_APPLIED'] } },
      select: { action: true },
    });
    assert.ok(events.some((event) => event.action === 'IMPORT_PREVIEWED'));
    assert.ok(events.some((event) => event.action === 'IMPORT_APPLIED'));
  });
});
