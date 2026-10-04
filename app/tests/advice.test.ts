/**
 * «Цена и пакеты» и «Возврат клиентов» (требование РК-17, решение Р-350):
 * цена «гуляет» — разброс выше 40 % при трёх и более заказах — фиксируется
 * по медиане до окна вида; клиент молчит дольше полугода без действующих
 * работ; «следующая работа» — только при пяти и более переходах от вида.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_TRANSITIONS, priceAdvice, returnAdvice, transitions } from '../src/lib/cabinet/analytics/advice.ts';
import type { CalendarRow } from '../src/lib/cabinet/analytics/calendar.ts';
import type { ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';

const AT = new Date('2026-10-05T09:00:00Z');
const DAY = 86_400_000;
let seq = 0;
const row = (over: Partial<ProjectRow>): ProjectRow =>
  ({
    id: `r${++seq}`,
    code: `PD-A-${seq}`,
    title: 'Работа',
    clientId: 'c0',
    clientName: 'Клиент',
    typeCode: 'article',
    typeName: 'Научные публикации',
    status: 'COMPLETED',
    startedOn: new Date(AT.getTime() - 400 * DAY),
    dueOn: null,
    closedOn: null,
    signedOn: null,
    cost: 0n,
    paid: 0n,
    writtenOff: 0n,
    payments: [],
    ...over,
  }) as ProjectRow;

describe('цена и пакеты (РК-17)', () => {
  const rows = [
    row({ cost: 2_000_000n }),
    row({ cost: 10_000_000n }),
    row({ cost: 6_000_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 5_000_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 5_200_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 4_800_000n }),
  ];
  const window = new Date('2026-11-01T00:00:00Z');
  const calendar = [{ typeCode: 'article', windowStart: window } as CalendarRow];

  it('разброс выше 40 % — зафиксировать по медиане до окна вида; ровная цена — без рекомендации', () => {
    const advice = priceAdvice(rows, calendar, AT);
    assert.deepEqual(advice.map((item) => item.typeCode), ['article']);
    assert.equal(advice[0]!.medianCheck, 6_000_000n);
    assert.equal(advice[0]!.before?.toISOString().slice(0, 10), '2026-11-01');
    assert.equal(advice[0]!.key, 'price:article:2026-11-01');
    assert.ok(advice[0]!.variation > 0.4);
  });

  it('без окна вида — ключ по году', () => {
    assert.equal(priceAdvice(rows, [], AT)[0]!.key, 'price:article:2026');
  });
});

describe('возврат клиентов (РК-17)', () => {
  // Пять клиентов прошли путь «публикация → ВКР»: переходов от публикаций — пять.
  const history = Array.from({ length: MIN_TRANSITIONS }, (_, index) => [
    row({ clientId: `h${index}`, clientName: `История ${index}`, startedOn: new Date(AT.getTime() - 500 * DAY) }),
    row({ clientId: `h${index}`, clientName: `История ${index}`, typeCode: 'diploma', typeName: 'ВКР', startedOn: new Date(AT.getTime() - 300 * DAY) }),
  ]).flat();

  it('переходы считаются по последовательным заказам клиента', () => {
    const paths = transitions(history);
    assert.deepEqual(paths.get('article')?.map((path) => [path.to, path.count, path.total]), [['diploma', 5, 5]]);
  });

  it('молчит дольше полугода — в перечне; «следующая работа» — при пяти переходах', () => {
    const silent = row({ clientId: 's1', clientName: 'Молчит', startedOn: new Date(AT.getTime() - 200 * DAY) });
    const fresh = row({ clientId: 's2', clientName: 'Недавний', startedOn: new Date(AT.getTime() - 100 * DAY) });
    const live = row({ clientId: 's3', clientName: 'Идёт работа', status: 'ACTIVE', startedOn: new Date(AT.getTime() - 400 * DAY) });
    const advice = returnAdvice([...history, silent, fresh, live], AT);
    const item = advice.find((entry) => entry.clientId === 's1');
    assert.ok(item !== undefined);
    assert.equal(item.next?.to, 'diploma');
    assert.equal(item.key, `return:s1:${silent.startedOn!.toISOString().slice(0, 10)}`);
    assert.ok(!advice.some((entry) => entry.clientId === 's2'), 'недавний клиент в перечне');
    assert.ok(!advice.some((entry) => entry.clientId === 's3'), 'клиент с действующей работой в перечне');
  });

  it('меньше пяти переходов — подсказки нет', () => {
    const few = history.slice(0, 4 * 2);
    const silent = row({ clientId: 's1', clientName: 'Молчит', startedOn: new Date(AT.getTime() - 200 * DAY) });
    const item = returnAdvice([...few, silent], AT).find((entry) => entry.clientId === 's1');
    assert.equal(item?.next, null);
  });
});
