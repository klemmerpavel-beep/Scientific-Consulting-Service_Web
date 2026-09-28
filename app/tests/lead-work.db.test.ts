/**
 * Работа с заявкой до решения: состояние плашкой, правка сведений,
 * внутренние комментарии (решение Р-270).
 *
 * Пропускается без заданного адреса базы: запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'w'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('работа с заявкой', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');
  const work = await import('../src/lib/cabinet/lead-work.ts');

  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const actor = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  before(async () => {
    const head = await prisma.user.create({
      data: { email: `lw-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    const client = await prisma.user.create({
      data: { email: `lw-client-${stamp}@example.org`, fullName: 'Клиент', role: 'CLIENT' },
    });
    const lead = await prisma.lead.create({
      data: {
        source: 'landing',
        form: 'top',
        name: 'Заявитель',
        contactKind: 'email',
        contact: `lw-${stamp}@example.org`,
        consentGiven: true,
        consentVersion: '2026-08-21',
      },
    });
    Object.assign(ids, { head: head.id, client: client.id, lead: lead.id });
  });

  after(async () => {
    await prisma.auditEvent.deleteMany({ where: { objectId: ids.lead } });
    await prisma.lead.deleteMany({ where: { id: ids.lead } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.client!] } } });
    await prisma.$disconnect();
  });

  it('состояние меняется плашкой и пишется в журнал «откуда — куда»', async () => {
    const head = actor(ids.head!, 'HEAD');
    await work.setLeadStatus(head, ids.lead!, 'IN_PROGRESS');
    await work.setLeadStatus(head, ids.lead!, 'AWAITING_REPLY');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: ids.lead } });
    assert.equal(lead.status, 'AWAITING_REPLY');
    const log = await prisma.auditEvent.findMany({
      where: { objectId: ids.lead, action: 'LEAD_STATUS_CHANGED' },
      orderBy: { occurredAt: 'asc' },
    });
    assert.deepEqual(log.map((e) => e.payload), [
      { from: 'NEW', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'AWAITING_REPLY' },
    ]);
  });

  it('договор и отказ плашкой не ставятся', async () => {
    const head = actor(ids.head!, 'HEAD');
    await assert.rejects(work.setLeadStatus(head, ids.lead!, 'CONTRACTED'), work.LeadWorkError);
    await assert.rejects(work.setLeadStatus(head, ids.lead!, 'DECLINED'), work.LeadWorkError);
  });

  it('правка сохраняет значения, а в журнал идут только названия полей', async () => {
    const head = actor(ids.head!, 'HEAD');
    await work.editLead(head, ids.lead!, { name: 'Иванов Иван', topic: 'Статья Q1', contact: `lw-${stamp}@example.org` });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: ids.lead } });
    assert.equal(lead.name, 'Иванов Иван');
    assert.equal(lead.topic, 'Статья Q1');
    const entry = await prisma.auditEvent.findFirstOrThrow({ where: { objectId: ids.lead, action: 'LEAD_EDITED' } });
    assert.deepEqual(entry.payload, { fields: ['name', 'topic'] });
    assert.ok(!JSON.stringify(entry.payload).includes('Иванов'));
    await assert.rejects(work.editLead(head, ids.lead!, { contact: '  ' }), work.LeadWorkError);
  });

  it('комментарий сохраняется с автором; пустой отклоняется', async () => {
    const head = actor(ids.head!, 'HEAD');
    await work.addLeadComment(head, ids.lead!, '  Позвонил, ждём ответа  ');
    const comments = await prisma.leadComment.findMany({ where: { leadId: ids.lead } });
    assert.equal(comments.length, 1);
    assert.equal(comments[0]!.body, 'Позвонил, ждём ответа');
    assert.equal(comments[0]!.authorId, ids.head);
    await assert.rejects(work.addLeadComment(head, ids.lead!, '   '), work.LeadWorkError);
  });

  it('клиенту работа с заявками закрыта', async () => {
    const client = actor(ids.client!, 'CLIENT');
    await assert.rejects(work.setLeadStatus(client, ids.lead!, 'IN_PROGRESS'), AccessDenied);
    await assert.rejects(work.addLeadComment(client, ids.lead!, 'текст'), AccessDenied);
  });

  it('комментарии уходят вместе с заявкой', async () => {
    const extra = await prisma.lead.create({
      data: { source: 'landing', form: 'top', contactKind: 'email', contact: `x-${stamp}@example.org`, consentGiven: true, consentVersion: '2026-08-21' },
    });
    await work.addLeadComment(actor(ids.head!, 'HEAD'), extra.id, 'пометка');
    await prisma.auditEvent.deleteMany({ where: { objectId: extra.id } });
    await prisma.lead.delete({ where: { id: extra.id } });
    assert.equal(await prisma.leadComment.count({ where: { leadId: extra.id } }), 0);
  });
});
