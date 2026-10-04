/**
 * Календарь продвижения (требование РК-16, решение Р-349): расчёт по
 * обезличенной книге заказов на 03.10.2026 даёт значения таблицы 6.4
 * плана руководителя; сезонная норма — по новому правилу окна (6.1, 6.2):
 * с 01.09.2024 по последний полный месяц, по московскому дню.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { calendarKey, calendarNow, promoCalendar } from '../src/lib/cabinet/analytics/calendar.ts';
import { ANALYTICS_SINCE_DEFAULT, seasonalNorm, type ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';

interface BookOrder {
  readonly orderedOn: string | null;
  readonly typeCode: string;
  readonly typeName: string;
  readonly dueOn: string | null;
  readonly cost: number;
}

const book = (
  JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'data', 'book.json'), 'utf8')) as {
    orders: BookOrder[];
  }
).orders;
const day = (iso: string | null) => (iso === null ? null : new Date(`${iso}T00:00:00Z`));
const rows = book.map(
  (order, index) =>
    ({
      id: `b${index}`,
      code: `PD-B-${index}`,
      title: 'Работа',
      typeCode: order.typeCode,
      typeName: order.typeName,
      startedOn: day(order.orderedOn),
      dueOn: day(order.dueOn),
      cost: BigInt(Math.round(order.cost * 100)),
    }) as unknown as ProjectRow,
);
// Полдень 3 октября 2026 года по Москве.
const AT = new Date('2026-10-03T09:00:00Z');
const OPTIONS = { since: ANALYTICS_SINCE_DEFAULT, thresholds: { sure: 20, likely: 10, maybe: 5 } };
const calendar = promoCalendar(rows, AT, OPTIONS);
const of = (code: string) => calendar.find((row) => row.typeCode === code)!;
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe('сезонная норма по новому правилу (РК-16, таблицы 6.1 и 6.2)', () => {
  const season = seasonalNorm(rows, AT);
  it('знаменатель: сентябрь — три года, остальные месяцы — два', () => {
    assert.deepEqual(
      season.map((month) => month.yearsObserved),
      [2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2],
    );
  });
  it('нормы практики и «ноябрь: 4,5; по годам 7 и 2»', () => {
    assert.deepEqual(
      season.map((month) => Math.round(month.norm * 100) / 100),
      [2.5, 2, 2, 3, 1.5, 0, 0.5, 0.5, 2.67, 2.5, 4.5, 4],
    );
    assert.deepEqual(season[10]!.years.map((year) => year.orders), [7, 2]);
  });
});

describe('календарь продвижения (РК-16, таблица 6.4)', () => {
  it('ВКР: сдача в декабре (8 / 2), медиана 56, заказ 20.10.2026, окно с 08.09, главное с 22.09', () => {
    const row = of('diploma');
    assert.equal(row.observations, 20);
    assert.deepEqual(row.deliveryMonths, [12]);
    assert.equal(row.deliveryCount, 8);
    assert.equal(row.deliverySeasons, 2);
    assert.equal(row.medianDays, 56);
    assert.equal(iso(row.orderOn), '2026-10-20');
    assert.equal(iso(row.windowStart), '2026-09-08');
    assert.equal(iso(row.mainStart), '2026-09-22');
    assert.equal(row.peak?.month, 11);
    assert.deepEqual(row.peak?.years.map((year) => year.orders), [3, 1]);
    assert.equal(Math.round(row.normInWindow! * 100) / 100, 1.73);
    assert.equal(row.averageCheck, 5_500_000n);
    assert.equal(row.confidence, 'LIKELY');
    assert.equal(row.state, 'main');
  });

  it('диссертации: сдача в мае, медиана 155, заказ 11.12.2026, окно с 30.10, вес ≈ 150 300 ₽', () => {
    const row = of('dissertation');
    assert.deepEqual(row.deliveryMonths, [5]);
    assert.equal(row.medianDays, 155);
    assert.equal(iso(row.orderOn), '2026-12-11');
    assert.equal(iso(row.windowStart), '2026-10-30');
    assert.equal(iso(row.mainStart), '2026-11-13');
    assert.equal(Math.round(Number(row.weight) / 10_000) * 100, 150_300);
    assert.equal(row.confidence, 'MAYBE');
  });

  it('публикации, НИР, аспиранты — даты и уверенность таблицы', () => {
    assert.deepEqual(
      ['article', 'research', 'postgrad'].map((code) => [code, iso(of(code).orderOn), of(code).confidence]),
      [
        ['article', '2026-11-11', 'LIKELY'],
        ['research', '2026-12-01', 'MAYBE'],
        ['postgrad', '2026-10-29', 'MAYBE'],
      ],
    );
    assert.equal(of('article').observations, 12);
    assert.equal(of('article').medianDays, 34.5);
    assert.equal(of('article').averageCheck, 9_750_000n);
  });

  it('научный консалтинг: два месяца сдачи, мало данных — окна нет', () => {
    const row = of('consulting');
    assert.deepEqual(row.deliveryMonths, [2, 9]);
    assert.equal(row.confidence, 'FEW');
    assert.equal(row.orderOn, null);
    assert.equal(row.weight, null);
  });

  it('«Сейчас»: ВКР и аспиранты — главное окно, публикации — окно открыто; отмеченное не повторяется', () => {
    const now = calendarNow(calendar, new Set());
    assert.deepEqual(now.map((row) => [row.typeCode, row.state]), [
      ['diploma', 'main'],
      ['postgrad', 'main'],
      ['article', 'open'],
    ]);
    const marked = new Set([calendarKey(of('diploma'))!]);
    assert.ok(!calendarNow(calendar, marked).some((row) => row.typeCode === 'diploma'));
  });
});
