/**
 * Выводы «Аналитики» ведут к экрану действия (решение Р-751): «Деньги»
 * — к «Должникам», «Сроки» — к «Ближайшим срокам» «Сводки», «Клиенты» — к
 * «Рекомендациям», группе «Возврат клиентов», цена — к группе «Цена и
 * пакеты», сезон — к «Календарю продвижения» (приём Р-349). Числа и слова
 * выводов не меняются. В таблицах «Дебиторская задолженность» и
 * «Остановленные работы» название работы — ссылкой на её карточку; код
 * только в адресе (Р-189).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { conclusions, type ProjectRow } from '../src/lib/cabinet/analytics/metrics.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const overview = read('app', 'cabinet', 'manage', 'analytics', 'page.tsx');
const money = read('app', 'cabinet', 'manage', 'analytics', 'money', 'page.tsx');
const losses = read('app', 'cabinet', 'manage', 'analytics', 'losses', 'page.tsx');
const manage = read('app', 'cabinet', 'manage', 'page.tsx');
const recommendations = read('app', 'cabinet', 'manage', 'recommendations', 'page.tsx');

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
    closedOnPlanned: false,
    firstClosedOn: null,
    cost: 10_000_000n,
    paid: 10_000_000n,
    ...over,
    signedOn: over.signedOn ?? null,
    writtenOff: over.writtenOff ?? 0n,
    payments: over.payments ?? [],
    code: over.code,
  };
}

describe('выводы ведут к экрану действия (Р-751)', () => {
  // Действующие работы со сроком в прошлом и остатком: выводы «Деньги» и «Сроки».
  const rows = Array.from({ length: 8 }, (_, index) =>
    row({
      code: `PD-${index}`,
      clientId: `c${index % 3}`,
      clientName: `Клиент ${index % 3}`,
      status: 'ACTIVE',
      closedOn: null,
      cost: 20_000_000n,
      paid: 5_000_000n,
      startedOn: new Date(Date.UTC(2025, index % 12, 5)),
      dueOn: new Date(Date.UTC(2026, 0, 10)),
    }),
  );
  const list = conclusions(rows, CONTROL);

  it('«Деньги» — к «Должникам», «Сроки» — к «Ближайшим срокам»', () => {
    const debt = list.find((item) => item.area === 'Деньги');
    const late = list.find((item) => item.area === 'Сроки');
    assert.deepEqual(debt?.next, { href: '/cabinet/manage/finance/debtors', label: '«Должники»: напомнить, перенести дату или списать' });
    assert.deepEqual(late?.next, { href: '/cabinet/manage#deadlines', label: '«Ближайшие сроки» на «Сводке»' });
  });

  it('у каждого вывода — экран действия; слова выводов прежние', () => {
    for (const item of list) assert.match(item.next.href, /^\/cabinet\/manage/u);
    const debt = list.find((item) => item.area === 'Деньги')!;
    assert.equal(debt.title, 'Взыскать остаток по работам с прошедшим сроком');
    assert.match(debt.action, /^Пройти по каждой работе и назвать дату платежа; где платить не будут — списать/u);
  });

  it('все шесть видов выводов несут адрес, «Клиенты» и цена — к группам «Рекомендаций»', () => {
    const metrics = read('lib', 'cabinet', 'analytics', 'metrics.ts');
    const body = metrics.slice(metrics.indexOf('export function conclusions('), metrics.indexOf('function moneyWords('));
    assert.equal([...body.matchAll(/out\.push\(\{/gu)].length, 6);
    assert.deepEqual(
      [...body.matchAll(/next: NEXT\.(\w+),/gu)].map((match) => match[1]),
      ['debtors', 'deadlines', 'calendar', 'returns', 'price', 'returns'],
    );
    assert.match(metrics, /returns: \{ href: '\/cabinet\/manage\/recommendations#returns'/u);
    assert.match(metrics, /price: \{ href: '\/cabinet\/manage\/recommendations#price'/u);
  });

  it('якоря экранов действия существуют', () => {
    assert.match(manage, /<ScrollCard id="deadlines" title="Ближайшие сроки"/u);
    assert.match(recommendations, /<Card id="returns">/u);
    assert.match(recommendations, /<Card style=\{\{ marginBottom: 20 \}\} id="price">/u);
  });

  it('плашка вывода — со ссылкой на экран действия', () => {
    assert.match(overview, /<a className="cab-mark" href=\{item\.next\.href\}>\s*\{item\.next\.label\}\s*<\/a>/u);
  });
});

describe('название работы в таблицах «Аналитики» — ссылкой на карточку (Р-751)', () => {
  it('«Дебиторская задолженность»', () => {
    assert.match(money, /<a className="cab-mark" href=\{`\/cabinet\/projects\/\$\{debt\.code\}`\}>\s*\{debt\.title\}\s*<\/a>/u);
  });

  it('«Остановленные работы»', () => {
    assert.match(losses, /<a className="cab-mark" href=\{`\/cabinet\/projects\/\$\{row\.code\}`\}>\s*\{row\.title\}\s*<\/a>/u);
  });

  it('код работы на экран не выводится', () => {
    assert.doesNotMatch(money, />\s*\{debt\.code\}/u);
    assert.doesNotMatch(losses, />\s*\{row\.code\}/u);
  });
});
