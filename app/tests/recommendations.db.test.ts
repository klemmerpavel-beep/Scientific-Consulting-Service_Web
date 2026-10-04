/**
 * Раздел «Рекомендации» (требование РК-17, решение Р-350): «Возврат
 * клиентов» берёт согласие на рассылку из последней заявки клиента
 * (ОР-10); отметка убирает рекомендацию из числа у пункта меню; число у
 * пункта равно неотмеченным; «Рекомендация месяца» есть; письмо 1-го
 * числа — одно на месяц, без сумм, позже третьего числа не уходит;
 * менеджеру раздел закрыт.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'z'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const DAY = 86_400_000;

describe('«Рекомендации» (РК-17)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const recommendations = await import('../src/lib/cabinet/recommendations.ts');
  const digest = await import('../src/lib/cabinet/head-digest.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const started = new Date();
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `rs-head-${stamp}@example.org`, fullName: 'Руководитель Рекомендаций', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `rs-mgr-${stamp}@example.org`, fullName: 'Менеджер Рекомендаций', role: 'MANAGER' } }),
    ]);
    const type = await prisma.serviceType.create({ data: { code: `rs-${stamp}`, name: 'Проверка рекомендаций' } });
    const [agreed, silent] = await Promise.all([
      prisma.clientProfile.create({ data: { fullName: `Согласный ${stamp}`, normalizedName: `rs согласный ${stamp}` } }),
      prisma.clientProfile.create({ data: { fullName: `Без согласия ${stamp}`, normalizedName: `rs без ${stamp}` } }),
    ]);
    const old = new Date(Math.floor((Date.now() - 300 * DAY) / DAY) * DAY);
    const base = { serviceTypeId: type.id, managerId: managerUser.id, status: 'COMPLETED' as const, startedOn: old };
    const [agreedWork, silentWork] = await Promise.all([
      prisma.project.create({ data: { ...base, clientId: agreed.id, code: `PD-RS-${String(stamp).slice(-6)}-A`, title: 'Давняя работа' } }),
      prisma.project.create({ data: { ...base, clientId: silent.id, code: `PD-RS-${String(stamp).slice(-6)}-B`, title: 'Давняя работа 2' } }),
    ]);
    const lead = await prisma.lead.create({
      data: {
        source: 'landing',
        name: `Согласный ${stamp}`,
        contactKind: 'email',
        contact: `rs-lead-${stamp}@example.org`,
        form: 'request',
        consentGiven: true,
        consentVersion: '2026-08-21',
        marketingOptIn: true,
        projectId: agreedWork.id,
      },
    });
    Object.assign(ids, {
      head: headUser.id,
      manager: managerUser.id,
      type: type.id,
      agreed: agreed.id,
      silent: silent.id,
      agreedWork: agreedWork.id,
      silentWork: silentWork.id,
      lead: lead.id,
    });
  });

  after(async () => {
    const users = [ids.head!, ids.manager!];
    await prisma.notificationOutbox.deleteMany({
      where: { OR: [{ userId: { in: users } }, { eventKind: 'HEAD_MONTHLY', createdAt: { gte: started } }] },
    });
    await prisma.recommendationMark.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.lead.updateMany({ where: { id: ids.lead }, data: { projectId: null } });
    await prisma.lead.deleteMany({ where: { id: ids.lead } });
    await prisma.project.deleteMany({ where: { id: { in: [ids.agreedWork!, ids.silentWork!] } } });
    await prisma.clientProfile.deleteMany({ where: { id: { in: [ids.agreed!, ids.silent!] } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it('согласие на рассылку — из последней заявки клиента; без заявки — «нет согласия»', async () => {
    const { returns } = await recommendations.recommendationsFor(head());
    assert.equal(returns.find((row) => row.clientId === ids.agreed)?.consent, true);
    assert.equal(returns.find((row) => row.clientId === ids.silent)?.consent, false);
  });

  it('отметка убирает рекомендацию из числа у пункта меню; число равно неотмеченным', async () => {
    const before = await recommendations.recommendationsFor(head());
    assert.ok(before.month !== null, 'рекомендации месяца нет');
    assert.equal(await recommendations.headRecommendationCount(head()), before.unmarked);
    const key = before.returns.find((row) => row.clientId === ids.agreed)!.key;
    await recommendations.markRecommendation(head(), key, 'DONE');
    const after = await recommendations.recommendationsFor(head());
    assert.equal(after.unmarked, before.unmarked - 1);
    assert.equal(await recommendations.headRecommendationCount(who(ids.manager!, 'MANAGER')), null);
  });

  it('письмо 1-го числа — одно на месяц, без сумм; позже третьего числа не уходит', async () => {
    await digest.enqueueHeadMonthly(new Date('2026-11-01T06:00:00Z'));
    await digest.enqueueHeadMonthly(new Date('2026-11-02T06:00:00Z'));
    const letters = await prisma.notificationOutbox.findMany({ where: { userId: ids.head, eventKind: 'HEAD_MONTHLY', channel: 'EMAIL' } });
    assert.equal(letters.length, 1, 'писем не одно');
    assert.equal(letters[0]!.dedupKey, `head-monthly:2026-11:${ids.head}:email`);
    assert.match(letters[0]!.body, /^Рекомендация месяца: /u);
    assert.doesNotMatch(letters[0]!.body, /₽/u, 'сумма в письме');
    await prisma.notificationOutbox.deleteMany({ where: { userId: ids.head, eventKind: 'HEAD_MONTHLY' } });
    await digest.enqueueHeadMonthly(new Date('2026-11-10T06:00:00Z'));
    assert.equal(await prisma.notificationOutbox.count({ where: { userId: ids.head, eventKind: 'HEAD_MONTHLY' } }), 0);
  });

  it('менеджеру раздел закрыт', async () => {
    await assert.rejects(recommendations.recommendationsFor(who(ids.manager!, 'MANAGER')), AccessDenied);
  });
});
