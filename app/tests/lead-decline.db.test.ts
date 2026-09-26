/**
 * Ответ заявителю при отказе на настоящей базе (решение Р-217).
 *
 * Прежде причина отказа записывалась в заявку и дальше не шла: экрана, где
 * заявитель её прочёл бы, не было, а кабинета у отклонённого нет. Проверки
 * держат четыре свойства: письмо ставится той же транзакцией, что и отказ;
 * адресат — заявка, а не учётная запись; адрес читается при отправке, и
 * обезличенная заявка письма не отправит; второго ответа не бывает.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET ??= 'q'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);

describe('ответ заявителю при отказе', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const { declineLead } = await import('../src/lib/cabinet/projects.ts');
  const { CHANNEL_OFF, dispatch, outboxDigest } = await import('../src/lib/cabinet/outbox.ts');

  const stamp = Date.now();
  const leadIds: string[] = [];
  let managerId = '';
  let headId = '';
  let projectId = '';

  const staff = (id: string, role: 'MANAGER' | 'HEAD') => ({
    id,
    role,
    status: 'ACTIVE' as const,
    clientProfileId: null,
    expertNdaSignedAt: null,
  });

  const newLead = async (contactKind: 'email' | 'phone', contact: string) => {
    const lead = await prisma.lead.create({
      data: {
        source: 'postgrad',
        form: 'request',
        contactKind,
        contact,
        name: 'Заявитель Отказа',
        topic: `Тема отказа ${stamp}`,
        consentGiven: true,
        consentVersion: 'test',
      },
    });
    leadIds.push(lead.id);
    return lead.id;
  };

  before(async () => {
    const curator = await prisma.user.create({
      data: { email: `decline-mgr-${stamp}@example.org`, fullName: 'Куратор', role: 'MANAGER' },
    });
    managerId = curator.id;
    const boss = await prisma.user.create({
      data: { email: `decline-head-${stamp}@example.org`, fullName: 'Руководитель', role: 'HEAD' },
    });
    headId = boss.id;
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
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [managerId, headId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [managerId, headId] } } });
    await prisma.$disconnect();
  });

  const manager = () => staff(managerId, 'MANAGER');

  it('отказ ставит письмо на адрес заявки, без учётной записи', async () => {
    const leadId = await newLead('email', `decline-${stamp}@example.org`);
    const { lead, queued } = await declineLead(manager(), leadId, 'Тема вне наших направлений.');
    assert.equal(lead.status, 'DECLINED');
    assert.equal(queued, true);

    const rows = await prisma.notificationOutbox.findMany({ where: { leadId } });
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row!.userId, null, 'письмо заявителю привязано к учётной записи');
    assert.equal(row!.channel, 'EMAIL');
    assert.equal(row!.eventKind, 'LEAD_DECLINED');
    assert.ok(row!.body.includes('Тема вне наших направлений.'), 'причины нет в письме');
    // Заявка с сайта: адрес не подтверждён, и имя с темой с открытой формы
    // в письмо не идут — иначе отказ разносил бы чужой текст (Р-252).
    assert.ok(!row!.body.includes(`Тема отказа ${stamp}`), 'тема с открытой формы ушла в письмо');
    assert.ok(!row!.body.includes('Заявитель Отказа'), 'имя с открытой формы ушло в письмо');
    assert.ok(row!.body.startsWith('Здравствуйте.\n'), 'обращение не обезличено');
    // Адрес в строку не копируется: его читает рассылка из заявки.
    assert.ok(!JSON.stringify(row).includes(`decline-${stamp}@example.org`), 'адрес скопирован в очередь');

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { actorId: managerId, action: 'LEAD_DECLINED', objectId: leadId },
    });
    assert.deepEqual(audit.payload, { letter: true });
  });

  it('повторный отказ отвергается: причина и письмо остаются прежними', async () => {
    // Прежде повторный отказ переписывал причину, а письмо оставалось
    // старым, и экран показывал не то, что получил человек (решение Р-227).
    const leadId = leadIds[0]!;
    await assert.rejects(() => declineLead(manager(), leadId, 'Уточнённая причина.'), /уже отклонена/u);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId } }), 1);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    assert.equal(lead.declineReason, 'Тема вне наших направлений.');
  });

  it('поиск находит заявку из кабинета по телефону', async () => {
    const { leadList } = await import('../src/lib/cabinet/queries.ts');
    // Цифры телефона не встречаются больше нигде в заявке: иначе поиск
    // нашёл бы её по адресу, и проверка ничего бы не доказала.
    const letters = stamp.toString(36).replace(/[0-9]/gu, 'x');
    const leadId = await newLead('email', `phone-case-${letters}@example.org`);
    const digits = '4815162342';
    await prisma.lead.update({ where: { id: leadId }, data: { phone: `+7 ${digits}`, topic: 'Тема без цифр' } });
    const found = await leadList(manager(), { query: digits });
    assert.ok(found.rows.some((row) => row.id === leadId), 'заявка не найдена по телефону');
  });

  it('отклонённую заявку одобрить нельзя: ответ заявителю уже дан', async () => {
    const { approveLead } = await import('../src/lib/cabinet/projects.ts');
    await assert.rejects(
      () =>
        approveLead(manager(), {
          leadId: leadIds[0]!,
          serviceTypeId: 'нет-такого',
          managerId,
          title: 'Работа',
        }),
      /отклонена/u,
    );
  });

  it('оставившему телефон письма нет: ответ звонком', async () => {
    const leadId = await newLead('phone', '+7 900 000-00-00');
    const { queued } = await declineLead(manager(), leadId, 'Сроки не позволяют.');
    assert.equal(queued, false);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId } }), 0);
  });

  it('машинной заявке письма нет: адрес в ней мог вписать кто угодно', async () => {
    const leadId = await newLead('email', `decline-spam-${stamp}@example.org`);
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'SPAM' } });
    const { lead, queued } = await declineLead(manager(), leadId, 'Машинная отправка.');
    assert.equal(lead.status, 'DECLINED');
    assert.equal(queued, false);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId } }), 0);
  });

  it('отказ без причины не принимается и письма не ставит', async () => {
    const leadId = await newLead('email', `decline-empty-${stamp}@example.org`);
    await assert.rejects(() => declineLead(manager(), leadId, '   '), /без причины/u);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId } }), 0);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    assert.equal(lead.status, 'NEW');
  });

  it('заявку, ставшую работой, отклонить нельзя', async () => {
    const leadId = await newLead('email', `decline-approved-${stamp}@example.org`);
    const type = await prisma.serviceType.create({
      data: { code: `decline-${stamp}`, name: 'Проверка отказа' },
    });
    const client = await prisma.clientProfile.create({
      data: { fullName: 'Клиент', normalizedName: 'клиент' },
    });
    const project = await prisma.project.create({
      data: {
        code: `PD-DECL-${stamp}`,
        clientId: client.id,
        serviceTypeId: type.id,
        title: 'Работа',
        managerId,
        source: 'WEB',
      },
    });
    projectId = project.id;
    await prisma.lead.update({ where: { id: leadId }, data: { projectId } });
    await assert.rejects(() => declineLead(manager(), leadId, 'Поздно.'), /развёрнута/u);
    assert.equal(await prisma.notificationOutbox.count({ where: { leadId } }), 0);
  });

  it('рассылка берёт адрес из заявки: без почты строка ждёт канала', async () => {
    // Почта на стенде не настроена: адрес найден, отправка упирается в канал.
    const leadId = leadIds[0]!;
    await prisma.notificationOutbox.updateMany({
      where: { leadId },
      // Самая ранняя строка очереди: очередь на стенде общая, и при
      // полутысяче накопившихся строк своя могла не попасть в пачку.
      data: { scheduledAt: new Date(0) },
    });
    await dispatch(500);
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { leadId } });
    assert.equal(row.state, 'PENDING');
    assert.equal(row.lastError, CHANNEL_OFF);
  });

  it('обезличенная заявка письма не отправит', async () => {
    const leadId = leadIds[0]!;
    await prisma.lead.update({ where: { id: leadId }, data: { contact: '[удалено]' } });
    await prisma.notificationOutbox.updateMany({
      where: { leadId },
      // Самая ранняя строка очереди: очередь на стенде общая, и при
      // полутысяче накопившихся строк своя могла не попасть в пачку.
      data: { scheduledAt: new Date(0) },
    });
    await dispatch(500);
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { leadId } });
    assert.equal(row.state, 'FAILED', 'строка без адреса осталась в очереди');
    assert.notEqual(row.lastError, CHANNEL_OFF);
  });

  it('сводка очереди называет заявителя, а не пустое место', async () => {
    const digest = await outboxDigest(staff(headId, 'HEAD'));
    const mine = digest.failures.find((row) => row.recipient === 'заявитель Заявитель Отказа');
    assert.ok(mine !== undefined, 'письмо заявителю не попало в перечень отказов');
    assert.equal(mine.eventKind, 'LEAD_DECLINED');
  });

  it('у строки очереди ровно один адресат', async () => {
    await assert.rejects(() =>
      prisma.notificationOutbox.create({
        data: {
          channel: 'EMAIL',
          eventKind: 'LEAD_DECLINED',
          subject: 'x',
          body: 'x',
          dedupKey: `nobody-${stamp}`,
        },
      }),
    );
  });
});
