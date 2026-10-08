/**
 * Календарь продвижения в кабинете (требование РК-16, решение Р-349):
 * дата начала учёта и пороги уверенности — настройки практики, правит
 * руководитель, ошибочный ввод отклоняется, изменение — в журнал;
 * отметки «сделано» и «отложено», «принято» и «отклонено» (Р-491)
 * хранятся по ключу окна, снимаются и убирают окно из «Сейчас»; менеджеру
 * календарь и отметки закрыты.
 *
 * Пропускается без заданного адреса базы; запускается `npm run test:db`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';

process.env.SESSION_SECRET ??= 'y'.repeat(48);

const enabled = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe('календарь продвижения в кабинете (РК-16)', { skip: !enabled }, async () => {
  const { prisma } = await import('../src/lib/db.ts');
  const settings = await import('../src/lib/cabinet/practice-settings.ts');
  const recommendations = await import('../src/lib/cabinet/recommendations.ts');
  const { AccessDenied } = await import('../src/lib/cabinet/access.ts');

  const ids: Record<string, string> = {};
  const who = (id: string, role: Actor['role']): Actor => ({
    id,
    role,
    status: 'ACTIVE',
    clientProfileId: null,
    expertNdaSignedAt: null,
  });
  const head = () => who(ids.head!, 'HEAD');
  const manager = () => who(ids.manager!, 'MANAGER');
  const KEY = `calendar:test-${stamp}:2026-10-20`;

  before(async () => {
    const [headUser, managerUser] = await Promise.all([
      prisma.user.create({ data: { email: `rm-head-${stamp}@example.org`, fullName: 'Руководитель Календаря', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `rm-mgr-${stamp}@example.org`, fullName: 'Менеджер Календаря', role: 'MANAGER' } }),
    ]);
    Object.assign(ids, { head: headUser.id, manager: managerUser.id });
  });

  after(async () => {
    await prisma.recommendationMark.deleteMany({ where: { OR: [{ key: KEY }, { userId: { in: [ids.head!, ids.manager!] } }] } });
    await prisma.practiceSetting.deleteMany({ where: { key: { in: ['analyticsSince', 'confidenceThresholds'] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [ids.head!, ids.manager!] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.head!, ids.manager!] } } });
  });

  it('дата начала учёта: по умолчанию 01.09.2024; ошибочный ввод отклоняется; изменение — в журнал', async () => {
    assert.equal((await settings.analyticsSince()).toISOString().slice(0, 10), '2024-09-01');
    await assert.rejects(settings.saveAnalyticsSince(manager(), '2025-01-01'), AccessDenied);
    await assert.rejects(settings.saveAnalyticsSince(head(), '2025-02-30'), /Дата начала учёта/u);
    await assert.rejects(settings.saveAnalyticsSince(head(), '2099-01-01'), /Дата начала учёта/u);
    await settings.saveAnalyticsSince(head(), '2025-01-01');
    assert.equal((await settings.analyticsSince()).toISOString().slice(0, 10), '2025-01-01');
    const entry = await prisma.auditEvent.findFirst({ where: { actorId: ids.head, objectId: 'analyticsSince' } });
    assert.deepEqual(entry?.payload, { from: '2024-09-01', to: '2025-01-01' });
    await settings.saveAnalyticsSince(head(), '2024-09-01');
  });

  it('пороги уверенности: три убывающих числа', async () => {
    assert.deepEqual(await settings.confidenceThresholds(), { sure: 20, likely: 10, maybe: 5 });
    await assert.rejects(settings.saveConfidenceThresholds(head(), '5, 10, 20'), /три убывающих/u);
    await assert.rejects(settings.saveConfidenceThresholds(head(), '20, 10'), /три убывающих/u);
    await settings.saveConfidenceThresholds(head(), '30 15 6');
    assert.deepEqual(await settings.confidenceThresholds(), { sure: 30, likely: 15, maybe: 6 });
    await settings.saveConfidenceThresholds(head(), '20, 10, 5');
  });

  it('отметка «сделано» хранится по ключу окна и снимается; «Сейчас» отмеченное не повторяет', async () => {
    await assert.rejects(recommendations.markRecommendation(head(), 'нет такого', 'DONE'), /Неизвестная рекомендация/u);
    await recommendations.markRecommendation(head(), KEY, 'DONE');
    let marks = await recommendations.recommendationMarks(head());
    assert.equal(marks.get(KEY)?.status, 'DONE');
    assert.equal(marks.get(KEY)?.by, 'Руководитель Календаря');
    await recommendations.markRecommendation(head(), KEY, 'POSTPONED');
    marks = await recommendations.recommendationMarks(head());
    assert.equal(marks.get(KEY)?.status, 'POSTPONED');

    const calendar = await recommendations.calendarFor(head());
    const open = calendar.now[0];
    if (open !== undefined) {
      const { calendarKey } = await import('../src/lib/cabinet/analytics/calendar.ts');
      const key = calendarKey(open)!;
      await recommendations.markRecommendation(head(), key, 'DONE');
      const after = await recommendations.calendarFor(head());
      assert.ok(!after.now.some((row) => row.typeCode === open.typeCode), 'отмеченное окно осталось в «Сейчас»');
      await recommendations.markRecommendation(head(), key, null);
    }

    await recommendations.markRecommendation(head(), KEY, null);
    assert.equal((await recommendations.recommendationMarks(head())).has(KEY), false);
  });

  it('рекомендацию принимают и отклоняют; принятая уходит из числа, неизвестная отметка отклоняется (Р-491)', async () => {
    await recommendations.markRecommendation(head(), KEY, 'ACCEPTED');
    let marks = await recommendations.recommendationMarks(head());
    assert.equal(marks.get(KEY)?.status, 'ACCEPTED');
    assert.equal(recommendations.MARK_LABEL.ACCEPTED, 'принято');
    await recommendations.markRecommendation(head(), KEY, 'DECLINED');
    marks = await recommendations.recommendationMarks(head());
    assert.equal(marks.get(KEY)?.status, 'DECLINED');
    assert.equal(recommendations.MARK_LABEL.DECLINED, 'отклонено');
    await assert.rejects(
      recommendations.markRecommendation(head(), KEY, 'LOST' as never),
      /Неизвестная отметка/u,
    );
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DECLINED');

    // Принятое окно уходит из «Сейчас» и из числа у пункта меню.
    const before = await recommendations.recommendationsFor(head());
    const open = before.calendar.now[0];
    if (open !== undefined) {
      const { calendarKey } = await import('../src/lib/cabinet/analytics/calendar.ts');
      const key = calendarKey(open)!;
      await recommendations.markRecommendation(head(), key, 'ACCEPTED');
      const accepted = await recommendations.recommendationsFor(head());
      assert.ok(!accepted.calendar.now.some((row) => row.typeCode === open.typeCode), 'принятое окно осталось в «Сейчас»');
      assert.equal(accepted.marks.get(key)?.status, 'ACCEPTED');
      await recommendations.markRecommendation(head(), key, null);
    }
    const entry = await prisma.auditEvent.findFirst({
      where: { actorId: ids.head, action: 'RECOMMENDATION_MARKED', objectId: KEY },
      orderBy: { occurredAt: 'desc' },
    });
    assert.deepEqual(entry?.payload, { status: 'DECLINED' });
    await recommendations.markRecommendation(head(), KEY, null);
  });

  it('менеджеру календарь и отметки закрыты', async () => {
    await assert.rejects(recommendations.calendarFor(manager()), AccessDenied);
    await assert.rejects(recommendations.markRecommendation(manager(), KEY, 'DONE'), AccessDenied);
  });
});
