/**
 * Сквозной номер заявки на настоящей базе (П-3, решение Р-763).
 *
 * Номер выдаёт последовательность базы при записи заявки; прежним заявкам
 * его дала миграция по дате создания. Проверки держат: номера растут и не
 * повторяются; миграция нумерует по дате, а не по порядку хранения строк;
 * номер приходит заявителю в письмах «Заявка получена» и об отказе;
 * перечень находит заявку по номеру; клиент видит номер своей заявки до
 * одобрения и не видит после; строка «Из заявки № N» — только практике.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'n'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('номер заявки', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { enqueueLeadReceived } = await import('../src/lib/cabinet/outbox.ts');
  const { declineLead } = await import('../src/lib/cabinet/projects.ts');
  const { leadList, ownRequestNumber, projectLead } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const leadIds: string[] = [];
  const userIds: string[] = [];
  let projectId = '';
  let headId = '';
  let clientId = '';
  let clientEmail = '';

  const actor = (id: string, role: 'HEAD' | 'MANAGER' | 'CLIENT' | 'EXPERT') => ({
    id,
    role,
    status: 'ACTIVE' as const,
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const newLead = async (data: Record<string, unknown> = {}) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind: 'email',
        contact: `ln-${stamp}-${leadIds.length}@example.org`,
        name: 'Заявитель',
        consentGiven: true,
        consentVersion: 'test',
        ...data,
      } as never,
    });
    leadIds.push(lead.id);
    return lead;
  };

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `ln-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    headId = head.id;
    clientEmail = `ln-client-${stamp}@example.org`;
    const client = await prisma.user.create({
      data: { email: clientEmail, fullName: 'Клиент Номера', role: 'CLIENT' },
    });
    clientId = client.id;
    userIds.push(headId, clientId);
  });

  after(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { projectId: null } });
    if (projectId !== '') {
      const project = await prisma.project.delete({ where: { id: projectId } });
      await prisma.clientProfile.delete({ where: { id: project.clientId } });
      await prisma.serviceType.delete({ where: { id: project.serviceTypeId } });
    }
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('база выдаёт номер при записи: следующий больше, повторов нет', async () => {
    const first = await newLead();
    const second = await newLead();
    assert.ok(Number.isInteger(first.number) && first.number > 0);
    assert.ok(second.number > first.number, `${second.number} после ${first.number}`);
    const same = await prisma.lead.count({ where: { number: first.number } });
    assert.equal(same, 1);
  });

  it('миграция нумерует прежние заявки по дате создания, следующей — после наибольшего', async () => {
    // Миграция исполняется в отдельной схеме внутри транзакции, которая
    // затем откатывается: рабочая таблица не трогается.
    const sql = readFileSync(
      path.join(import.meta.dirname, '..', 'prisma', 'migrations', '20261101100000_lead_number', 'migration.sql'),
      'utf8',
    );
    const statements = sql
      .split('\n')
      .filter((line) => !line.startsWith('--'))
      .join('\n')
      .split(/;\s*\n/u)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const schema = `ln_${stamp}`;
    const rollback = new Error('откат');
    let rows: { id: string; number: number }[] = [];
    let next = 0;
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe('CREATE TABLE "Lead" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL)');
        // Порядок вставки нарочно не совпадает с датами: `SERIAL` раздал бы
        // номера по порядку хранения строк.
        await tx.$executeRawUnsafe(
          `INSERT INTO "Lead" ("id", "createdAt") VALUES
             ('c', '2026-03-01'), ('a', '2026-01-01'), ('d', '2026-03-01'), ('b', '2026-02-01')`,
        );
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        rows = await tx.$queryRawUnsafe<{ id: string; number: number }[]>('SELECT "id", "number" FROM "Lead" ORDER BY "id"');
        const inserted = await tx.$queryRawUnsafe<{ number: number }[]>(
          `INSERT INTO "Lead" ("id", "createdAt") VALUES ('e', '2025-01-01') RETURNING "number"`,
        );
        next = inserted[0]!.number;
        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    assert.deepEqual(
      rows.map((row) => [row.id, Number(row.number)]),
      [
        ['a', 1],
        ['b', 2],
        ['c', 3],
        // Равная дата — по идентификатору.
        ['d', 4],
      ],
    );
    // Новая заявка — после наибольшего номера, а не по своей дате.
    assert.equal(Number(next), 5);
    const left = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.schemata WHERE schema_name = '${schema}'`,
    );
    assert.equal(Number(left[0]!.n), 0, 'схема проверки осталась в базе');
  });

  it('письмо «Заявка получена» называет номер в теме и тексте', async () => {
    const lead = await newLead({ contact: `ln-recv-${stamp}@example.org` });
    assert.equal(await enqueueLeadReceived(lead.id), true);
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { leadId: lead.id, eventKind: 'LEAD_RECEIVED' } });
    assert.equal(row.subject, `Заявка № ${lead.number} получена — ProDisser`);
    assert.ok(row.body.includes(`Ваша заявка № ${lead.number} получена.`), row.body);
  });

  it('письмо об отказе называет тот же номер', async () => {
    const lead = await newLead({ contact: `ln-decl-${stamp}@example.org` });
    await declineLead(actor(headId, 'HEAD'), lead.id, 'Тема вне наших направлений.');
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { leadId: lead.id, eventKind: 'LEAD_DECLINED' } });
    assert.equal(row.subject, `Ответ на заявку № ${lead.number} — ProDisser`);
    assert.ok(row.body.includes(`Спасибо за заявку № ${lead.number}.`), row.body);
  });

  it('«Все заявки» находят заявку по номеру — числом и со знаком №', async () => {
    const lead = await newLead({ name: `Номерной ${stamp}` });
    for (const query of [String(lead.number), `№ ${lead.number}`, `№${lead.number}`]) {
      const list = await leadList(actor(headId, 'HEAD'), { query });
      assert.ok(
        list.rows.some((row) => row.id === lead.id && row.number === lead.number),
        `поиск «${query}» не нашёл заявку`,
      );
    }
    // Номер сверх целого поля — «ничего не найдено», а не ошибка базы.
    const huge = await leadList(actor(headId, 'HEAD'), { query: '99999999999' });
    assert.ok(Array.isArray(huge.rows));
  });

  it('клиент видит номер своей заявки до одобрения, после — нет', async () => {
    const own = await newLead({ source: 'cabinet', contact: clientEmail.toUpperCase() });
    const client = actor(clientId, 'CLIENT');
    assert.equal(await ownRequestNumber(client, own.number), own.number);

    // Чужая заявка — без номера: адрес страницы правится руками.
    const foreign = await newLead({ source: 'cabinet', contact: `ln-other-${stamp}@example.org` });
    assert.equal(await ownRequestNumber(client, foreign.number), null);
    // Заявка с сайта на ту же почту — не заявка из кабинета.
    const site = await newLead({ source: 'postgrad', contact: clientEmail });
    assert.equal(await ownRequestNumber(client, site.number), null);
    // Сотруднику права подать заявку нет — и номера тоже.
    assert.equal(await ownRequestNumber(actor(headId, 'HEAD'), own.number), null);

    const type = await prisma.serviceType.create({ data: { code: `ln-${stamp}`, name: 'Проверка номера' } });
    const profile = await prisma.clientProfile.create({ data: { fullName: 'Клиент Номера', normalizedName: 'клиент номера' } });
    const project = await prisma.project.create({
      data: {
        code: `PD-LN-${stamp}`,
        clientId: profile.id,
        serviceTypeId: type.id,
        title: 'Работа из заявки',
        managerId: headId,
        source: 'WEB',
      },
    });
    projectId = project.id;
    await prisma.lead.update({ where: { id: own.id }, data: { projectId } });
    // После одобрения — работа по названию, номер заявки клиенту не нужен
    // (Р-189, Р-362).
    assert.equal(await ownRequestNumber(client, own.number), null);
  });

  it('«Из заявки № N» — практике; клиенту и куратору выборка пуста', async () => {
    assert.notEqual(projectId, '');
    const own = await prisma.lead.findFirstOrThrow({ where: { projectId } });
    const found = await projectLead(actor(headId, 'HEAD'), projectId);
    assert.deepEqual(found, { id: own.id, number: own.number, createdAt: own.createdAt });
    assert.equal(await projectLead(actor(clientId, 'CLIENT'), projectId), null);
    assert.equal(await projectLead(actor(clientId, 'EXPERT'), projectId), null);
  });
});
