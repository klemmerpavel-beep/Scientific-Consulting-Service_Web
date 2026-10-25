/**
 * Из «Вознаграждения кураторов» и «Должников» — к выплате и платежу, а не
 * на верх экрана оплат (решение Р-747). Блокам «Транши» и
 * «Вознаграждение куратора» — якоря, строке транша — свой; якорь один для
 * всех ролей, подпись — по роли (клиенту «Платежи», Р-746). После
 * потоковой загрузки цель доводит `HashScroll` (Р-697); действия экранов не
 * меняются (Р-345, Р-244).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const payments = read('app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx');
const payouts = read('app', 'cabinet', 'manage', 'finance', 'payouts', 'page.tsx');
const debtors = read('app', 'cabinet', 'manage', 'finance', 'debtors', 'page.tsx');

describe('якоря экрана оплат (Р-747)', () => {
  it('«Транши» — якорь `tranches` для всех ролей, подпись по роли', () => {
    assert.match(
      payments,
      /<Block id="tranches" style=\{\{ marginBottom: 20, scrollMarginTop: 24 \}\}>[\s\S]{0,300}\{forClient \? 'Платежи' : 'Транши'\}/u,
    );
  });

  it('строка транша — свой якорь', () => {
    assert.match(payments, /key=\{tranche\.id\}\s*id=\{`tranche-\$\{tranche\.id\}`\}/u);
  });

  it('«Вознаграждение куратора» — якорь `payout`', () => {
    assert.match(payments, /<Block id="payout" style=\{\{ scrollMarginTop: 24 \}\}>\s*<Heading level=\{2\} size=\{3\}>Вознаграждение куратора<\/Heading>/u);
  });

  it('строка «Вознаграждения кураторов» ведёт к выплате', () => {
    assert.match(payouts, /href=\{`\/cabinet\/projects\/\$\{line\.project\.code\}\/payments#payout`\}/u);
    assert.doesNotMatch(payouts, /\/payments`\}/u);
  });

  it('строка «Должников» ведёт к своему траншу', () => {
    assert.match(debtors, /href=\{`\/cabinet\/projects\/\$\{row\.code\}\/payments#tranche-\$\{row\.trancheId\}`\}/u);
    assert.doesNotMatch(debtors, /\/payments`\}/u);
  });
});
