/**
 * Расчёты аналитики. Проверяются на построенных вручную наборах, где
 * верный ответ известен заранее: витрина, сверенная сама с собой, ничего
 * не доказывает.
 *
 * Отдельного внимания стоит Каплан — Мейер: его смысл в том, что
 * незавершённые работы не выбрасываются, а цензурируют кривую. Проверка
 * ловит именно это — на наборе, где среднее по закрытым работам дало бы
 * заметно меньший срок.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  byMonth,
  clients,
  conclusions,
  cycleMedian,
  cycles,
  durationOf,
  losses,
  mean,
  median,
  openBalance,
  overview,
  products,
  quantile,
  receivables,
  receivedBetween,
  seasonalNorm,
  stdev,
  verdict,
  type ProjectRow,
} from '../src/lib/cabinet/analytics/metrics.ts';
import {
  SERIES_COLORS,
  compactMoney,
  compactNumber,
  donutArc,
  niceCeil,
  seriesColor,
  seriesInkDark,
  smoothPath,
  ticks,
  topRoundedBar,
} from '../src/lib/cabinet/charts.ts';

const CONTROL = new Date(Date.UTC(2026, 8, 16));

function row(over: Partial<ProjectRow> & { code: string }): ProjectRow {
  return {
    id: over.code,
    title: 'Работа',
    clientId: 'c1',
    clientName: 'Иванов И. И.',
    typeCode: 'dissertation',
    typeName: 'Диссертация',
    status: 'COMPLETED',
    startedOn: new Date(Date.UTC(2025, 0, 10)),
    dueOn: null,
    closedOn: new Date(Date.UTC(2025, 3, 10)),
    cost: 10_000_000n,
    paid: 10_000_000n,
    ...over,
    writtenOff: over.writtenOff ?? 0n,
    payments: over.payments ?? [],
    code: over.code,
  };
}

describe('описательная статистика', () => {
  it('медиана чётного и нечётного набора', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), 0);
  });

  it('стандартное отклонение считается по выборке, а не по совокупности', () => {
    // Делитель n−1: для [2,4,4,4,5,5,7,9] выборочное — 2.138, а не 2.
    assert.ok(Math.abs(stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.13809) < 1e-4);
    assert.equal(stdev([5]), 0);
  });

  it('квантиль интерполируется линейно', () => {
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([10], 0.9), 10);
  });

  it('среднее пустого набора — ноль, а не NaN', () => {
    assert.equal(mean([]), 0);
  });
});

describe('срок исполнения по Каплану — Мейеру', () => {
  it('незавершённые наблюдения цензурируют кривую, а не выбрасываются', () => {
    // Четыре работы закрыты рано, четыре идут дольше и не закончены.
    const items = [
      { days: 10, closed: true },
      { days: 20, closed: true },
      { days: 200, closed: false },
      { days: 210, closed: false },
      { days: 220, closed: false },
      { days: 230, closed: false },
    ];
    const estimate = cycleMedian(items);
    // Среднее по закрытым дало бы 15 дней. Доля доживших после двух событий
    // равна 4/6 — до половины кривая не опускается, и медианы нет.
    assert.equal(estimate.median, null);
    assert.equal(estimate.lower, 230);
    assert.equal(estimate.observations, 6);
    assert.equal(estimate.events, 2);
  });

  it('медиана находится, когда кривая опускается до половины', () => {
    const estimate = cycleMedian([
      { days: 10, closed: true },
      { days: 20, closed: true },
      { days: 30, closed: true },
      { days: 40, closed: true },
    ]);
    assert.equal(estimate.median, 20);
    assert.equal(estimate.events, 4);
  });

  it('пустой набор не ломает расчёт', () => {
    assert.deepEqual(cycleMedian([]), {
      median: null,
      lower: null,
      observations: 0,
      events: 0,
    });
  });

  it('незакрытая работа меряется до контрольной даты', () => {
    const active = row({
      code: 'PD-1',
      status: 'ACTIVE',
      startedOn: new Date(Date.UTC(2026, 7, 17)),
      closedOn: null,
    });
    const duration = durationOf(active, CONTROL);
    assert.deepEqual(duration, { days: 30, closed: false });
  });

  it('работа без даты заказа в расчёт срока не попадает', () => {
    assert.equal(durationOf(row({ code: 'PD-2', startedOn: null }), CONTROL), null);
  });
});

describe('обзор', () => {
  const rows = [
    row({ code: 'PD-1', cost: 15_000_000n, paid: 15_000_000n }),
    row({ code: 'PD-2', cost: 9_000_000n, paid: 4_000_000n, status: 'ACTIVE' }),
    row({ code: 'PD-3', cost: 2_500_000n, paid: 3_000_000n, clientId: 'c2', clientName: 'Петрова А.' }),
  ];

  it('суммы и число клиентов', () => {
    const report = overview(rows);
    assert.equal(report.projects, 3);
    assert.equal(report.clients, 2);
    assert.equal(report.contracted, 26_500_000n);
    assert.equal(report.received, 22_000_000n);
  });

  it('переплата по одному договору не погашает долг по другому', () => {
    // PD-2 недоплачен на 50 000 ₽, PD-3 переплачен на 5 000 ₽.
    // Задолженность — 50 000 ₽, а не 45 000 ₽.
    assert.equal(overview(rows).outstanding, 5_000_000n);
  });

  it('собираемость считается по завершённым работам', () => {
    // Завершены PD-1 (15 000 из 15 000) и PD-3 (30 000 из 25 000).
    const report = overview(rows);
    assert.ok(report.collection > 1);
  });

  it('пустая выборка не делит на ноль', () => {
    const report = overview([]);
    assert.equal(report.averageCheck, 0n);
    assert.equal(report.collection, 0);
    assert.equal(report.period.from, null);
  });
});

describe('помесячный ряд', () => {
  it('месяц без заказов входит нулём, а не пропуском', () => {
    const points = byMonth([
      row({ code: 'PD-1', startedOn: new Date(Date.UTC(2025, 0, 5)) }),
      row({ code: 'PD-2', startedOn: new Date(Date.UTC(2025, 2, 5)) }),
    ]);
    assert.deepEqual(
      points.map((point) => point.key),
      ['2025-01', '2025-02', '2025-03'],
    );
    assert.equal(points[1]?.orders, 0);
    assert.equal(points[1]?.contracted, 0n);
  });

  it('ряд переходит через границу года', () => {
    const points = byMonth([
      row({ code: 'PD-1', startedOn: new Date(Date.UTC(2024, 10, 5)) }),
      row({ code: 'PD-2', startedOn: new Date(Date.UTC(2025, 1, 5)) }),
    ]);
    assert.deepEqual(
      points.map((point) => point.key),
      ['2024-11', '2024-12', '2025-01', '2025-02'],
    );
  });
});

describe('сезонная норма', () => {
  it('знаменатель — наблюдавшиеся месяцы, а не календарные годы', () => {
    // История с ноября 2025 по сентябрь 2026. Январь наблюдался один раз
    // (2026), ноябрь — один раз (2025), декабрь — один раз.
    const rows = [
      row({ code: 'PD-1', startedOn: new Date(Date.UTC(2025, 10, 3)) }),
      row({ code: 'PD-2', startedOn: new Date(Date.UTC(2026, 0, 9)) }),
      row({ code: 'PD-3', startedOn: new Date(Date.UTC(2026, 0, 20)) }),
    ];
    const season = seasonalNorm(rows, CONTROL);
    const january = season.find((month) => month.month === 1)!;
    assert.equal(january.orders, 2);
    assert.equal(january.yearsObserved, 1);
    assert.equal(january.norm, 2);

    // Октябрь не наблюдался ни разу: до начала истории и после контроля.
    const october = season.find((month) => month.month === 10)!;
    assert.equal(october.orders, 0);
    assert.equal(october.norm, 0);
  });

  it('все двенадцать месяцев присутствуют в ряду', () => {
    assert.equal(seasonalNorm([row({ code: 'PD-1' })], CONTROL).length, 12);
  });
});

describe('дебиторка', () => {
  it('в перечень попадают только незакрытые остатки, крупные сверху', () => {
    const list = receivables(
      [
        row({ code: 'PD-1', cost: 10_000_000n, paid: 10_000_000n }),
        row({ code: 'PD-2', cost: 20_000_000n, paid: 5_000_000n, status: 'ACTIVE' }),
        row({ code: 'PD-3', cost: 8_000_000n, paid: 6_000_000n, status: 'PAUSED' }),
      ],
      CONTROL,
    );
    assert.deepEqual(
      list.map((item) => [item.code, item.debt]),
      [
        ['PD-2', 15_000_000n],
        ['PD-3', 2_000_000n],
      ],
    );
  });

  it('просрочка считается от срока, а не от даты заказа', () => {
    const list = receivables(
      [
        row({
          code: 'PD-1',
          cost: 10_000_000n,
          paid: 0n,
          status: 'ACTIVE',
          dueOn: new Date(Date.UTC(2026, 8, 6)),
        }),
      ],
      CONTROL,
    );
    assert.equal(list[0]?.overdueDays, 10);
  });
});

describe('клиенты', () => {
  const rows = [
    row({ code: 'PD-1', clientId: 'a', clientName: 'Первый', cost: 30_000_000n, startedOn: new Date(Date.UTC(2026, 7, 1)) }),
    row({ code: 'PD-2', clientId: 'a', clientName: 'Первый', cost: 20_000_000n, startedOn: new Date(Date.UTC(2026, 8, 1)) }),
    row({ code: 'PD-3', clientId: 'b', clientName: 'Второй', cost: 10_000_000n, startedOn: new Date(Date.UTC(2026, 8, 5)) }),
    row({ code: 'PD-4', clientId: 'c', clientName: 'Третий', cost: 40_000_000n, startedOn: new Date(Date.UTC(2024, 1, 5)) }),
    row({ code: 'PD-5', clientId: 'd', clientName: 'Четвёртый', cost: 1_000_000n, startedOn: new Date(Date.UTC(2024, 1, 5)) }),
  ];

  it('LTV складывается по всем заказам клиента', () => {
    const report = clients(rows, CONTROL);
    assert.equal(report.clients[0]?.name, 'Первый');
    assert.equal(report.clients[0]?.ltv, 50_000_000n);
    assert.equal(report.clients[0]?.orders, 2);
  });

  it('повторные считаются по числу заказов, а не по сумме', () => {
    const report = clients(rows, CONTROL);
    assert.equal(report.repeat, 1);
    assert.equal(report.repeatShare, 0.25);
  });

  it('сегменты различают недавних и спящих', () => {
    const report = clients(rows, CONTROL);
    const byName = new Map(report.clients.map((client) => [client.name, client.segment]));
    assert.equal(byName.get('Первый'), 'CORE');
    assert.equal(byName.get('Второй'), 'ACTIVE');
    // «Третий» давно не заказывал, но его LTV выше медианы.
    assert.equal(byName.get('Третий'), 'DORMANT_VALUABLE');
    assert.equal(byName.get('Четвёртый'), 'DORMANT_ONCE');
  });

  it('концентрация считается по пяти крупнейшим', () => {
    const report = clients(rows, CONTROL);
    // Клиентов ровно четыре — доля пяти крупнейших равна единице.
    assert.equal(report.top5Share, 1);
    assert.equal(report.clients.length, 4);
  });
});

describe('продукты', () => {
  it('разброс чека выше 40 % помечает позицию как требующую прайса', () => {
    const list = products([
      row({ code: 'PD-1', typeCode: 'article', typeName: 'Статьи', cost: 1_000_000n }),
      row({ code: 'PD-2', typeCode: 'article', typeName: 'Статьи', cost: 9_000_000n }),
      row({ code: 'PD-3', typeCode: 'diploma', typeName: 'Дипломы', cost: 5_000_000n }),
      row({ code: 'PD-4', typeCode: 'diploma', typeName: 'Дипломы', cost: 5_100_000n }),
    ]);
    const article = list.find((item) => item.typeCode === 'article')!;
    const diploma = list.find((item) => item.typeCode === 'diploma')!;
    assert.equal(article.needsPriceList, true);
    assert.equal(diploma.needsPriceList, false);
    assert.equal(article.averageCheck, 5_000_000n);
    assert.equal(article.min, 1_000_000n);
    assert.equal(article.max, 9_000_000n);
  });

  it('позиции упорядочены по сумме', () => {
    const list = products([
      row({ code: 'PD-1', typeCode: 'small', typeName: 'Малая', cost: 1_000_000n }),
      row({ code: 'PD-2', typeCode: 'big', typeName: 'Большая', cost: 50_000_000n }),
    ]);
    assert.equal(list[0]?.typeCode, 'big');
  });
});

describe('сроки', () => {
  it('в срок считается только по завершённым с заданным сроком', () => {
    const report = cycles(
      [
        row({
          code: 'PD-1',
          dueOn: new Date(Date.UTC(2025, 3, 20)),
          closedOn: new Date(Date.UTC(2025, 3, 10)),
        }),
        row({
          code: 'PD-2',
          dueOn: new Date(Date.UTC(2025, 3, 1)),
          closedOn: new Date(Date.UTC(2025, 3, 10)),
        }),
        row({ code: 'PD-3', dueOn: null }),
      ],
      CONTROL,
    );
    assert.equal(report.withDue, 2);
    assert.equal(report.onTime, 1);
  });

  it('просроченными считаются только незакрытые работы', () => {
    const report = cycles(
      [
        row({ code: 'PD-1', status: 'ACTIVE', dueOn: new Date(Date.UTC(2026, 0, 1)), closedOn: null }),
        row({ code: 'PD-2', status: 'COMPLETED', dueOn: new Date(Date.UTC(2026, 0, 1)) }),
      ],
      CONTROL,
    );
    assert.equal(report.overdueOpen, 1);
  });
});

describe('потери', () => {
  it('считаются как недополученное по остановленным работам', () => {
    const report = losses([
      row({ code: 'PD-1', status: 'PAUSED', cost: 15_000_000n, paid: 5_000_000n }),
      row({ code: 'PD-2', status: 'CANCELLED', cost: 5_000_000n, paid: 2_500_000n }),
      row({ code: 'PD-3', status: 'ACTIVE', cost: 10_000_000n, paid: 0n }),
      row({ code: 'PD-4', status: 'PAUSED', cost: 3_000_000n, paid: 3_000_000n }),
    ]);
    // 100 000 ₽ и 25 000 ₽. Действующая работа и оплаченная остановленная — не потери.
    assert.equal(report.total, 12_500_000n);
    assert.equal(report.rows.length, 2);
    assert.equal(report.rows[0]?.code, 'PD-1');
  });
});

describe('выводы обзора', () => {
  it('на пустой выборке выводов нет', () => {
    assert.deepEqual(conclusions([], CONTROL), []);
  });

  it('выводов не больше пяти, каждый называет величину и несёт действие', () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row({
        code: `PD-${index}`,
        clientId: `c${index}`,
        clientName: `Клиент ${index}`,
        cost: BigInt((index + 1) * 1_000_000),
        startedOn: new Date(Date.UTC(2025, index % 12, 5)),
      }),
    );
    const list = conclusions(rows, CONTROL);
    assert.ok(list.length > 0 && list.length <= 5);
    for (const item of list) {
      assert.ok(item.title.length > 0);
      assert.match(item.text, /\d/u, `вывод «${item.title}» не называет ни одной величины`);
      // Вывод без действия остаётся наблюдением: требование заказчика —
      // рекомендация, срок и область (решение Р-194).
      assert.ok(item.action.length > 0, `вывод «${item.title}» не говорит, что делать`);
      assert.ok(item.term.length > 0, `вывод «${item.title}» не называет срока`);
      assert.ok(item.area.length > 0, `вывод «${item.title}» не назван областью`);
      assert.ok(
        ['sure', 'likely', 'risky'].includes(item.confidence),
        `вывод «${item.title}» не называет уверенности`,
      );
    }
  });

  it('выводы идут от крупного считаемого эффекта к несчитаемому', () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      row({
        code: `PD-${index}`,
        clientId: `c${index % 6}`,
        clientName: `Клиент ${index % 6}`,
        cost: BigInt((index + 1) * 1_000_000),
        paid: BigInt(index * 500_000),
        startedOn: new Date(Date.UTC(2024, index % 12, 5)),
        dueOn: new Date(Date.UTC(2025, index % 12, 5)),
      }),
    );
    const list = conclusions(rows, CONTROL);
    const effects = list.map((item) => item.effect);
    const counted = effects.filter((effect) => effect !== null) as bigint[];
    // Считаемые эффекты идут по убыванию и все стоят выше несчитаемых.
    for (let i = 1; i < counted.length; i += 1) {
      assert.ok(counted[i - 1]! >= counted[i]!, 'эффекты идут не по убыванию');
    }
    const firstNull = effects.indexOf(null);
    if (firstNull !== -1) {
      assert.ok(
        effects.slice(firstNull).every((effect) => effect === null),
        'вывод со считаемым эффектом оказался ниже вывода без него',
      );
    }
  });
});

describe('шкала рядов', () => {
  /**
   * Шкала и набор светлых ступеней живут порознь: цвета в `SERIES_COLORS`,
   * а знание о том, на каких из них подпись обязана быть тёмной, — в
   * `seriesInkDark`. Пока это знание было записано числом («каждая
   * третья»), оно молча разошлось бы со шкалой при первом же её
   * изменении, и подпись на светлой заливке стала бы белой по белому
   * (решение Р-176).
   */
  it('ступеней шесть и все различны', () => {
    assert.equal(SERIES_COLORS.length, 6);
    assert.equal(new Set(SERIES_COLORS).size, 6);
  });

  it('цвет повторяется только за пределами шкалы', () => {
    assert.equal(seriesColor(0), seriesColor(6));
    assert.notEqual(seriesColor(0), seriesColor(4));
  });

  it('тёмная подпись стоит на светлых ступенях', () => {
    // Светлые — третья, четвёртая и шестая: два бледных синих и бледный
    // нейтральный. На них белый текст не читается.
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5].map((index) => seriesInkDark(index)),
      [false, false, true, true, false, true],
    );
    assert.equal(seriesInkDark(8), seriesInkDark(2));
  });
});

describe('геометрия графиков', () => {
  it('потолок шкалы округляется до читаемого', () => {
    assert.equal(niceCeil(37_428), 50_000);
    assert.equal(niceCeil(1), 1);
    assert.equal(niceCeil(2.3), 2.5);
    assert.equal(niceCeil(0), 1);
  });

  it('деления идут сверху вниз и включают ноль', () => {
    assert.deepEqual(ticks(100, 4), [100, 75, 50, 25, 0]);
  });

  it('столбец нулевой высоты не рисуется', () => {
    assert.equal(topRoundedBar(0, 0, 10, 0), '');
    assert.match(topRoundedBar(0, 10, 20, 30), /^M0 40 L0 /u);
  });

  it('сглаживание вырождается в ломаную на двух точках', () => {
    assert.equal(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }]), 'M0 0 L10 5');
    assert.equal(smoothPath([]), '');
    assert.match(
      smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]),
      /^M0 0C/u,
    );
  });

  it('дуга кольца замыкается', () => {
    assert.match(donutArc(50, 50, 40, 26, -Math.PI / 2, 0), /Z$/u);
  });

  it('краткая запись суммы читаема', () => {
    // До десяти миллионов — два знака, дальше один: иначе подпись над
    // столбцом шире самого столбца.
    assert.equal(compactMoney(542_500_000n), '5,42 млн');
    assert.equal(compactMoney(1_050_000_000n), '10,5 млн');
    assert.equal(compactMoney(100_000_000n), '1 млн');
    assert.equal(compactMoney(4_000_000n), '40 тыс');
    assert.equal(compactMoney(50_000n), '500');
    // Разделитель разрядов у ru-RU — неразрывный пробел, и это важно:
    // подпись «1 234,6» не должна разрываться по середине числа.
    assert.equal(compactNumber(1234.56, 1), '1\u00A0234,6');
  });
});

describe('итог практики одним абзацем', () => {
  it('на пустом наборе итога нет', () => {
    // Фраза «в работе 0 работ из 0» хуже молчания: она занимает место и
    // ничего не сообщает.
    assert.equal(verdict([], CONTROL), null);
  });

  it('состояние называет число работ и деньги', () => {
    const digest = verdict(
      [
        row({ code: 'a', status: 'ACTIVE', closedOn: null, cost: 30_000_000n, paid: 10_000_000n }),
        row({ code: 'b', cost: 20_000_000n, paid: 20_000_000n }),
      ],
      CONTROL,
    );
    assert.ok(digest !== null);
    assert.match(digest.state, /В работе 1 работа из 2/u);
    // Получено 300 000 ₽ из 500 000 ₽, остаток 200 000 ₽ — по каждой
    // работе отдельно, переплата одной долг другой не гасит. Разделитель
    // разрядов у ru-RU — неразрывный пробел.
    assert.match(digest.state, /300\u00A0000 ₽/u);
    assert.match(digest.state, /500\u00A0000 ₽/u);
    assert.match(digest.state, /200\u00A0000 ₽/u);
  });

  it('у практики без долгов и срывов риска нет', () => {
    const digest = verdict([row({ code: 'a' })], CONTROL);
    assert.ok(digest !== null);
    assert.equal(digest.risk, null);
  });

  it('риск собирает просроченный остаток и сорванные сроки', () => {
    const late = new Date(Date.UTC(2026, 6, 1));
    const digest = verdict(
      [
        // Работа закрыта, срок прошёл, остаток не получен — это долг.
        row({ code: 'a', dueOn: late, cost: 10_000_000n, paid: 4_000_000n }),
        // Работа идёт, срок в прошлом — это сорванный срок.
        row({ code: 'b', status: 'ACTIVE', closedOn: null, dueOn: late }),
      ],
      CONTROL,
    );
    assert.ok(digest !== null);
    assert.ok(digest.risk !== null);
    assert.match(digest.risk, /60\u00A0000 ₽/u);
    assert.match(digest.risk, /со сроком в прошлом/u);
  });

  it('первым делом стоит старший вывод', () => {
    const digest = verdict(
      [row({ code: 'a', dueOn: new Date(Date.UTC(2026, 6, 1)), cost: 10_000_000n, paid: 0n })],
      CONTROL,
    );
    assert.ok(digest !== null);
    assert.ok(digest.first !== null);
    // Вывод несёт действие, а не наблюдение: после двоеточия стоит, что
    // делать (решение Р-194).
    assert.match(digest.first, /:\s+\S/u);
  });
});

describe('деньги сходятся с экраном финансов', () => {
  // Решение Р-236: списанное — не долг; просрочка — с полных суток после
  // срока; «получено за период» — по дате поступления.
  it('списанное не считается ни долгом, ни просрочкой', () => {
    const written = row({
      code: 'PD-2026-900',
      cost: 10_000_000n,
      paid: 4_000_000n,
      writtenOff: 6_000_000n,
      dueOn: new Date(Date.UTC(2026, 5, 1)),
    });
    assert.equal(openBalance(written), 0n);
    assert.equal(overview([written]).outstanding, 0n);
    assert.equal(receivables([written], CONTROL).length, 0);
  });

  it('в день срока работа ещё не просрочена', () => {
    const due = row({ code: 'PD-2026-901', paid: 0n, dueOn: CONTROL });
    const noon = new Date(CONTROL.getTime() + 15 * 60 * 60 * 1000);
    assert.equal(receivables([due], noon)[0]?.overdueDays, 0);
    const nextDay = new Date(CONTROL.getTime() + 25 * 60 * 60 * 1000);
    assert.equal(receivables([due], nextDay)[0]?.overdueDays, 1);
  });

  it('получено за период — по дате поступления, а не по датам работы', () => {
    const old = row({
      code: 'PD-2024-001',
      startedOn: new Date(Date.UTC(2024, 2, 1)),
      closedOn: new Date(Date.UTC(2026, 8, 10)),
      payments: [{ amount: 30_000_000n, on: new Date(Date.UTC(2024, 5, 1)) }],
    });
    const fresh = row({
      code: 'PD-2026-002',
      status: 'ACTIVE',
      startedOn: new Date(Date.UTC(2026, 0, 15)),
      closedOn: null,
      payments: [{ amount: 20_000_000n, on: new Date(Date.UTC(2026, 8, 10)) }],
    });
    const from = new Date(CONTROL.getTime() - 30 * 86_400_000);
    assert.equal(receivedBetween([old, fresh], from, CONTROL), 20_000_000n);
  });
});
