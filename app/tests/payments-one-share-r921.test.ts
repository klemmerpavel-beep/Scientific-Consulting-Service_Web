/**
 * Экран оплат: одна доля оплаты для всех ролей, корректировка со знаком,
 * дата оплаты без повтора слова метки (решение Р-921).
 *
 * Аудит 15.11.2026, находки Ф-14 и В-8: по одному договору со списанной
 * частью клиент читал «Оплачено 74 % суммы к оплате», руководитель —
 * «66 % суммы договора»; «Корректировка суммы 60 000 ₽» стояла без знака,
 * хотя вычитается; строка платежа повторяла слово метки — «оплачен
 * 22 сентября · оплачен».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { formatAmount, paidPercent } from '../src/lib/cabinet/money.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
  'utf8',
);

describe('одна доля оплаты (Ф-14)', () => {
  // Договор 600 000, списано 60 000, получено 400 000.
  const money = { contractTotal: 60_000_000n, received: 40_000_000n, adjustment: 6_000_000n };

  it('доля считается от суммы к оплате: 400 из 540 — 74 %', () => {
    assert.equal(paidPercent(money, true), 74);
  });

  it('экран считает её одинаково для клиента и для практики', () => {
    assert.match(page, /const progress = money === null \? 0 : paidPercent\(money, true\);/u);
    assert.doesNotMatch(page, /paidPercent\(money, forClient\)/u);
    assert.match(page, /const ofPayable = money !== null && money\.adjustment > 0n;/u);
  });

  it('без корректировки подпись прежняя — «суммы договора»', () => {
    const plain = { contractTotal: 60_000_000n, received: 40_000_000n, adjustment: 0n };
    assert.equal(paidPercent(plain, true), 66);
    assert.match(page, /Оплачено \{progress\}% \{ofPayable \? 'суммы к оплате' : 'суммы договора'\}/u);
  });
});

describe('корректировка со знаком (Ф-14)', () => {
  it('списанное стоит со знаком «−», оплаченное сверх договора — без знака', () => {
    assert.match(page, /\{formatAmount\(-money\.adjustment\)\}/u);
    assert.equal(formatAmount(-6_000_000n).replace(/\s/gu, ' '), '−60 000 ₽');
    assert.equal(formatAmount(-(-1_500_000n)).replace(/\s/gu, ' '), '15 000 ₽');
  });
});

describe('дата оплаты без повтора слова метки (В-8)', () => {
  it('строка платежа называет дату, «оплачен» говорит метка состояния', () => {
    assert.equal((page.match(/дата оплаты — \$\{formatDate\(tranche\.paidOn\)\}/gu) ?? []).length, 2);
    assert.doesNotMatch(page, /`(?: · )?оплачен \$\{formatDate\(tranche\.paidOn\)\}`/u);
  });
});
