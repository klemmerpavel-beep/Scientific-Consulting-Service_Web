/**
 * Книга заказов и обезличивание на настоящей базе (решение Р-252).
 *
 * Проверяется то, что ломалось между мостом книги и требованием субъекта:
 *   - правка суммы в книге обновляет работу, а не заводит вторую — и для
 *     строк, перенесённых со старым ключом (с суммой), и для новых;
 *   - строка, похожая сразу на несколько работ, уходит на разбор;
 *   - стёртый клиент не заводится мостом заново: ключ его строк заменён
 *     надгробием, а ФИО не остаётся ни в перенесённых строках, ни в
 *     брошенных предпросмотрах, ни в новой загрузке той же книги;
 *   - заявки субъекта находятся по приведённому контакту;
 *   - журнал, сессии, ссылки входа и журнал доступа к файлам теряют его
 *     адрес и браузер, очередь — текст ошибки;
 *   - окончательный отказ Telegram не повторяется;
 *   - выгрузка заявок держит верхнюю границу;
 *   - запросы чистки в `deploy/retention.sh` исполнимы на этой схеме.
 *
 * Книга — синтетическая, имена вымышлены: настоящая книга заказов в
 * репозиторий не попадает ни при каких условиях.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { excelSerial, makeWorkbook, type TestRow } from './helpers/make-workbook.ts';

process.env.SESSION_SECRET ??= 'b'.repeat(48);
process.env.CABINET_STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'pd-book-era-'));

const enabled = Boolean(process.env.DATABASE_URL);

const GREEN = 'FF00B050';

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

describe('книга заказов и обезличивание', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { applyBatch, previewBook } = await import('../src/lib/cabinet/import/apply.ts');
  const { normalizeName } = await import('../src/lib/cabinet/import/etl.ts');
  const { executeErasure, requestErasure } = await import('../src/lib/cabinet/erasure.ts');
  const { createUser } = await import('../src/lib/cabinet/admin.ts');
  const { dispatch } = await import('../src/lib/cabinet/outbox.ts');
  const { leadList } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const tail = String(stamp).slice(-7);
  const ids: Record<string, string> = {};
  const batches: string[] = [];
  const leads: string[] = [];
  const users: string[] = [];
  const cards: string[] = [];

  /** Вымышленные заказчики этой проверки. */
  const LEGACY = `Лебедева Ирина ${stamp}`;
  const FRESH = `Орехов Глеб ${stamp}`;
  const TWIN = `Соколова Вера ${stamp}`;

  const head = (): Actor => ({
    id: ids.head!,
    role: 'HEAD',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  /** Закрытая (зелёная) строка книги. */
  const row = (date: string, customer: string, type: string, cost: string, paid = cost): TestRow => [
    excelSerial(date),
    customer,
    type,
    'Кандидатская, химия',
    excelSerial('2025-06-30'),
    cost,
    { value: 'закрыт', fill: GREEN },
    paid,
  ];

  const preview = async (rows: TestRow[], name: string) => {
    const result = await previewBook(head(), {
      fileName: `книга-${stamp}-${name}.xlsx`,
      bytes: makeWorkbook([HEADER, ...rows]),
    });
    batches.push(result.batchId);
    return result;
  };

  const worksOf = (customer: string) =>
    prisma.project.count({ where: { client: { normalizedName: normalizeName(customer) } } });

  before(async () => {
    const boss = await prisma.user.create({
      data: { email: `be-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const manager = await prisma.user.create({
      data: { email: `be-mgr-${stamp}@example.org`, fullName: 'Менеджер', role: 'MANAGER' },
    });
    users.push(boss.id, manager.id);
    Object.assign(ids, { head: boss.id, manager: manager.id });
    const type = await prisma.serviceType.upsert({
      where: { code: 'dissertation' },
      create: { code: 'dissertation', name: 'Сопровождение диссертационного исследования' },
      update: {},
    });
    ids.type = type.id;
  });

  after(async () => {
    const projects = await prisma.project.findMany({
      where: { managerId: ids.manager },
      select: { id: true, clientId: true },
    });
    const projectIds = projects.map((project) => project.id);
    const clientIds = [
      ...new Set([
        ...projects.map((project) => project.clientId),
        ...(
          await prisma.clientProfile.findMany({
            where: { normalizedName: { contains: String(stamp) } },
            select: { id: true },
          })
        ).map((card) => card.id),
        // Обезличенная карточка теряет ФИО и метку прогона: её помнят по id.
        ...cards,
      ]),
    ];
    const versions = await prisma.materialVersion.findMany({
      where: { material: { projectId: { in: projectIds } } },
      select: { id: true },
    });
    const versionIds = versions.map((version) => version.id);
    await prisma.fileAccessLog.deleteMany({ where: { versionId: { in: versionIds } } });
    await prisma.materialVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.material.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.notificationOutbox.deleteMany({
      where: { OR: [{ userId: { in: users } }, { projectId: { in: projectIds } }, { leadId: { in: leads } }] },
    });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.importBatch.deleteMany({ where: { id: { in: batches } } });
    await prisma.tranche.deleteMany({ where: { contract: { projectId: { in: projectIds } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { projectId: { in: projectIds } },
          { actorId: { in: users } },
          { objectId: { in: [...users, ...clientIds, ...batches] } },
        ],
      },
    });
    await prisma.erasureRequest.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.loginToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('строка со старым ключом (с суммой) не заводит вторую работу', async () => {
    // Так в базе лежат строки, перенесённые до решения Р-252: ключ с
    // суммой в копейках последним полем.
    const client = await prisma.clientProfile.create({
      data: { fullName: LEGACY, normalizedName: normalizeName(LEGACY) },
    });
    cards.push(client.id);
    const project = await prisma.project.create({
      data: {
        code: `PD-BE-${tail}`,
        clientId: client.id,
        serviceTypeId: ids.type!,
        title: 'Диссертция',
        managerId: ids.manager!,
        status: 'COMPLETED',
        source: 'IMPORT',
      },
    });
    ids.legacyProject = project.id;
    const contract = await prisma.contract.create({
      data: { projectId: project.id, number: `PD-BE-${tail}`, totalAmount: 15_000_000n },
    });
    await prisma.tranche.create({
      data: { contractId: contract.id, title: 'Поступление по книге учёта', amount: 15_000_000n, status: 'PAID' },
    });
    const batch = await prisma.importBatch.create({
      data: {
        fileName: `книга-${stamp}-прежняя.xlsx`,
        sha256: 'c'.repeat(64),
        uploadedById: ids.head!,
        state: 'APPLIED',
        appliedAt: new Date(Date.now() - 86_400_000),
      },
    });
    batches.push(batch.id);
    const date = excelSerial('2024-03-04');
    await prisma.importRow.create({
      data: {
        batchId: batch.id,
        rowNumber: 2,
        signature: `${date}|${normalizeName(LEGACY)}|${normalizeName('Диссертция')}|15000000`,
        raw: { customer: LEGACY, type: 'Диссертция', description: '', status: 'закрыт', fill: GREEN },
        parsed: {
          typeCode: 'dissertation',
          orderDate: new Date(`2024-03-04T00:00:00Z`).toISOString(),
          deadline: new Date(`2025-06-30T00:00:00Z`).toISOString(),
          cost: '15000000',
          paid: '15000000',
          status: 'CLOSED',
          normalizedName: normalizeName(LEGACY),
        },
        action: 'CREATE',
        projectId: project.id,
      },
    });

    // Та же строка без изменений — пропуск с кодом прежней работы.
    const same = await preview([row('2024-03-04', LEGACY, 'Диссертция', '150000')], 'старая-та-же');
    assert.equal(same.rows[0]?.action, 'SKIP', 'строка со старым ключом снова показана новой');
    assert.equal(same.rows[0]?.existingCode, `PD-BE-${tail}`);

    // Сумма поправлена — обновление той же работы, а не вторая.
    const edited = await preview([row('2024-03-04', LEGACY, 'Диссертция', '160000', '150000')], 'старая-правка');
    assert.equal(edited.rows[0]?.action, 'UPDATE');
    const report = await applyBatch(head(), edited.batchId, { managerId: ids.manager! });
    assert.equal(report.created, 0, 'правка суммы завела вторую работу');
    assert.equal(report.updated, 1);
    assert.equal(await worksOf(LEGACY), 1);
    const after = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      select: { totalAmount: true, tranches: { select: { status: true, amount: true } } },
    });
    assert.equal(after.totalAmount, 16_000_000n);
    // Остаток был погашен и снят — поднятая сумма встаёт новым остатком.
    assert.ok(
      after.tranches.some((tranche) => tranche.status === 'PLANNED' && tranche.amount === 1_000_000n),
      'разница суммы не встала в план',
    );

    // Следующий прогон той же книги ничего не меняет: строка уже с новым ключом.
    const again = await preview([row('2024-03-04', LEGACY, 'Диссертция', '160000', '150000')], 'старая-повтор');
    assert.equal(again.rows[0]?.action, 'SKIP');
  });

  it('правка суммы строки с новым ключом обновляет работу', async () => {
    const first = await preview([row('2025-02-10', FRESH, 'Диссертция', '90000')], 'новая');
    assert.equal(first.rows[0]?.action, 'CREATE');
    assert.match(first.rows[0]?.signature ?? '', /^k2\|/u);
    assert.doesNotMatch(first.rows[0]?.signature ?? '', /90000/u, 'сумма осталась в ключе');
    await applyBatch(head(), first.batchId, { managerId: ids.manager! });
    assert.equal(await worksOf(FRESH), 1);

    const edited = await preview([row('2025-02-10', FRESH, 'Диссертция', '95000')], 'новая-правка');
    assert.equal(edited.rows[0]?.action, 'UPDATE');
    const report = await applyBatch(head(), edited.batchId, { managerId: ids.manager! });
    assert.equal(report.created, 0);
    assert.equal(await worksOf(FRESH), 1, 'правка суммы завела вторую работу');
    const contract = await prisma.contract.findFirstOrThrow({
      where: { project: { client: { normalizedName: normalizeName(FRESH) } } },
      select: { totalAmount: true },
    });
    assert.equal(contract.totalAmount, 9_500_000n);
  });

  it('строка, похожая на несколько работ сразу, уходит на разбор, а не заводится', async () => {
    const first = await preview(
      [row('2025-03-03', TWIN, 'Статья ВАК', '30000'), row('2025-03-03', TWIN, 'Статья ВАК', '40000')],
      'близнецы',
    );
    assert.equal(first.counts.CREATE, 2, 'близнецы с разными суммами не различены');
    // Тип «статья» в справочнике проверки может не быть: сводим вручную.
    await applyBatch(head(), first.batchId, {
      managerId: ids.manager!,
      typeOverrides: { 'Статья ВАК': ids.type! },
    });
    assert.equal(await worksOf(TWIN), 2);

    // Обе суммы поправлены — какая строка какой работе, по книге не понять.
    const edited = await preview(
      [row('2025-03-03', TWIN, 'Статья ВАК', '31000'), row('2025-03-03', TWIN, 'Статья ВАК', '41000')],
      'близнецы-правка',
    );
    for (const item of edited.rows) {
      assert.equal(item.severity, 'ERROR');
      assert.ok(item.issues.some((issue) => issue.code === 'PREVIOUS_WORK_UNCLEAR'));
    }
    const report = await applyBatch(head(), edited.batchId, {
      managerId: ids.manager!,
      typeOverrides: { 'Статья ВАК': ids.type! },
    });
    assert.equal(report.created, 0);
    assert.equal(report.rejected.length, 2);
    assert.equal(await worksOf(TWIN), 2, 'неясная строка завела работу');

    // Одна сумма поправлена — вторая строка находит свою работу по сумме,
    // и поправленная остаётся единственной кандидаткой.
    const one = await preview(
      [row('2025-03-03', TWIN, 'Статья ВАК', '30000'), row('2025-03-03', TWIN, 'Статья ВАК', '45000')],
      'близнецы-одна',
    );
    assert.deepEqual(one.rows.map((item) => item.action), ['SKIP', 'UPDATE']);
  });

  it('стёртый клиент не заводится заново, ФИО не остаётся в строках книги', async () => {
    // Брошенный предпросмотр с его ФИО: прежде переживал обезличивание.
    await preview([row('2025-02-10', FRESH, 'Диссертция', '95000')], 'брошенная');

    // Учётная запись со следами: адрес в журнале, сессия, ссылка входа,
    // журнал доступа к файлам, ошибка доставки с адресом.
    const email = `be-client-${stamp}@example.org`;
    const created = await createUser(head(), { email, fullName: FRESH, role: 'CLIENT' });
    users.push(created.id);
    ids.clientUser = created.id;
    const card = await prisma.clientProfile.findFirstOrThrow({
      where: { normalizedName: normalizeName(FRESH) },
      select: { id: true, projects: { select: { id: true } } },
    });
    ids.freshClient = card.id;
    await prisma.clientProfile.update({ where: { id: card.id }, data: { userId: created.id } });
    const projectId = card.projects[0]!.id;
    await prisma.auditEvent.create({
      data: {
        actorId: created.id,
        actorRole: 'CLIENT',
        actorIp: '198.51.100.7',
        action: 'PROJECT_VIEW',
        objectType: 'Project',
        objectId: projectId,
        projectId,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: ids.head!,
        action: 'TRANCHE_STATUS_CHANGED',
        objectType: 'Tranche',
        objectId: `tr-${stamp}`,
        projectId,
        payload: { from: 'PAID', to: 'REVERSED', amount: '100', reason: `вернули ${FRESH}` },
      },
    });
    await prisma.session.create({
      data: {
        tokenHash: `be-session-${stamp}`,
        userId: created.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        ip: '198.51.100.7',
        userAgent: 'Mozilla/5.0 (проверка)',
      },
    });
    await prisma.loginToken.create({
      data: {
        selector: `be-sel-${stamp}`,
        verifierHash: 'x'.repeat(64),
        userId: created.id,
        expiresAt: new Date(Date.now() + 900_000),
        requestIp: '198.51.100.7',
      },
    });
    const material = await prisma.material.create({
      data: { projectId, title: 'Глава', createdById: ids.manager! },
    });
    const version = await prisma.materialVersion.create({
      data: {
        materialId: material.id,
        number: 1,
        storageKey: `be/${stamp}/v1`,
        originalName: 'глава.docx',
        sizeBytes: 1n,
        sha256: 'd'.repeat(64),
        contentType: 'application/octet-stream',
        uploadedById: ids.manager!,
      },
    });
    await prisma.fileAccessLog.create({
      data: {
        versionId: version.id,
        userId: created.id,
        action: 'DOWNLOAD',
        ip: '198.51.100.7',
        userAgent: 'Mozilla/5.0 (проверка)',
      },
    });
    await prisma.notificationOutbox.create({
      data: {
        userId: created.id,
        channel: 'EMAIL',
        eventKind: 'STAGE_DONE',
        subject: 'Этап завершён',
        body: 'Этап завершён',
        dedupKey: `be-outbox-${stamp}`,
        state: 'FAILED',
        lastError: `550 <${email}>: mailbox unavailable`,
      },
    });

    const request = await requestErasure(head(), card.id);
    await executeErasure(head(), request.id);

    // Строки книги: и перенесённые, и из брошенного предпросмотра.
    const rows = await prisma.importRow.findMany({
      where: { batchId: { in: batches } },
      select: { raw: true, parsed: true, errors: true, signature: true, projectId: true },
    });
    const name = normalizeName(FRESH);
    for (const item of rows) {
      const text = JSON.stringify(item);
      assert.ok(!text.toLowerCase().includes(name), `ФИО осталось в строке книги: ${text}`);
    }
    const tombs = rows.filter((item) => item.signature?.startsWith('erased:'));
    assert.ok(tombs.length >= 3, 'ключи строк стёртого клиента не заменены надгробием');

    // Мост снова разбирает ту же книгу, в которой клиент ещё есть, — и
    // с поправленной суммой тоже: строка не заводится и ФИО не сохраняет.
    for (const cost of ['95000', '99000']) {
      const again = await preview([row('2025-02-10', FRESH, 'Диссертция', cost)], `после-стирания-${cost}`);
      const item = again.rows[0]!;
      assert.equal(item.action, 'SKIP');
      assert.equal(item.erased, true);
      assert.match(item.note ?? '', /требованию субъекта/u);
      assert.doesNotMatch(item.customer, /Орехов/u);
      const stored = await prisma.importRow.findMany({ where: { batchId: again.batchId } });
      assert.ok(!JSON.stringify(stored).toLowerCase().includes(name), 'ФИО стёртого снова записано');
      const report = await applyBatch(head(), again.batchId, { managerId: ids.manager! });
      assert.equal(report.created, 0, 'мост завёл стёртого клиента заново');
    }
    assert.equal(
      await prisma.clientProfile.count({ where: { normalizedName: name } }),
      0,
      'заведена новая карточка с ФИО стёртого',
    );

    // Сетевые следы и журнал.
    const journal = await prisma.auditEvent.findMany({ where: { actorId: created.id } });
    assert.ok(journal.length > 0);
    for (const event of journal) assert.equal(event.actorIp, null, 'адрес остался в журнале');
    const createdEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'USER_CREATED', objectId: created.id },
    });
    assert.ok(!JSON.stringify(createdEvent.payload).includes(email), 'адрес остался в записи о заведении');
    const reversal = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'TRANCHE_STATUS_CHANGED', objectId: `tr-${stamp}` },
    });
    const reversalPayload = reversal.payload as Record<string, unknown>;
    assert.doesNotMatch(String(reversalPayload.reason), /Орехов/u, 'причина сторно называет клиента');
    assert.equal(reversalPayload.amount, '100', 'сумма сторно потеряна');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: created.id } });
    assert.equal(session.ip, null);
    assert.equal(session.userAgent, null);
    const token = await prisma.loginToken.findFirstOrThrow({ where: { userId: created.id } });
    assert.equal(token.requestIp, null);
    const access = await prisma.fileAccessLog.findFirstOrThrow({ where: { versionId: version.id, userId: created.id } });
    assert.equal(access.ip, null);
    assert.equal(access.userAgent, null);
    const letter = await prisma.notificationOutbox.findFirstOrThrow({ where: { dedupKey: `be-outbox-${stamp}` } });
    assert.equal(letter.lastError, null, 'адрес остался в тексте ошибки доставки');
  });

  it('заявки субъекта находятся по приведённой почте и телефону', async () => {
    const digits = `9${tail.padStart(9, '0')}`;
    const card = await prisma.clientProfile.create({
      data: {
        fullName: `Карпова Нина ${stamp}`,
        normalizedName: normalizeName(`Карпова Нина ${stamp}`),
        email: `karpova-${stamp}@example.org`,
        phone: `+7 ${digits}`,
      },
    });
    cards.push(card.id);
    const lead = async (contactKind: string, contact: string, phone: string | null = null) => {
      const created = await prisma.lead.create({
        data: {
          source: contactKind === 'cabinet' ? 'cabinet' : 'landing',
          form: 'request',
          name: 'Карпова Н.',
          contactKind: contactKind === 'cabinet' ? 'email' : contactKind,
          contact,
          phone,
          consentGiven: true,
          consentVersion: 'test',
        },
      });
      leads.push(created.id);
      return created.id;
    };
    const byMail = await lead('email', ` Karpova-${stamp}@Example.ORG `);
    const byPhone = await lead('phone', `8 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`);
    const byCabinetPhone = await lead('cabinet', `other-${stamp}@example.org`, `8${digits}`);
    // Цифры в адресе почты — не телефон.
    const control = await lead('email', `n${digits}-${stamp}@example.org`);

    const request = await requestErasure(head(), card.id);
    await executeErasure(head(), request.id);

    for (const id of [byMail, byPhone, byCabinetPhone]) {
      const found = await prisma.lead.findUniqueOrThrow({ where: { id } });
      assert.equal(found.name, null, `заявка ${found.contact} пережила обезличивание`);
    }
    const untouched = await prisma.lead.findUniqueOrThrow({ where: { id: control } });
    assert.equal(untouched.name, 'Карпова Н.', 'цифры адреса почты приняты за телефон');
  });

  it('окончательный отказ Telegram закрывает строку без повторов', async () => {
    const user = await prisma.user.create({
      data: {
        email: `be-tg-${stamp}@example.org`,
        fullName: 'Получатель',
        role: 'CLIENT',
        notifyTelegram: true,
        telegramChatId: `-${tail}`,
      },
    });
    users.push(user.id);
    const row = await prisma.notificationOutbox.create({
      data: {
        userId: user.id,
        channel: 'TELEGRAM',
        eventKind: 'STAGE_AWAITING_CLIENT',
        subject: 'Этап ждёт',
        body: 'Этап ждёт',
        dedupKey: `be-tg-${stamp}`,
        scheduledAt: new Date(0),
      },
    });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const realFetch = globalThis.fetch;
    process.env.TELEGRAM_BOT_TOKEN = `1:${'t'.repeat(30)}`;
    globalThis.fetch = (async () => new Response('{"ok":false}', { status: 403 })) as typeof fetch;
    try {
      // Очередь стенда общая: берём по строке, пока не дойдёт своя.
      for (let i = 0; i < 50; i += 1) {
        await dispatch(1);
        const seen = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
        if (seen.state !== 'PENDING') break;
      }
    } finally {
      globalThis.fetch = realFetch;
      if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = token;
    }
    const done = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(done.state, 'FAILED', 'заблокированный бот повторяется');
    assert.equal(done.attempts, 1);
  });

  it('выгрузка заявок не берёт заявки позже своей границы', async () => {
    const until = new Date();
    const late = await prisma.lead.create({
      data: {
        source: 'landing',
        form: 'request',
        name: `Поздняя ${stamp}`,
        contactKind: 'email',
        contact: `late-${stamp}@example.org`,
        consentGiven: true,
        consentVersion: 'test',
        createdAt: new Date(until.getTime() + 60_000),
      },
    });
    leads.push(late.id);
    const actor: Actor = { ...head() };
    const bounded = await leadList(actor, { query: `late-${stamp}`, until });
    assert.equal(bounded.total, 0, 'заявка после начала выгрузки попала в неё');
    const open = await leadList(actor, { query: `late-${stamp}` });
    assert.equal(open.total, 1);
  });

  it('запросы чистки в retention.sh исполнимы на этой схеме', async () => {
    const script = readFileSync(path.join(import.meta.dirname, '..', '..', 'deploy', 'retention.sh'), 'utf8');
    for (const name of ['SQL_OUTBOX', 'SQL_OUTBOX_COUNT', 'SQL_BATCHES', 'SQL_BATCHES_COUNT']) {
      const line = script.split('\n').find((text) => text.startsWith(`${name}="`));
      assert.ok(line !== undefined, `в скрипте нет ${name}`);
      const sql = line.slice(name.length + 2, -1).replace(/\\"/gu, '"');
      // План без исполнения: проверяются имена таблиц, столбцов и кавычки,
      // а строки общей базы стенда не трогаются.
      await prisma.$queryRawUnsafe(`EXPLAIN ${sql}`);
    }
  });
});
