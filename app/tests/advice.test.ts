/**
 * «Цена и пакеты» и «Возврат клиентов» (требование РК-17, решение Р-350):
 * разброс чека выше 40 % при трёх и более заказах — повод проверить,
 * объясняется ли он темой и сложностью работ; медиана и диапазон —
 * ориентир для Задания, а не цена (П-9, Р-765; расчёт и ключи прежние —
 * Р-350, Р-656); клиент молчит дольше полугода без действующих работ;
 * «следующая работа» — только при пяти и более переходах от вида.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MIN_TRANSITIONS, priceAdvice, returnAdvice, transitions } from '../src/lib/cabinet/analytics/advice.ts';
import type { CalendarRow } from '../src/lib/cabinet/analytics/calendar.ts';
import { conclusions, type ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';
import {
  PRICE_GUIDE,
  PRICE_GUIDE_NO_SUMS,
  byOrders,
  priceGuide,
  priceMonth,
  priceSpread,
  spreadPercent,
} from '../src/lib/cabinet/analytics/price-guide.ts';
import { practiceReview } from '../src/lib/cabinet/practice-review.ts';
import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const source = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

/**
 * «Зафиксировать» применительно к цене (П-9): «зафиксир…» и цена,
 * медиана или прайс в одной фразе — в любом порядке.
 */
const FIX_PRICE = /зафиксир[^.!?\n]*(?:цен|медиан|прайс)|(?:цен|медиан|прайс)[^.!?\n]*зафиксир/iu;

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
  const calendar = [{ typeCode: 'article', windowStart: window, deliveryOn: new Date('2026-12-15T00:00:00Z') } as CalendarRow];

  it('разброс выше 40 % — рекомендация с медианой и окном вида; ровная цена — без рекомендации', () => {
    const advice = priceAdvice(rows, calendar, AT);
    assert.deepEqual(advice.map((item) => item.typeCode), ['article']);
    assert.equal(advice[0]!.medianCheck, 6_000_000n);
    assert.equal(advice[0]!.before?.toISOString().slice(0, 10), '2026-11-01');
    assert.equal(advice[0]!.key, 'price:article:2026-12');
    assert.equal(advice[0]!.legacyKey, 'price:article:2026-11-01');
    assert.ok(advice[0]!.variation > 0.4);
  });

  it('без окна вида — ключ по году', () => {
    assert.equal(priceAdvice(rows, [], AT)[0]!.key, 'price:article:2026');
    assert.equal(priceAdvice(rows, [], AT)[0]!.legacyKey, null);
  });

  it('ключ — сезон: сдвиг окна при том же месяце сдачи отметку не теряет (Р-656)', () => {
    // Новый заказ вида сдвинул медиану: окно начинается 04.11, а не 01.11.
    const moved = [{ typeCode: 'article', windowStart: new Date('2026-11-04T00:00:00Z'), deliveryOn: new Date('2026-12-15T00:00:00Z') } as CalendarRow];
    assert.equal(priceAdvice(rows, moved, AT)[0]!.key, 'price:article:2026-12');
    assert.equal(priceAdvice(rows, moved, AT)[0]!.key, priceAdvice(rows, calendar, AT)[0]!.key);
  });
});

describe('«Цена и пакеты» — ориентир для Задания, а не цена (П-9, Р-765)', () => {
  const rows = [
    row({ cost: 2_000_000n }),
    row({ cost: 10_000_000n }),
    row({ cost: 6_000_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 5_000_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 5_200_000n }),
    row({ typeCode: 'diploma', typeName: 'ВКР', cost: 4_800_000n }),
  ];
  const advice = priceAdvice(rows, [], AT)[0]!;
  const pct = spreadPercent(advice.variation);
  // Суммы пишутся с неразрывными пробелами разрядов: карточка — узким
  // (`formatAmount`), выводы отчёта — обычным неразрывным.
  const plain = (text: string) => text.replace(/[\u00a0\u202f]/gu, ' ');
  const report = conclusions(rows, AT);
  const texts = [
    priceSpread(advice),
    priceGuide(advice),
    ...Object.values(priceMonth(advice)),
    ...report.flatMap((entry) => [entry.title, entry.text, entry.action]),
  ];
  // Два вида с разбросом: числа по каждому, что проверить и чем служат
  // медиана и диапазон — один раз.
  const two = conclusions(
    [...rows, row({ typeCode: 'nir', typeName: 'НИР', cost: 1_000_000n }), row({ typeCode: 'nir', typeName: 'НИР', cost: 9_000_000n }), row({ typeCode: 'nir', typeName: 'НИР', cost: 3_000_000n })],
    AT,
  ).find((entry) => entry.next.href === '/cabinet/manage/recommendations#price');

  it('карточка: разброс по числу заказов и что проверить; медиана и диапазон — ориентир', () => {
    assert.ok(pct > 40);
    assert.equal(
      priceSpread(advice),
      `Разброс чека «Научные публикации» — ${pct} % по 3 заказам: проверьте, объясняется ли он темой и сложностью работ`,
    );
    assert.equal(plain(priceGuide(advice)), 'Медиана 60 000 ₽, диапазон 20 000 ₽ — 100 000 ₽ — ориентир для Задания, а не цена');
    assert.equal(plain(priceGuide({ ...advice, min: null })), 'Медиана 60 000 ₽ — ориентир для Задания, а не цена');
    const page = source('app', 'cabinet', 'manage', 'recommendations', 'page.tsx');
    assert.match(page, /title=\{priceSpread\(row\)\}/u);
    assert.match(page, /details=\{`\$\{priceGuide\(row\)\}/u);
  });

  it('число заказов согласовано: «по 21 заказу», «по 11 заказам»', () => {
    assert.deepEqual(
      [3, 4, 5, 11, 21, 101, 111].map(byOrders),
      ['по 3 заказам', 'по 4 заказам', 'по 5 заказам', 'по 11 заказам', 'по 21 заказу', 'по 101 заказу', 'по 111 заказам'],
    );
  });

  it('рекомендация месяца и письмо HEAD_MONTHLY — та же формулировка без сумм', () => {
    const month = priceMonth(advice);
    assert.equal(month.title, priceSpread(advice));
    assert.equal(month.note, PRICE_GUIDE_NO_SUMS);
    assert.equal(month.note, 'Медиана и диапазон — ориентир для Задания, а не цена');
    assert.doesNotMatch(`${month.title} ${month.note}`, /₽/u, 'сумма в рекомендации месяца');
    // «Сводка»: вторая фраза — в пометке под строкой.
    const [, , chance] = practiceReview({
      act: [],
      watch: [],
      chance: { count: 1, month: { ...month, href: '/cabinet/manage/recommendations#price' } },
    });
    assert.equal(chance!.first!.title, month.title);
    assert.equal(chance!.first!.note, 'рекомендация месяца · медиана и диапазон — ориентир для Задания, а не цена');
    // Строка «Сводки» не обрывается на «проверьте, …» и при самом длинном
    // названии вида из справочника.
    const longest = priceSpread({ typeName: 'Сопровождение поступления и обучения в аспирантуре', variation: 1.25, orders: 111 });
    assert.ok(longest.length <= 160, `строка рекомендации месяца — ${longest.length} знаков`);
    assert.match(source('app', 'cabinet', 'manage', 'page.tsx'), /clip\(group\.first\.title, group\.key === 'chance' \? 160 : 90\)/u);
    // Письмо ставит вторую фразу после первой.
    assert.match(
      source('lib', 'cabinet', 'head-digest.ts'),
      /`Рекомендация месяца: \$\{advice\.month\.title\}\$\{advice\.month\.note === undefined \? '' : `\. \$\{advice\.month\.note\}`\}\.\\n`/u,
    );
  });

  it('«Что делать» отчёта — та же формулировка по виду, без оценки выравнивания к медиане', () => {
    const item = report.find((entry) => entry.next.href === '/cabinet/manage/recommendations#price');
    assert.ok(item !== undefined, 'вывода о разбросе чека нет');
    assert.equal(item.title, 'Проверить разброс чека по видам работ');
    assert.equal(
      plain(item.text),
      `Разброс чека «Научные публикации» — ${pct} % по 3 заказам, медиана 60 000 ₽, диапазон 20 000 ₽ — 100 000 ₽. ` +
        `Медиана и диапазон — ${PRICE_GUIDE}.`,
    );
    assert.match(item.action, /^Проверить по каждому виду, объясняется ли разброс темой и сложностью работ\./u);
    assert.doesNotMatch(item.text, /ВКР/u, 'вид с ровным чеком в выводе');
    assert.ok(two !== undefined);
    assert.equal(plain(two.text).match(/Разброс чека «/gu)?.length, 2);
    assert.equal(plain(two.text).match(/ориентир для Задания, а не цена/gu)?.length, 1);
    assert.match(plain(two.text), /«НИР» — \d+ % по 3 заказам, медиана 30 000 ₽, диапазон 10 000 ₽ — 90 000 ₽\./u);
    assert.equal(item.effect, null, 'оценка выравнивания цены к медиане');
  });

  it('в текстах рекомендаций нет «зафиксир…» применительно к цене', () => {
    for (const text of texts) {
      assert.doesNotMatch(text, FIX_PRICE, text);
      assert.doesNotMatch(text, /прайс|базов\p{L}* цен|на уровне медианы/iu, text);
    }
    // Места, где рекомендация пишется: карточка и пояснение блока,
    // рекомендация месяца, письмо, «Что делать», «Продукты» аналитики.
    const files = [
      ['app', 'cabinet', 'manage', 'recommendations', 'page.tsx'],
      ['app', 'cabinet', 'manage', 'analytics', 'products', 'page.tsx'],
      ['lib', 'cabinet', 'recommendations.ts'],
      ['lib', 'cabinet', 'head-digest.ts'],
      ['lib', 'cabinet', 'practice-review.ts'],
      ['lib', 'cabinet', 'analytics', 'advice.ts'],
      ['lib', 'cabinet', 'analytics', 'price-guide.ts'],
      ['lib', 'cabinet', 'analytics', 'metrics.ts'],
    ];
    for (const parts of files) {
      const text = source(...parts);
      assert.doesNotMatch(text, FIX_PRICE, parts.join('/'));
      assert.doesNotMatch(text, /Требуют прайса|Вывести прайс|базовую цену|Подготовить базовую/u, parts.join('/'));
    }
    // Сама проверка ловит прежние формулировки.
    for (const old of [
      'Зафиксировать цену «ВКР» по медиане',
      'зафиксировать цену по собственной медиане до начала окна продвижения вида',
      'Цену «ВКР» зафиксировать на уровне медианы',
    ]) {
      assert.match(old, FIX_PRICE, old);
    }
  });

  it('тексты проходят text-guard (С-1, Р-365)', () => {
    for (const text of texts) assert.deepEqual(findForbidden(text), [], text);
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
