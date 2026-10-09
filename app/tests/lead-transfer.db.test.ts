/**
 * Перенос из заявки в карточку клиента (требование М-18, решение Р-308):
 * доп. телефон и организация заявки переходят в карточку; дубль ищется по
 * почте и телефону карточки — заявка с адресом карточки без учётной записи
 * ложится в неё, а не заводит вторую.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'l'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('перенос из заявки', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { approveLead } = await import('../src/lib/cabinet/projects.ts');

  const ids: Record<string, string> = {};
  const leadIds: string[] = [];
  const profileIds: string[] = [];
  const projectIds: string[] = [];
  const curator = (): Actor => ({
    id: ids.manager!,
    role: 'MANAGER',
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const lead = async (data: Record<string, unknown>) => {
    const row = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        consentGiven: true,
        consentVersion: 'test',
        topic: `Тема переноса ${stamp}`,
        ...data,
      } as never,
    });
    leadIds.push(row.id);
    return row.id;
  };
  const approve = async (leadId: string) => {
    const project = await approveLead(curator(), {
      leadId,
      serviceTypeId: ids.type!,
      managerId: ids.manager!,
      title: 'Работа из заявки',
    });
    projectIds.push(project.id);
    return prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { client: true } });
  };

  before(async () => {
    const manager = await prisma.user.create({
      data: { email: `lt-mgr-${stamp}@example.org`, fullName: 'Куратор переноса', role: 'MANAGER', status: 'SUSPENDED' },
    });
    const type = await prisma.serviceType.create({ data: { code: `lt-${stamp}`, name: 'Проверка переноса' } });
    const [other, head] = await Promise.all([
      prisma.user.create({ data: { email: `lt-mgr2-${stamp}@example.org`, fullName: 'Другой менеджер', role: 'MANAGER' } }),
      prisma.user.create({ data: { email: `lt-head-${stamp}@example.org`, fullName: 'Руководитель переноса', role: 'HEAD' } }),
    ]);
    Object.assign(ids, { manager: manager.id, type: type.id, other: other.id, head: head.id });
  });

  after(async () => {
    const users = (
      await prisma.clientProfile.findMany({ where: { id: { in: profileIds } }, select: { userId: true } })
    )
      .map((row) => row.userId)
      .filter((id): id is string => id !== null);
    await prisma.notificationOutbox.deleteMany({
      where: { OR: [{ projectId: { in: projectIds } }, { userId: { in: users } }] },
    });
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { projectId: null } });
    await prisma.projectEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...users, ids.manager!, ids.other!, ids.head!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
  });

  it('доп. телефон и организация переходят в новую карточку', async () => {
    const leadId = await lead({
      contactKind: 'email',
      contact: `lt-new-${stamp}@example.org`,
      name: 'Новикова Анна Сергеевна',
      phone: '+7 900 321-00-11',
      organization: 'МГТУ им. Н. Э. Баумана',
    });
    const project = await approve(leadId);
    profileIds.push(project.clientId);
    assert.equal(project.client.phone, '+7 900 321-00-11');
    assert.equal(project.client.university, 'МГТУ им. Н. Э. Баумана');
  });

  it('почта совпала с карточкой без учётной записи — заявка ложится в неё', async () => {
    const card = await prisma.clientProfile.create({
      data: {
        fullName: 'Петров Пётр Петрович',
        normalizedName: `lt петров ${stamp}`,
        email: `lt-card-${stamp}@example.org`,
        university: 'СПбГУ',
      },
    });
    profileIds.push(card.id);
    const leadId = await lead({
      contactKind: 'email',
      contact: `LT-Card-${stamp}@example.org`,
      name: 'Петров П. П.',
      phone: '8 (900) 777-66-55',
      organization: 'Другой вуз',
    });
    const project = await approve(leadId);
    assert.equal(project.clientId, card.id, 'заведена вторая карточка того же человека');
    assert.ok(project.client.userId !== null, 'карточка не привязана к учётной записи заявителя');
    assert.equal(project.client.phone, '8 (900) 777-66-55', 'пустой телефон не дополнен');
    assert.equal(project.client.university, 'СПбГУ', 'заполненное поле карточки затёрто');
  });

  it('заявка с адресом и чужим телефоном карточку без записи не получает (Р-413)', async () => {
    const card = await prisma.clientProfile.create({
      data: { fullName: 'Кузнецов Кузьма', normalizedName: `lt кузнецов ${stamp}`, phone: '+7 (902) 333-44-55' },
    });
    profileIds.push(card.id);
    const leadId = await lead({
      contactKind: 'email',
      contact: `lt-stranger-${stamp}@example.org`,
      name: 'Посторонний П.',
      phone: '89023334455',
    });
    const project = await approve(leadId);
    profileIds.push(project.clientId);
    assert.notEqual(project.clientId, card.id, 'работа легла в чужую карточку по одному телефону');
    const after = await prisma.clientProfile.findUniqueOrThrow({ where: { id: card.id } });
    assert.equal(after.userId, null, 'чужая карточка привязана к записи заявителя');
  });

  it('заявка с телефоном — дубль по телефону карточки', async () => {
    const card = await prisma.clientProfile.create({
      data: { fullName: 'Сидоров Сидор', normalizedName: `lt сидоров ${stamp}`, phone: '+7 (901) 222-33-44' },
    });
    profileIds.push(card.id);
    const leadId = await lead({ contactKind: 'phone', contact: '89012223344', name: 'Сидоров С.' });
    const project = await approve(leadId);
    assert.equal(project.clientId, card.id);
  });

  it('заявитель — клиент другого менеджера: менеджер не одобряет, руководитель одобряет (Р-531)', async () => {
    // Карточка с работой другого менеджера; заявка с сайта пришла с её
    // адресом. Работа на этой карточке открыла бы одобрившему её контакты.
    const card = await prisma.clientProfile.create({
      data: {
        fullName: 'Чужой Клиент',
        normalizedName: `lt чужой ${stamp}`,
        email: `lt-foreign-${stamp}@example.org`,
        phone: '+7 903 111-22-33',
      },
    });
    profileIds.push(card.id);
    const theirs = await prisma.project.create({
      data: { code: `PD-LT-${String(stamp).slice(-6)}`, clientId: card.id, serviceTypeId: ids.type!, title: 'Работа другого', managerId: ids.other! },
    });
    projectIds.push(theirs.id);
    const leadId = await lead({ contactKind: 'email', contact: `lt-foreign-${stamp}@example.org`, name: 'Чужой К.' });
    await assert.rejects(approve(leadId), /клиент другого менеджера: заявку одобряет руководитель/u);
    const kept = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    assert.equal(kept.projectId, null, 'работа заведена');
    assert.notEqual(kept.status, 'CONTRACTED', 'заявка осталась захваченной');
    assert.equal(await prisma.project.count({ where: { clientId: card.id } }), 1, 'на чужой карточке новая работа');
    const head: Actor = { id: ids.head!, role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
    const project = await approveLead(head, { leadId, serviceTypeId: ids.type!, managerId: ids.head!, title: 'Работа из заявки' });
    projectIds.push(project.id);
    assert.equal(project.clientId, card.id);
  });
});
