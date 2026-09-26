/**
 * Денежная арифметика. Суммы хранятся в копейках целыми числами: тип с
 * плавающей точкой к деньгам не применяется, и это проверяется здесь, а не
 * обнаруживается на сверке с бухгалтерией.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatAmount, formatRounded, outstandingOf, parseAmount } from '../src/lib/cabinet/money.ts';

describe('разбор введённой суммы', () => {
  const cases: [string, bigint][] = [
    ['240000', 24_000_000n],
    ['240 000', 24_000_000n],
    ['240 000 ₽', 24_000_000n],
    ['240000,50', 24_000_050n],
    ['240000.50', 24_000_050n],
    ['1 250,05', 125_005n],
    ['0,01', 1n],
  ];
  for (const [input, expected] of cases) {
    it(`«${input}» → ${expected} коп.`, () => {
      assert.equal(parseAmount(input), expected);
    });
  }

  it('неразличимое значение отклоняется', () => {
    for (const bad of ['', '   ', 'сумма', '₽']) {
      assert.throws(() => parseAmount(bad), /Сумма/);
    }
  });

  it('отрицательная сумма не принимается', () => {
    assert.throws(() => parseAmount('-1000'), /Сумма/);
    assert.throws(() => parseAmount('−5000'), /Сумма/);
  });

  it('слова, лишние знаки и точка-разделитель тысяч отклоняются, а не выбрасываются (Р-244)', () => {
    for (const bad of ['240 тыс', '1,5 млн', '240к', '240.000', '240 000,505', '24 00', '1,2,3']) {
      assert.throws(() => parseAmount(bad), /Сумма распознана неверно/u, bad);
    }
  });

  it('неразрывный пробел, «руб.» и одна цифра копеек принимаются', () => {
    assert.equal(parseAmount('240\u00a0000'), 24_000_000n);
    assert.equal(parseAmount('240 000 руб.'), 24_000_000n);
    assert.equal(parseAmount('240,5'), 24_050n);
  });
});

describe('показ суммы', () => {
  it('разряды разделяются, копейки показываются только ненулевые', () => {
    assert.equal(formatAmount(24_000_000n), '240 000 ₽');
    assert.equal(formatAmount(24_000_050n), '240 000,50 ₽');
    assert.equal(formatAmount(0n), '0 ₽');
  });

  it('отсутствие суммы отличается от нуля', () => {
    assert.equal(formatAmount(null), '—');
  });

  it('величина, полученная делением, округляется до рубля', () => {
    // Средний чек и медиана копеек не несут: они получены делением, и
    // три лишних знака обещают точность, которой у них нет (Р-182).
    assert.equal(formatRounded(9_601_851n), '96 019 ₽');
    assert.equal(formatRounded(9_601_849n), '96 018 ₽');
    assert.equal(formatRounded(9_601_850n), '96 019 ₽');
    assert.equal(formatRounded(0n), '0 ₽');
    assert.equal(formatRounded(-9_601_851n), '−96 019 ₽');
    assert.equal(formatRounded(null), '—');
    assert.equal(formatAmount(0n), '0 ₽');
  });
});

describe('арифметика не теряет копейки', () => {
  it('сложение долей контрольной суммы даёт её же', () => {
    // Те же величины, что в книге заказов: 5 425 000 и 4 370 000 рублей.
    const parts = ['125000', '150000', '45000', '5105000'].map(parseAmount);
    assert.equal(parts.reduce((a, b) => a + b, 0n), parseAmount('5425000'));
  });

  it('копеечные доли складываются точно', () => {
    // В числах с плавающей точкой 0.1 + 0.2 !== 0.3; в копейках — точно.
    const sum = parseAmount('0,10') + parseAmount('0,20');
    assert.equal(sum, parseAmount('0,30'));
    assert.equal(formatAmount(sum), '0,30 ₽');
  });
});

describe('смена статуса транша (решение Р-224)', async () => {
  const { canChangeTrancheStatus, isTrancheStatus, nextTrancheStatuses } = await import(
    '../src/lib/cabinet/money.ts'
  );

  it('ожидаемый транш: счёт, оплата или списание', () => {
    assert.deepEqual([...nextTrancheStatuses('PLANNED')].sort(), ['INVOICED', 'PAID', 'WRITTEN_OFF']);
  });

  it('оплаченный и списанный — итог, из него не уходят', () => {
    assert.deepEqual(nextTrancheStatuses('PAID'), []);
    assert.deepEqual(nextTrancheStatuses('WRITTEN_OFF'), []);
    assert.equal(canChangeTrancheStatus('PAID', 'PLANNED'), false);
  });

  it('выставленный счёт можно отозвать', () => {
    assert.equal(canChangeTrancheStatus('INVOICED', 'PLANNED'), true);
  });

  it('статус проверяется по перечню', () => {
    assert.equal(isTrancheStatus('PAID'), true);
    assert.equal(isTrancheStatus('REFUNDED'), false);
  });
});

describe('остаток долга по договору', () => {
  it('списанное долгом не считается, переплата в минус не уходит (решение Р-240)', () => {
    const tranches = [
      { amount: 100_000n, status: 'PAID' },
      { amount: 50_000n, status: 'WRITTEN_OFF' },
      { amount: 70_000n, status: 'INVOICED' },
    ];
    assert.equal(outstandingOf(220_000n, tranches), 70_000n);
    assert.equal(outstandingOf(120_000n, tranches), 0n);
    assert.equal(outstandingOf(220_000n, []), 220_000n);
  });
});

describe('суммы и признаки в журнале', () => {
  it('копейки показываются рублями, логические значения — «да»/«нет» (Р-242, Р-244)', async () => {
    const { detailsLabel } = await import('../src/lib/cabinet/journal-labels.ts');
    const text = detailsLabel({ amount: '24000050', held: true, contactHint: false });
    assert.match(text, /сумма 240\s000,50\s₽/u);
    assert.match(text, /на модерации да/u);
    assert.match(text, /есть контакты нет/u);
  });
});
