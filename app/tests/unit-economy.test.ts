/**
 * Экономика работы (план по образцу, К-4, решение Р-594): разложение
 * расходов вида на работы по поступлениям месяца, перенос расхода месяца
 * без поступлений, копейки без потерь, доли маржи.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  allocateTypeExpenses,
  economyOf,
  formatShare,
  shareOf,
  splitByWeight,
  type Receipt,
  type TypedExpense,
} from '../src/lib/cabinet/unit-economy.ts';

const receipt = (projectId: string, month: string, amount: bigint, typeId = 'dis'): Receipt => ({ projectId, typeId, month, amount });
const expense = (month: string, amount: bigint, typeId = 'dis'): TypedExpense => ({ typeId, month, amount });

describe('разложение расходов вида', () => {
  it('расход месяца делится по поступлениям работ вида в том же месяце', () => {
    const { byProject, pending } = allocateTypeExpenses(
      [receipt('A', '2026-09', 300_000n), receipt('B', '2026-09', 100_000n)],
      [expense('2026-09', 40_000n)],
    );
    assert.equal(byProject.get('A'), 30_000n);
    assert.equal(byProject.get('B'), 10_000n);
    assert.equal(pending.size, 0);
  });

  it('расход месяца без поступлений переходит на ближайший месяц, где они есть', () => {
    const { byProject, pending } = allocateTypeExpenses(
      [receipt('A', '2026-08', 100_000n), receipt('B', '2026-11', 100_000n)],
      [expense('2026-09', 5_000n), expense('2026-10', 7_000n), expense('2026-11', 1_000n)],
    );
    assert.equal(byProject.get('A') ?? 0n, 0n);
    assert.equal(byProject.get('B'), 13_000n);
    assert.equal(pending.size, 0);
  });

  it('расход последних месяцев без поступлений не теряется — он «не разложен»', () => {
    const { byProject, pending } = allocateTypeExpenses(
      [receipt('A', '2026-08', 100_000n)],
      [expense('2026-08', 2_000n), expense('2026-10', 9_000n)],
    );
    assert.equal(byProject.get('A'), 2_000n);
    assert.equal(pending.get('dis'), 9_000n);
  });

  it('виды не смешиваются: расход вида ложится только на работы этого вида', () => {
    const { byProject } = allocateTypeExpenses(
      [receipt('A', '2026-09', 100_000n, 'dis'), receipt('B', '2026-09', 100_000n, 'vkr')],
      [expense('2026-09', 10_000n, 'dis')],
    );
    assert.equal(byProject.get('A'), 10_000n);
    assert.equal(byProject.get('B') ?? 0n, 0n);
  });

  it('поступления работы за месяц складываются; нулевые и возвраты в вес не идут', () => {
    const { byProject } = allocateTypeExpenses(
      [
        receipt('A', '2026-09', 50_000n),
        receipt('A', '2026-09', 50_000n),
        receipt('B', '2026-09', 100_000n),
        receipt('C', '2026-09', 0n),
        receipt('D', '2026-09', -10_000n),
      ],
      [expense('2026-09', 1_000n)],
    );
    assert.equal(byProject.get('A'), 500n);
    assert.equal(byProject.get('B'), 500n);
    assert.equal(byProject.has('C'), false);
    assert.equal(byProject.has('D'), false);
  });

  it('копейки делятся без потерь: сумма долей равна разложенному расходу', () => {
    const receipts = [receipt('A', '2026-09', 1n), receipt('B', '2026-09', 1n), receipt('C', '2026-09', 1n)];
    const { byProject } = allocateTypeExpenses(receipts, [expense('2026-09', 100n)]);
    const parts = ['A', 'B', 'C'].map((id) => byProject.get(id)!);
    assert.equal(parts.reduce((a, b) => a + b, 0n), 100n);
    assert.deepEqual([...parts].sort(), [33n, 33n, 34n]);
  });

  it('разложение не зависит от порядка строк', () => {
    const receipts = [receipt('A', '2026-09', 70_001n), receipt('B', '2026-09', 29_999n), receipt('C', '2026-10', 10n)];
    const expenses = [expense('2026-09', 33_333n), expense('2026-10', 1n)];
    const one = allocateTypeExpenses(receipts, expenses);
    const two = allocateTypeExpenses([...receipts].reverse(), [...expenses].reverse());
    assert.deepEqual(new Map([...one.byProject].sort()), new Map([...two.byProject].sort()));
  });

  it('деление по весам: пустые и нулевые веса — пусто, без деления на ноль', () => {
    assert.equal(splitByWeight(100n, new Map()).size, 0);
    assert.equal(splitByWeight(100n, new Map([['A', 0n]])).size, 0);
    assert.equal(splitByWeight(0n, new Map([['A', 5n]])).size, 0);
  });
});

describe('доли маржи', () => {
  it('маржа и маржа после расходов вида — доли от поступившего и ожидаемого', () => {
    const economy = economyOf({ received: 400_000n, awaiting: 100_000n, margin: 300_000n, typeExpenses: 50_000n });
    assert.equal(economy.revenue, 500_000n);
    assert.equal(economy.marginShare, 60);
    assert.equal(economy.net, 250_000n);
    assert.equal(economy.netShare, 50);
  });

  it('без выручки доли нет — «—», а не ноль', () => {
    assert.equal(shareOf(10n, 0n), null);
    assert.equal(formatShare(null), '—');
  });

  it('доля с одним знаком отбрасыванием вниз: убыток не показывается меньше, чем он есть', () => {
    assert.equal(shareOf(1n, 3n), 33.3);
    assert.equal(shareOf(-1n, 3n), -33.4);
    assert.equal(shareOf(-1_001_000n, 3_000_000n), -33.4);
    assert.equal(shareOf(-3n, 10n), -30);
    assert.equal(formatShare(33.3), '33,3 %');
    assert.equal(formatShare(50), '50 %');
  });

  it('минус у доли — тот же знак, что у сумм, а не дефис', () => {
    assert.equal(formatShare(-5.2), '\u22125,2\u00a0%');
  });
});
