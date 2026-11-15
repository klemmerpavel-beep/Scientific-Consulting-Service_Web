/**
 * Свои заявки клиента над перечнем работ — отбор на настоящей базе
 * (решение Р-914). Тексты — `own-requests.test.ts`.
 *
 * Запуск: DATABASE_URL=… node --test tests/own-requests.db.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'n'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('свои открытые заявки клиента (Р-914)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { ownOpenRequests } = await import('../src/lib/cabinet/queries.ts');

  const stamp = Date.now();
  const leadIds: string[] = [];
  const userIds: string[] = [];
  const email = `or-client-${stamp}@example.org`;
  let clientId = '';
  let headId = '';

  const actor = (id: string, role: 'HEAD' | 'CLIENT') => ({
    id,
    role,
    status: 'ACTIVE' as const,
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const newLead = async (data: Record<string, unknown>) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'cabinet',
        form: 'request',
        contactKind: 'email',
        contact: email,
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
    const client = await prisma.user.create({ data: { email, fullName: 'Клиент Заявок', role: 'CLIENT' } });
    const head = await prisma.user.create({ data: { email: `or-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' } });
    clientId = client.id;
    headId = head.id;
    userIds.push(clientId, headId);
  });

  after(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('видны новые, взятые в работу и ждущие ответа; закрытые и чужие — нет', async () => {
    const fresh = await newLead({ topic: 'Новая', contact: email.toUpperCase() });
    const taken = await newLead({ topic: 'В работе', status: 'IN_PROGRESS' });
    const asked = await newLead({ topic: 'Ждёт ответа', status: 'AWAITING_REPLY' });
    await newLead({ topic: 'Отказ', status: 'DECLINED' });
    await newLead({ topic: 'Консультация', status: 'CONSULTED' });
    await newLead({ topic: 'Спам', status: 'SPAM' });
    await newLead({ topic: 'Чужая', contact: `or-other-${stamp}@example.org` });
    await newLead({ topic: 'С сайта', source: 'postgrad' });

    const rows = await ownOpenRequests(actor(clientId, 'CLIENT'));
    assert.deepEqual(rows.map((row) => row.number).sort(), [fresh.number, taken.number, asked.number].sort());
    assert.deepEqual(Object.keys(rows[0]!).sort(), ['createdAt', 'number', 'status', 'topic']);
  });

  it('сотруднику перечень пуст: у него заявки — в «Заявках»', async () => {
    assert.deepEqual(await ownOpenRequests(actor(headId, 'HEAD')), []);
  });

  it('больше пяти не отдаётся, первыми — последние', async () => {
    for (let index = 0; index < 4; index += 1) await newLead({ topic: `Ещё ${index}` });
    const rows = await ownOpenRequests(actor(clientId, 'CLIENT'));
    assert.equal(rows.length, 5);
    assert.ok(rows[0]!.createdAt.getTime() >= rows[4]!.createdAt.getTime());
  });
});
