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
const DAY = 86_400_000;
// 21.10.2026 по Москве: окно вида с декабрьской сдачей идёт.
const AT = new Date('2026-10-21T09:00:00Z');

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
  const TYPE = `rm-${stamp}`;
  // Работы вида: сдача 15.12.2025, длительности 36–44 дня — медиана 40.
  const work = (index: number, days: number) => ({
    serviceTypeId: ids.type!,
    clientId: ids.client!,
    managerId: ids.manager!,
    code: `PD-RM-${String(stamp).slice(-6)}-${index}`,
    title: 'Работа календаря',
    startedOn: new Date(Date.UTC(2025, 11, 15) - days * DAY),
    dueOn: new Date(Date.UTC(2025, 11, 15)),
  });

  before(async () => {
    const [headUser, managerUser, type, client] = await Promise.all([
      prisma.user.create({ data: { email: `rm-head-${stamp}@example.org`, fullName: 'Руководитель Календаря', role: 'HEAD' } }),
      prisma.user.create({ data: { email: `rm-mgr-${stamp}@example.org`, fullName: 'Менеджер Календаря', role: 'MANAGER' } }),
      prisma.serviceType.create({ data: { code: TYPE, name: 'Проверка календаря' } }),
      prisma.clientProfile.create({ data: { fullName: `Клиент Календаря ${stamp}`, normalizedName: `клиент календаря ${stamp}` } }),
    ]);
    Object.assign(ids, { head: headUser.id, manager: managerUser.id, type: type.id, client: client.id });
    await prisma.project.createMany({ data: [36, 38, 40, 42, 44].map((days, index) => work(index, days)) });
  });

  after(async () => {
    await prisma.recommendationMark.deleteMany({
      where: { OR: [{ key: KEY }, { key: { startsWith: `calendar:${TYPE}:` } }, { userId: { in: [ids.head!, ids.manager!] } }] },
    });
    await prisma.project.deleteMany({ where: { serviceTypeId: ids.type } });
    await prisma.clientProfile.deleteMany({ where: { id: ids.client } });
    await prisma.serviceType.deleteMany({ where: { id: ids.type } });
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

  it('снимается только отметка, которую человек видел; незнакомое значение не снимает отметку (Р-498)', async () => {
    await recommendations.markRecommendation(head(), KEY, 'ACCEPTED');
    // На другой вкладке отметку сменили на «отклонено»; эта вкладка всё ещё
    // показывает «принято» и жмёт «Снять отметку».
    await recommendations.markRecommendation(head(), KEY, 'DECLINED');
    await assert.rejects(
      recommendations.markRecommendation(head(), KEY, null, 'ACCEPTED'),
      /Отметку уже изменили/u,
    );
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DECLINED');
    await assert.rejects(
      recommendations.markRecommendation(head(), KEY, null, 'LOST' as never),
      /Неизвестная отметка/u,
    );
    await recommendations.markRecommendation(head(), KEY, null, 'DECLINED');
    assert.equal((await recommendations.recommendationMarks(head())).has(KEY), false);

    // Действие экрана: снятием считается только пустое значение, а
    // незнакомое уходит в проверку отметок и отклоняется ею.
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const actions = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'actions.ts'), 'utf8');
    assert.match(actions, /raw === '' \? null : \(raw as RecommendationMarkStatus\)/u);
  });

  it('ставится и меняется только отметка, которую человек видел; «сделано» — только у принятой (Р-537)', async () => {
    // Вкладка B открыта, пока рекомендация без отметки; на вкладке A её
    // отклонили. «Принять» на B не перезаписывает отклонение.
    await recommendations.markRecommendation(head(), KEY, 'DECLINED', null);
    await assert.rejects(recommendations.markRecommendation(head(), KEY, 'ACCEPTED', null), /Отметку уже изменили/u);
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DECLINED');
    // На B ещё «принято», а в базе уже «отклонено»: «Сделано» отказывает.
    await assert.rejects(recommendations.markRecommendation(head(), KEY, 'DONE', 'ACCEPTED'), /Отметку уже изменили/u);
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DECLINED');
    // «Сделано» не ставится у непринятой рекомендации.
    await assert.rejects(recommendations.markRecommendation(head(), KEY, 'DONE', 'DECLINED'), /принятую/u);
    await assert.rejects(recommendations.markRecommendation(head(), KEY, 'DONE', null), /принятую/u);
    // Снятие с экрана, где отметки не было, появившуюся не удаляет.
    await assert.rejects(recommendations.markRecommendation(head(), KEY, null, null), /Отметку уже изменили/u);
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DECLINED');
    // Сверка совпала — отметка меняется.
    await recommendations.markRecommendation(head(), KEY, 'ACCEPTED', 'DECLINED');
    await recommendations.markRecommendation(head(), KEY, 'DONE', 'ACCEPTED');
    assert.equal((await recommendations.recommendationMarks(head())).get(KEY)?.status, 'DONE');
    await recommendations.markRecommendation(head(), KEY, null, 'DONE');
    assert.equal((await recommendations.recommendationMarks(head())).has(KEY), false);

    // Экран передаёт видимое состояние у каждой кнопки отметки.
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const marks = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'RecommendationMarks.tsx'), 'utf8');
    assert.match(marks, /<input type="hidden" name="current" value=\{mark\?\.status \?\? ''\} \/>/u);
    const actions = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'actions.ts'), 'utf8');
    assert.match(actions, /current === '' \? null : \(current as RecommendationMarkStatus\)/u);
  });

  it('отметка прежнего вида, совпадающая с расчётом, считается; новая пишется ключом сезона, снятие снимает оба (Р-656)', async () => {
    const { calendarKey, legacyCalendarKey } = await import('../src/lib/cabinet/analytics/calendar.ts');
    const before = await recommendations.recommendationsFor(head(), AT);
    const row = before.calendar.rows.find((item) => item.typeCode === TYPE)!;
    const inNow = (advice: typeof before) => advice.calendar.now.some((item) => item.typeCode === TYPE);
    assert.ok(inNow(before), 'заготовка: окно вида в «Сейчас»');
    const season = calendarKey(row)!;
    const legacy = legacyCalendarKey(row)!;
    assert.equal(season, `calendar:${TYPE}:2026-12`);
    assert.equal(legacy, `calendar:${TYPE}:2026-11-05`);
    const stored = async () =>
      (await prisma.recommendationMark.findMany({ where: { key: { in: [season, legacy] } }, orderBy: { key: 'asc' } })).map(
        (mark) => [mark.key, mark.status],
      );

    // Отметка, поставленная до Р-656, — по дате заказа; не переносилась.
    await prisma.recommendationMark.create({ data: { key: legacy, status: 'ACCEPTED', userId: ids.head! } });
    const marked = await recommendations.recommendationsFor(head(), AT);
    assert.equal(marked.marks.get(season)?.status, 'ACCEPTED');
    assert.equal(marked.marks.get(season)?.legacy, legacy);
    assert.ok(!inNow(marked), 'отмеченное окно в «Сейчас»');
    assert.equal(marked.unmarked, before.unmarked - 1);

    // «Сделано» пишется ключом сезона, прежняя строка снимается: иначе при
    // обратном сдвиге медианы она снова стала бы видна.
    await recommendations.markRecommendation(head(), season, 'DONE', 'ACCEPTED', legacy);
    assert.deepEqual(await stored(), [[season, 'DONE']]);
    assert.equal((await recommendations.calendarFor(head(), AT)).marks.get(season)?.status, 'DONE');
    // Снятие снимает оба ключа — окно снова ждёт решения.
    await recommendations.markRecommendation(head(), season, null, 'DONE', legacy);
    assert.deepEqual(await stored(), []);
    assert.ok(inNow(await recommendations.recommendationsFor(head(), AT)));

    // Вкладка с прежней отметкой «принято», а её уже отклонили: снятие отказывает.
    await prisma.recommendationMark.create({ data: { key: legacy, status: 'ACCEPTED', userId: ids.head! } });
    await recommendations.markRecommendation(head(), season, 'DECLINED', 'ACCEPTED', legacy);
    await assert.rejects(recommendations.markRecommendation(head(), season, null, 'ACCEPTED', legacy), /Отметку уже изменили/u);
    assert.deepEqual(await stored(), [[season, 'DECLINED']]);
    await recommendations.markRecommendation(head(), season, null, 'DECLINED', legacy);
    assert.deepEqual(await stored(), []);
    // Только прежняя отметка — снимается она.
    await prisma.recommendationMark.create({ data: { key: legacy, status: 'POSTPONED', userId: ids.head! } });
    await recommendations.markRecommendation(head(), season, null, 'POSTPONED', legacy);
    assert.deepEqual(await stored(), []);
    // Ключ прежнего вида — только той же рекомендации.
    await assert.rejects(
      recommendations.markRecommendation(head(), season, null, 'ACCEPTED', 'price:other:2026-11-05'),
      /Неизвестная рекомендация/u,
    );

    // Экран передаёт прежний ключ у кнопок отметки, действие — дальше.
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const marks = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'RecommendationMarks.tsx'), 'utf8');
    assert.match(marks, /<input type="hidden" name="legacy" value=\{mark\.legacy\} \/>/u);
    const actions = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'actions.ts'), 'utf8');
    assert.match(actions, /legacy === '' \? undefined : legacy/u);
  });

  it('отметка окна — по сезону: новые заказы вида сдвигают медиану, а окно в «Сейчас» не возвращается (Р-656)', async () => {
    const { calendarKey } = await import('../src/lib/cabinet/analytics/calendar.ts');
    const of = (advice: Awaited<ReturnType<typeof recommendations.recommendationsFor>>) =>
      advice.calendar.rows.find((row) => row.typeCode === TYPE)!;
    const inNow = (advice: Awaited<ReturnType<typeof recommendations.recommendationsFor>>) =>
      advice.calendar.now.some((row) => row.typeCode === TYPE);
    const before = await recommendations.recommendationsFor(head(), AT);
    assert.ok(inNow(before), 'заготовка: окно вида в «Сейчас»');
    const key = calendarKey(of(before))!;
    await recommendations.markRecommendation(head(), key, 'ACCEPTED', null);
    const marked = await recommendations.recommendationsFor(head(), AT);
    assert.ok(!inNow(marked));

    // Два новых заказа по 30 дней: медиана 40 → 38, дата заказа сдвигается.
    await prisma.project.createMany({ data: [work(5, 30), work(6, 30)] });
    const after = await recommendations.recommendationsFor(head(), AT);
    assert.notEqual(of(after).orderOn?.getTime(), of(before).orderOn?.getTime(), 'заготовка: дата заказа не сдвинулась');
    assert.ok(!inNow(after), 'отмеченное окно вернулось в «Сейчас»');
    assert.equal(after.unmarked, marked.unmarked, 'отмеченное окно снова ждёт решения');
    assert.equal(after.marks.get(calendarKey(of(after))!)?.status, 'ACCEPTED');
    await recommendations.markRecommendation(head(), calendarKey(of(after))!, null, 'ACCEPTED');
  });

  it('менеджеру календарь и отметки закрыты', async () => {
    await assert.rejects(recommendations.calendarFor(manager()), AccessDenied);
    await assert.rejects(recommendations.markRecommendation(manager(), KEY, 'DONE'), AccessDenied);
  });
});
