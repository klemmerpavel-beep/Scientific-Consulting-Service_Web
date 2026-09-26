/**
 * Определения величин на экранах руководителя (решение Р-256).
 *
 * Аудит нашёл, что одни и те же по смыслу величины главная, экран денег,
 * аналитика и отчёт считали по-разному: отменённая работа числилась и в
 * потерях, и к получению; «законтрактовано за период» брало договор
 * старой работы, закрытой в периоде; срок «прошёл» то по текущему
 * моменту, то по UTC-суткам; средний чек без договоров показывался
 * «0 ₽». Здесь проверяются принятые определения на наборах, где ответ
 * известен заранее. Без базы.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  byMonth,
  clients,
  conclusions,
  contractedBetween,
  cycles,
  durationOf,
  lateOpen,
  losses,
  openBalance,
  overview,
  products,
  receivables,
  verdict,
  type ProjectRow,
} from '../src/lib/cabinet/analytics/metrics.ts';
import { daysPast, isPastDue, moscowToday, now } from '../src/lib/cabinet/clock.ts';
import {
  PAYMENT_CLOSED_STATUSES,
  expectsPayment,
  receivableOf,
  roundRuble,
  workMoneyNote,
} from '../src/lib/cabinet/money.ts';

/** Полдень по Москве 16 сентября 2026 года. */
const CONTROL = new Date(Date.UTC(2026, 8, 16, 9));
const DAY = 86_400_000;

/** Неразрывные пробелы разрядов — обычными: проверяется смысл, а не набор. */
const spaces = (text: string): string => text.replace(/[\u00a0\u202f]/gu, ' ');

function row(over: Partial<ProjectRow> & { code: string }): ProjectRow {
  return {
    id: over.code,
    title: 'Работа',
    clientId: 'c1',
    clientName: 'Иванов И. И.',
    typeCode: 'dissertation',
    typeName: 'Диссертация',
    status: 'ACTIVE',
    startedOn: new Date(Date.UTC(2026, 0, 10)),
    dueOn: null,
    closedOn: null,
    signedOn: null,
    cost: 10_000_000n,
    paid: 0n,
    writtenOff: 0n,
    payments: [],
    ...over,
  };
}

describe('отменённая работа денег не ждёт', () => {
  const cancelled = row({
    code: 'PD-C',
    status: 'CANCELLED',
    cost: 20_000_000n,
    paid: 5_000_000n,
    dueOn: new Date(Date.UTC(2026, 5, 1)),
    closedOn: new Date(Date.UTC(2026, 6, 1)),
  });
  const paused = row({
    code: 'PD-P',
    status: 'PAUSED',
    cost: 8_000_000n,
    paid: 2_000_000n,
    dueOn: new Date(Date.UTC(2026, 5, 1)),
  });

  it('правило живёт в одном месте: отменённая — нет, приостановленная — да', () => {
    assert.deepEqual([...PAYMENT_CLOSED_STATUSES], ['CANCELLED']);
    assert.equal(expectsPayment('CANCELLED'), false);
    assert.equal(expectsPayment('PAUSED'), true);
    assert.equal(expectsPayment('ACTIVE'), true);
    assert.equal(expectsPayment('COMPLETED'), true);
    const tranches = [{ amount: 5_000_000n, status: 'PAID' }];
    assert.equal(receivableOf('CANCELLED', 20_000_000n, tranches), 0n);
    assert.equal(receivableOf('PAUSED', 20_000_000n, tranches), 15_000_000n);
  });

  it('не входит ни в задолженность, ни в дебиторку, ни в остаток с прошедшим сроком', () => {
    assert.equal(openBalance(cancelled), 0n);
    assert.equal(overview([cancelled]).outstanding, 0n);
    assert.equal(receivables([cancelled], CONTROL).length, 0);
    // Приостановленная остаётся к получению: она может возобновиться.
    assert.equal(overview([cancelled, paused]).outstanding, 6_000_000n);
    assert.deepEqual(
      receivables([cancelled, paused], CONTROL).map((debt) => debt.code),
      ['PD-P'],
    );
  });

  it('входит в потери вместе с приостановленной', () => {
    const report = losses([cancelled, paused]);
    assert.equal(report.total, 15_000_000n + 6_000_000n);
    assert.deepEqual(
      report.rows.map((loss) => loss.code),
      ['PD-C', 'PD-P'],
    );
  });

  it('выводы и итог не зовут взыскивать остаток отменённой работы', () => {
    const advice = conclusions([cancelled], CONTROL);
    assert.ok(
      advice.every((item) => item.area !== 'Деньги'),
      'вывод о взыскании назвал остаток отменённой работы',
    );
    const digest = verdict([cancelled], CONTROL);
    assert.ok(digest !== null);
    assert.equal(digest.risk, null);
    assert.match(digest.state, /к получению остаток 0 ?₽|к получению остаток 0 ₽/u);
  });
});

describe('законтрактовано за период', () => {
  const from = new Date(CONTROL.getTime() - 30 * DAY);

  it('договор старой работы, закрытой в периоде, в период не входит', () => {
    const old = row({
      code: 'PD-OLD',
      status: 'COMPLETED',
      startedOn: new Date(Date.UTC(2024, 2, 1)),
      signedOn: new Date(Date.UTC(2024, 2, 3)),
      closedOn: new Date(Date.UTC(2026, 8, 10)),
      cost: 50_000_000n,
    });
    const fresh = row({
      code: 'PD-NEW',
      startedOn: new Date(Date.UTC(2026, 8, 1)),
      signedOn: new Date(Date.UTC(2026, 8, 2)),
      cost: 12_000_000n,
    });
    const period = contractedBetween([old, fresh], from, CONTROL);
    assert.equal(period.total, 12_000_000n);
    assert.equal(period.count, 1);
    assert.equal(period.averageCheck, 12_000_000n);
  });

  it('без даты договора работа относится к периоду по дню начала', () => {
    const unsigned = row({ code: 'PD-U', startedOn: new Date(Date.UTC(2026, 8, 5)), cost: 3_000_000n });
    const signedEarlier = row({
      code: 'PD-S',
      // Начата в периоде, но договор подписан раньше — по договору не входит.
      startedOn: new Date(Date.UTC(2026, 8, 5)),
      signedOn: new Date(Date.UTC(2026, 5, 5)),
      cost: 7_000_000n,
    });
    assert.equal(contractedBetween([unsigned, signedEarlier], from, CONTROL).total, 3_000_000n);
  });

  it('без договоров в периоде среднего чека нет, а не «0 ₽»', () => {
    const period = contractedBetween([row({ code: 'PD-0', cost: 0n })], from, CONTROL);
    assert.equal(period.total, 0n);
    assert.equal(period.averageCheck, null);
  });

  it('средний чек округляется до рубля так же, как в аналитике', () => {
    assert.equal(roundRuble(9_601_851n), 9_601_900n);
    assert.equal(roundRuble(9_601_849n), 9_601_800n);
  });
});

describe('срок прошёл — по началу московского дня', () => {
  const due = new Date(Date.UTC(2026, 8, 16));

  it('сегодня по Москве — от тех же часов, что у экранов', () => {
    // 23:30 по UTC 16-го — уже 02:30 17-го по Москве.
    assert.equal(
      moscowToday(new Date(Date.UTC(2026, 8, 16, 23, 30))).toISOString(),
      '2026-09-17T00:00:00.000Z',
    );
    assert.equal(
      moscowToday(new Date(Date.UTC(2026, 8, 16, 20, 30))).toISOString(),
      '2026-09-16T00:00:00.000Z',
    );
    const before = process.env.CABINET_NOW;
    const base = process.env.DATABASE_URL;
    process.env.CABINET_NOW = '2026-09-16T22:00:00.000Z';
    process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5433/prodisser_artboards';
    try {
      assert.equal(now().toISOString(), '2026-09-16T22:00:00.000Z');
      assert.equal(moscowToday().toISOString(), '2026-09-17T00:00:00.000Z');
    } finally {
      if (before === undefined) delete process.env.CABINET_NOW;
      else process.env.CABINET_NOW = before;
      if (base === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = base;
    }
  });

  it('в день срока по Москве срок ещё не прошёл', () => {
    const lateEvening = new Date(Date.UTC(2026, 8, 16, 20, 30)); // 23:30 МСК
    assert.equal(isPastDue(due, lateEvening), false);
    assert.equal(daysPast(due, lateEvening), null);
  });

  it('с московской полуночи срок прошёл, хотя по UTC ещё тот же день', () => {
    const afterMidnight = new Date(Date.UTC(2026, 8, 16, 21, 30)); // 00:30 МСК 17-го
    assert.equal(isPastDue(due, afterMidnight), true);
    assert.equal(daysPast(due, afterMidnight), 1);
    const work = row({ code: 'PD-L', dueOn: due, cost: 5_000_000n });
    assert.equal(receivables([work], afterMidnight)[0]?.overdueDays, 1);
    assert.equal(lateOpen([work], afterMidnight).length, 1);
    assert.equal(cycles([work], afterMidnight).overdueOpen, 1);
    // Час назад, 23:30 по Москве, та же работа ещё в сроке.
    const lateEvening = new Date(Date.UTC(2026, 8, 16, 20, 30));
    assert.equal(receivables([work], lateEvening)[0]?.overdueDays, 0);
    assert.equal(lateOpen([work], lateEvening).length, 0);
  });

  it('с прошедшим сроком — действующие: идущие и приостановленные, не закрытые', () => {
    const past = new Date(Date.UTC(2026, 7, 1));
    const list = lateOpen(
      [
        row({ code: 'A', status: 'ACTIVE', dueOn: past }),
        row({ code: 'P', status: 'PAUSED', dueOn: past }),
        row({ code: 'D', status: 'COMPLETED', dueOn: past }),
        row({ code: 'X', status: 'CANCELLED', dueOn: past }),
      ],
      CONTROL,
    );
    assert.deepEqual(
      list.map((item) => item.code),
      ['A', 'P'],
    );
  });
});

describe('пустые состояния — «нет данных», а не нули', () => {
  it('средний чек без договоров и собираемость без завершённых работ', () => {
    const report = overview([row({ code: 'PD-1', cost: 0n })]);
    assert.equal(report.averageCheck, null);
    assert.equal(report.collection, null);
  });

  it('статистика цены позиции без договоров', () => {
    const [product] = products([row({ code: 'PD-1', cost: 0n })]);
    assert.ok(product !== undefined);
    assert.equal(product.orders, 1);
    assert.equal(product.averageCheck, null);
    assert.equal(product.medianCheck, null);
    assert.equal(product.min, null);
    assert.equal(product.max, null);
    assert.equal(product.variation, null);
    assert.equal(product.needsPriceList, false);
  });

  it('медиана LTV и доля пяти крупнейших без договоров', () => {
    const report = clients([row({ code: 'PD-1', cost: 0n })], CONTROL);
    assert.equal(report.medianLtv, null);
    assert.equal(report.top5Share, null);
  });
});

describe('счёт работ и сроков', () => {
  it('действующих — идущие и приостановленные', () => {
    const report = overview([
      row({ code: 'A', status: 'ACTIVE' }),
      row({ code: 'P', status: 'PAUSED' }),
      row({ code: 'D', status: 'COMPLETED' }),
    ]);
    assert.equal(report.ongoing, 2);
    assert.equal(report.active, 1);
    assert.equal(report.paused, 1);
    const digest = verdict(
      [row({ code: 'A', status: 'ACTIVE' }), row({ code: 'P', status: 'PAUSED' })],
      CONTROL,
    );
    assert.match(digest?.state ?? '', /Действующих работ 2 из 2 \(из них приостановлено 1\)/u);
  });

  it('отменённая работа не завершает кривую срока, а цензурирует её', () => {
    const cancelled = row({
      code: 'PD-X',
      status: 'CANCELLED',
      startedOn: new Date(Date.UTC(2026, 0, 1)),
      closedOn: new Date(Date.UTC(2026, 0, 8)),
    });
    assert.deepEqual(durationOf(cancelled, CONTROL), { days: 7, closed: false });
    const report = cycles(
      [cancelled, row({ code: 'PD-D', status: 'COMPLETED', closedOn: new Date(Date.UTC(2026, 3, 10)) })],
      CONTROL,
    );
    assert.equal(report.overall.events, 1);
    assert.equal(report.overall.observations, 2);
    assert.equal(report.cancelled, 1);
  });

  it('ряд по месяцам доходит до текущего месяца', () => {
    const points = byMonth([row({ code: 'PD-1', startedOn: new Date(Date.UTC(2026, 2, 5)) })], CONTROL);
    assert.equal(points[0]?.key, '2026-03');
    assert.equal(points.at(-1)?.key, '2026-09');
    assert.equal(points.length, 7);
    assert.ok(points.slice(1).every((point) => point.orders === 0));
  });
});

describe('деньги строкой в перечне «Ведутся сейчас»', () => {
  it('работа без договора — «договор не заведён», а не «оплачено полностью»', () => {
    assert.equal(workMoneyNote(null), 'договор не заведён');
  });

  it('остаток, закрытый списанием, назван списанием', () => {
    const note = spaces(workMoneyNote({ contracted: 10_000_000n, outstanding: 0n, writtenOff: 4_000_000n }));
    assert.match(note, /закрыто, из них списано 40 000 ₽$/u);
    assert.doesNotMatch(note, /оплачено полностью/u);
  });

  it('неоплаченный остаток и полная оплата', () => {
    assert.match(
      spaces(workMoneyNote({ contracted: 10_000_000n, outstanding: 6_000_000n, writtenOff: 0n })),
      /^100 000 ₽ по договору · 60 000 ₽ не оплачено$/u,
    );
    assert.match(
      workMoneyNote({ contracted: 10_000_000n, outstanding: 0n, writtenOff: 0n }),
      /оплачено полностью$/u,
    );
  });
});
