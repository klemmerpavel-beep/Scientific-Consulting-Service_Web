/**
 * Оплаты клиенту: его слова вместо слов учёта и доля оплаты от суммы к
 * оплате (решение Р-746). Арифметика «договор − корректировка −
 * получено = осталось» (Р-315) и экран сотрудников не меняются.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CLIENT_STATUS_LABEL, STATUS_LABEL, paidPercent } from '../src/lib/cabinet/money.ts';

const page = readFileSync(
  path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', '[code]', 'payments', 'page.tsx'),
  'utf8',
);

const RUB = 100n;

describe('доля оплаты (Р-746)', () => {
  // Договор 600 000, корректировка 60 000, получено 540 000: осталось 0.
  const paid = { contractTotal: 600_000n * RUB, received: 540_000n * RUB, adjustment: 60_000n * RUB };

  it('клиенту при «осталось 0» — 100 % суммы к оплате', () => {
    assert.equal(paidPercent(paid, true), 100);
  });

  it('сотрудникам — от суммы договора, как прежде', () => {
    assert.equal(paidPercent(paid, false), 90);
  });

  it('без корректировки доля клиента прежняя', () => {
    const plain = { contractTotal: 600_000n * RUB, received: 400_000n * RUB, adjustment: 0n };
    assert.equal(paidPercent(plain, true), paidPercent(plain, false));
    assert.equal(paidPercent(plain, true), 66);
  });

  it('сумма к оплате ноль и оплат нет (отменённая работа) — 0 %, а не 100 %', () => {
    const cancelled = { contractTotal: 300_000n * RUB, received: 0n, adjustment: 300_000n * RUB };
    assert.equal(paidPercent(cancelled, true), 0);
  });

  it('переплата (корректировка меньше нуля) доли не меняет', () => {
    const over = { contractTotal: 100_000n * RUB, received: 110_000n * RUB, adjustment: -10_000n * RUB };
    assert.equal(paidPercent(over, true), paidPercent(over, false));
  });

  it('договор без суммы — ноль, как прежде', () => {
    assert.equal(paidPercent({ contractTotal: 0n, received: 0n, adjustment: 0n }, false), 0);
  });
});

describe('слова клиента на экране оплат (Р-746)', () => {
  it('запланированный платёж — «счёт ещё не выставлен»; у сотрудников — прежнее', () => {
    assert.equal(CLIENT_STATUS_LABEL.PLANNED, 'счёт ещё не выставлен');
    assert.equal(STATUS_LABEL.PLANNED, 'ожидается');
    for (const key of ['INVOICED', 'PAID', 'WRITTEN_OFF', 'REVERSED'] as const) {
      assert.equal(CLIENT_STATUS_LABEL[key], STATUS_LABEL[key]);
    }
    assert.match(page, /\{\(forClient \? CLIENT_STATUS_LABEL : STATUS_LABEL\)\[tranche\.status as TrancheStatus\]\}/u);
  });

  it('клиент — по роли; доля и подпись — по сумме к оплате при корректировке', () => {
    assert.match(page, /const forClient = actor\.role === 'CLIENT';/u);
    assert.match(page, /const ofPayable = forClient && money !== null && money\.adjustment > 0n;/u);
    assert.match(page, /const progress = money === null \? 0 : paidPercent\(money, forClient\);/u);
    assert.match(page, /Оплачено \{progress\}% \{ofPayable \? 'суммы к оплате' : 'суммы договора'\}/u);
  });

  it('«Платежи», а не «Транши»; пустые перечни — словами клиента', () => {
    assert.match(page, /\{forClient \? 'Платежи' : 'Транши'\}/u);
    assert.match(page, /\{forClient \? 'Платежей пока нет\.' : 'Транши ещё не заведены\.'\}/u);
    assert.match(page, /'Договор ещё не приложен\. Счета и акты появятся у платежей выше\.'/u);
  });

  it('оплаченный без плановой даты — только «оплачен {дата}»; просроченный без счёта — кто пришлёт счёт и ссылка в переписку', () => {
    const client = page.slice(page.indexOf('{forClient ? (\n                          // Клиенту: у оплаченного'), page.indexOf('                        ) : (\n                          <Text muted size={13} style={{ marginTop: 2 }}>'));
    assert.match(client, /tranche\.paidOn === null\s*\? 'срок не задан'\s*: null/u);
    assert.match(client, /`срок оплаты прошёл \$\{formatDate\(tranche\.plannedDate\)\}`/u);
    assert.match(client, /tranche\.status === 'PLANNED' && tranche\.documents\.length === 0 && isTrancheOverdue\(tranche, project\.status, today\)/u);
    assert.match(client, /' · счёт пришлёт менеджер · '/u);
    assert.match(client, /href=\{`\/cabinet\/projects\/\$\{project\.code\}\/messages#body`\}>\s*вопрос — в переписке/u);
  });

  it('у сотрудников строка платежа прежняя', () => {
    assert.match(
      page,
      /: `срок \$\{formatDate\(tranche\.plannedDate\)\} · просрочен`\}\s*\{tranche\.paidOn === null\s*\? ''\s*: ` · оплачен \$\{formatDate\(tranche\.paidOn\)\}`\}/u,
    );
    assert.match(page, /'Файл договора пока не приложен\. Счета и акты прикладываются к траншам — так видно, какой платёж каким документом закрыт\.'/u);
  });
});
