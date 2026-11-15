/**
 * «Деньги»: подразделы — вкладками; ежедневная группа «Управления»
 * раскрыта (решение Р-924).
 *
 * Аудит 15.11.2026, находка Н-5: пять подразделов «Денег» стояли ссылками
 * в абзаце, а ежедневные «Все заявки», «Команда» и «Поручения» — в
 * свёрнутой группе «Управления».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const tabs = read('components', 'cabinet', 'FinanceTabs.tsx');
const SCREENS = ['', 'debtors', 'receipts', 'payouts', 'profit', 'years'];

describe('вкладки «Денег» (Р-924)', () => {
  it('шесть вкладок, первая — сам раздел', () => {
    const hrefs = [...tabs.matchAll(/href: '(\/cabinet\/manage\/finance[^']*)'/gu)].map((match) => match[1]);
    assert.deepEqual(hrefs, SCREENS.map((screen) => `/cabinet/manage/finance${screen === '' ? '' : `/${screen}`}`).sort((a, b) => hrefs.indexOf(a) - hrefs.indexOf(b)));
    assert.equal(hrefs.length, 6);
    assert.equal(hrefs[0], '/cabinet/manage/finance');
  });

  it('вкладка видна по праву экрана: выплаты — своим правом', () => {
    assert.match(tabs, /FINANCE_TABS\.filter\(\(tab\) => can\(actor, tab\.action\)\)/u);
    assert.match(tabs, /finance\/payouts', label: 'Вознаграждение кураторов', action: 'PAYOUT_MANAGE'/u);
    for (const screen of SCREENS.filter((name) => name !== 'payouts')) {
      const page = read('app', 'cabinet', 'manage', 'finance', ...(screen === '' ? [] : [screen]), 'page.tsx');
      assert.match(page, /can\(actor, 'MARGIN_VIEW'\)/u, screen);
    }
  });

  it('полоса стоит на каждом экране раздела и подсвечивает свой', () => {
    for (const screen of SCREENS) {
      const page = read('app', 'cabinet', 'manage', 'finance', ...(screen === '' ? [] : [screen]), 'page.tsx');
      const href = `/cabinet/manage/finance${screen === '' ? '' : `/${screen}`}`;
      assert.ok(page.includes(`<FinanceTabs actor={actor} current="${href}" />`), href);
    }
  });

  it('абзаца со ссылками на подразделы на «Деньгах» больше нет', () => {
    const root = read('app', 'cabinet', 'manage', 'finance', 'page.tsx');
    assert.doesNotMatch(root, /<a href="\/cabinet\/manage\/finance\/(?:years|debtors|receipts|profit|payouts)">/u);
  });
});

describe('ежедневная группа «Управления» раскрыта (Р-924)', () => {
  it('группа «Заявки и клиенты» открыта, остальные свёрнуты', () => {
    const tools = read('app', 'cabinet', 'manage', 'tools', 'page.tsx');
    assert.match(tools, /open=\{group\.key === 'work'\}/u);
    assert.match(tools, /key: 'work',\s*title: 'Заявки и клиенты'/u);
  });
});
