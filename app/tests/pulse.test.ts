/**
 * «Пульс практики» на «Сводке» (план по образцу, К-1, решение Р-585):
 * окна периодов, показатели и сравнение без базы.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LeadRow } from '../src/lib/cabinet/analytics/leads.ts';
import type { ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';
import { pulseChange, pulseMetrics, pulsePeriod, pulseWindow } from '../src/lib/cabinet/analytics/pulse.ts';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

function row(extra: Partial<ProjectRow>): ProjectRow {
  return {
    id: 'p', code: 'PD-1', title: 'Работа', clientId: 'c', clientName: 'Клиент', typeCode: 't', typeName: 'Вид',
    status: 'ACTIVE', startedOn: null, dueOn: null, closedOn: null, closedOnPlanned: false, firstClosedOn: null,
    signedOn: null, cost: 0n, paid: 0n, writtenOff: 0n, payments: [],
    ...extra,
  } as ProjectRow;
}

describe('окна «Пульса»', () => {
  it('7 и 28 дней — по сегодняшний включительно, прошлый период вплотную, отрезки по дням', () => {
    const w = pulseWindow('7', d('2026-10-14'));
    assert.deepEqual([iso(w.current.from), iso(w.current.to)], ['2026-10-08', '2026-10-14']);
    assert.deepEqual([iso(w.previous.from), iso(w.previous.to)], ['2026-10-01', '2026-10-07']);
    assert.equal(w.buckets.length, 7);
    assert.equal(pulseWindow('28', d('2026-10-14')).buckets.length, 28);
    assert.equal(w.against, 'к прежним 7 дням');
  });

  it('90 дней — неделями с конца: последняя кончается сегодня, первая неполная', () => {
    const w = pulseWindow('90', d('2026-10-14'));
    assert.equal(w.buckets.length, 13);
    assert.equal(iso(w.buckets.at(-1)!.to), '2026-10-14');
    assert.equal(iso(w.buckets[0]!.from), iso(w.current.from));
    const days = w.buckets.reduce((acc, b) => acc + (b.to.getTime() - b.from.getTime()) / 86_400_000 + 1, 0);
    assert.equal(days, 90);
  });

  it('текущий месяц — с 1-го по сегодня против тех же дней прошлого; хвост короткого месяца обрезан', () => {
    const w = pulseWindow('month', d('2026-10-14'));
    assert.deepEqual([iso(w.current.from), iso(w.previous.from), iso(w.previous.to)], ['2026-10-01', '2026-09-01', '2026-09-14']);
    assert.equal(w.caption, 'с 1 октября');
    assert.equal(w.against, 'к 1–14 сентября');
    const march = pulseWindow('month', d('2027-03-31'));
    assert.equal(iso(march.previous.to), '2027-02-28');
    assert.equal(pulseWindow('month', d('2026-10-01')).against, 'к 1 сентября');
  });

  it('неизвестный период — 90 дней', () => {
    assert.equal(pulsePeriod(undefined), '90');
    assert.equal(pulsePeriod('365'), '90');
    assert.equal(pulsePeriod('month'), 'month');
  });
});

describe('показатели «Пульса»', () => {
  const today = d('2026-10-14');
  const rows = [
    row({ startedOn: d('2026-10-10'), payments: [{ amount: 1_000_000n, on: d('2026-10-12') }, { amount: 500_000n, on: d('2026-10-02') }] }),
    row({ startedOn: d('2026-10-03'), status: 'COMPLETED', closedOn: d('2026-10-13'), firstClosedOn: d('2026-10-13') }),
    row({ startedOn: d('2026-09-01'), status: 'CANCELLED', closedOn: d('2026-10-09'), firstClosedOn: d('2026-10-09') }),
  ];
  const leads: LeadRow[] = [
    // 23:30 по Москве 13 октября — это 20:30 UTC того же дня; 01:00 по Москве 8 октября — 22:00 UTC 7-го.
    { createdAt: new Date('2026-10-13T20:30:00Z'), source: 'main', direction: null, converted: false },
    { createdAt: new Date('2026-10-07T22:00:00Z'), source: 'main', direction: null, converted: false },
    { createdAt: new Date('2026-10-05T10:00:00Z'), source: 'main', direction: null, converted: true },
  ];

  it('получено, заявки, принято и закрыто — за окно и за прошлый период; день заявки — московский', () => {
    const [received, newLeads, started, closed] = pulseMetrics(rows, leads, pulseWindow('7', today));
    assert.equal(received!.now, 1_000_000n);
    assert.equal(received!.before, 500_000n);
    assert.equal(newLeads!.now, 2n);
    assert.equal(newLeads!.before, 1n);
    assert.equal(started!.now, 1n);
    assert.equal(started!.before, 1n);
    assert.equal(closed!.now, 2n);
    assert.equal(closed!.detail, 'завершено 1 · отменено 1');
    // ряд по дням: 12 октября — 10 000 ₽
    assert.equal(received!.series.length, 7);
    assert.equal(received!.series[4], 10_000);
  });

  it('дата со временем внутри дня попадает и в итог, и в свой отрезок: сумма ряда равна числу плитки', () => {
    const timed = [row({ startedOn: new Date('2026-10-05T10:00:00Z'), payments: [{ amount: 13_000_000n, on: new Date('2026-10-05T10:00:00Z') }] })];
    for (const period of ['7', '28', 'month', '90'] as const) {
      const [received, , started] = pulseMetrics(timed, [], pulseWindow(period, today));
      assert.equal(received!.series.reduce((a, b) => a + b, 0) * 100, Number(received!.now), period);
      assert.equal(started!.series.reduce((a, b) => a + b, 0), Number(started!.now), period);
    }
  });

  it('сравнение словами: рост, спад, ноль в прошлом периоде', () => {
    const f = (value: bigint) => String(value);
    assert.equal(pulseChange(3n, 2n, 'к прежним 7 дням', f), '+1 (+50 %) к прежним 7 дням');
    assert.equal(pulseChange(1n, 4n, 'к прежним 7 дням', f), '−3 (−75 %) к прежним 7 дням');
    assert.equal(pulseChange(2n, 2n, 'к прежним 7 дням', f), 'столько же, к прежним 7 дням');
    assert.equal(pulseChange(2n, 0n, 'к прежним 7 дням', f), 'к прежним 7 дням: было 0');
    assert.equal(pulseChange(0n, 0n, 'к прежним 7 дням', f), 'к прежним 7 дням: тоже 0');
    // Меньше половины процента — не «+0 %» рядом с ненулевой разницей.
    assert.equal(pulseChange(1001n, 1000n, 'к прежним 7 дням', f), '+1 (менее 1 %) к прежним 7 дням');
    assert.equal(pulseChange(999n, 1000n, 'к прежним 7 дням', f), '−1 (менее 1 %) к прежним 7 дням');
  });
});
