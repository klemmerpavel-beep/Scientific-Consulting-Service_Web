/**
 * Меню руководителя — семь пунктов (решение Р-913).
 *
 * Аудит 15.11.2026, находка Н-2: девять пунктов не помещались в строку —
 * на 1440 px роль и «Выйти» переносились на вторую строку (шапка 160 px
 * вместо 92), на 390 px меню занимало три строки, 230 px до содержимого.
 * Ответ владельца: «Рекомендации» — вкладкой «Аналитики», «Реклама» — в
 * «Управление». Экраны и адреса не менялись.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { ADS_HREF, ANALYTICS_HREF, RECOMMENDATIONS_HREF, activeItem, navFor } from '../src/lib/cabinet/nav.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const head: Actor = { id: 'head-menu', role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };

describe('меню руководителя (Р-913)', () => {
  it('семь пунктов в прежнем порядке', () => {
    assert.deepEqual(
      navFor(head).map((item) => item.label),
      ['Сводка', 'Работы', 'Заказы', 'Деньги', 'Аналитика', 'Управление', 'Настройки'],
    );
  });

  it('ни у одной роли меню не длиннее семи пунктов', () => {
    for (const role of ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'] as const) {
      assert.ok(navFor({ ...head, role }).length <= 7, role);
    }
  });

  it('«Рекомендации» и «Реклама» пунктами не стоят', () => {
    const hrefs = navFor(head).map((item) => item.href);
    assert.equal(hrefs.includes(RECOMMENDATIONS_HREF), false);
    assert.equal(hrefs.includes(ADS_HREF), false);
  });

  it('«Рекомендации» подсвечивают «Аналитику»', () => {
    assert.equal(activeItem(navFor(head), RECOMMENDATIONS_HREF), ANALYTICS_HREF);
  });

  it('«Рекомендации» — последняя вкладка «Аналитики»', () => {
    const tabs = readFileSync(path.join(SRC, 'components', 'cabinet', 'AnalyticsTabs.tsx'), 'utf8');
    assert.match(tabs, /label: 'Потери' \},[\s\S]*?\{ href: '\/cabinet\/manage\/recommendations', label: 'Рекомендации' \},\n\] as const;/u);
  });

  it('экран «Рекомендаций» несёт полосу вкладок «Аналитики»', () => {
    const screen = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'recommendations', 'page.tsx'), 'utf8');
    assert.match(screen, /<AnalyticsTabs current=\{RECOMMENDATIONS_HREF\} \/>/u);
  });
});
