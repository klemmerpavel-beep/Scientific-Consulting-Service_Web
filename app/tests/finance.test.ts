/**
 * Денежная арифметика. Суммы хранятся в копейках целыми числами: тип с
 * плавающей точкой к деньгам не применяется, и это проверяется здесь, а не
 * обнаруживается на сверке с бухгалтерией.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatAmount, parseAmount } from '../src/lib/cabinet/money.ts';

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
