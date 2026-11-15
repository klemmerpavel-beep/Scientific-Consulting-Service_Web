/**
 * Подписи для менеджера на экранах, общих с руководителем (задача ВК-М08,
 * решение Р-756).
 *
 * «Все заявки», карточка заявки и «Новый заказ» вели менеджера «к сводке» и
 * «к работам», а пояснение говорило об очереди «на «Сводке»» — экрана
 * «Сводка» у менеджера нет: его первый экран — «Сегодня», перечень работ —
 * «Мои работы» (Р-305). Ссылка «назад» называет экран-цель по меню роли
 * (Р-703): менеджеру — «Сегодня» и «Мои работы», руководителю — «Сводка» и
 * «Работы».
 *
 * Решение Р-895 уточняет экраны-цели: карточка заявки возвращает к перечню
 * заявок, «Новый заказ» — к «Заказам» (Р-874), а у «Заявок» менеджера —
 * пункта его меню — ссылки «назад» нет. Правило подписи прежнее.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { ORDERS_HREF, SUMMARY_HREF, menuLabel } from '../src/lib/cabinet/nav.ts';

const MANAGE = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');

/** Исходник без комментариев: проверяются подписи, а не пояснения к коду. */
function code(...parts: string[]): string {
  return readFileSync(path.join(MANAGE, ...parts), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

const LEADS = code('leads', 'page.tsx');
const LEAD = code('leads', '[id]', 'page.tsx');
const ORDER = code('orders', 'new', 'page.tsx');

const actor = (role: Actor['role']): Actor => ({
  id: `u-${role}`,
  role,
  status: 'ACTIVE',
  clientProfileId: null,
  expertNdaSignedAt: null,
});

describe('экран-цель — по меню роли', () => {
  it('менеджеру «Сегодня» и «Мои работы», руководителю «Сводка» и «Работы»', () => {
    assert.equal(menuLabel(actor('MANAGER'), SUMMARY_HREF), 'Сегодня');
    assert.equal(menuLabel(actor('MANAGER'), '/cabinet/projects'), 'Мои работы');
    assert.equal(menuLabel(actor('HEAD'), SUMMARY_HREF), 'Сводка');
    assert.equal(menuLabel(actor('HEAD'), '/cabinet/projects'), 'Работы');
    assert.equal(menuLabel(actor('EXPERT'), SUMMARY_HREF), null);
  });
});

describe('заявки и новый заказ: подписи по роли', () => {
  it('«Все заявки»: у менеджера — пункта меню — «назад» нет, руководителю — «Сводка»', () => {
    assert.equal(menuLabel(actor('MANAGER'), '/cabinet/manage/leads'), 'Заявки');
    assert.equal(menuLabel(actor('HEAD'), '/cabinet/manage/leads'), null);
    assert.match(LEADS, /const inMenu = menuLabel\(actor, '\/cabinet\/manage\/leads'\) !== null;/u);
    assert.match(
      LEADS,
      /backHref=\{inMenu \? undefined : SUMMARY_HREF\}\s*backLabel=\{inMenu \? undefined : \(menuLabel\(actor, SUMMARY_HREF\) \?\? 'Сводка'\)\}/u,
    );
  });

  it('карточка заявки возвращает к перечню заявок и подписана пунктом меню роли (Р-895)', () => {
    assert.match(LEAD, /const LEADS_HREF = '\/cabinet\/manage\/leads';/u);
    assert.match(LEAD, /backHref=\{LEADS_HREF\}\s*backLabel=\{menuLabel\(actor, LEADS_HREF\) \?\? 'Все заявки'\}/u);
    assert.doesNotMatch(LEAD, /SUMMARY_HREF/u);
  });

  it('пояснение «Всех заявок»: менеджеру — очередь на «Сегодня», руководителю — на «Сводке»', () => {
    assert.match(LEADS, /Очередь на «\$\{\s*actor\.role === 'MANAGER' \? 'Сегодня' : 'Сводке'\s*\}» показывает только те, что ждут решения/u);
  });

  it('«Новый заказ» подсвечивает «Заказы» и возвращает к ним (Р-895)', () => {
    assert.equal(menuLabel(actor('MANAGER'), ORDERS_HREF), 'Заказы');
    assert.equal(menuLabel(actor('HEAD'), ORDERS_HREF), 'Заказы');
    assert.match(ORDER, /<Shell actor=\{actor\} current="\/cabinet\/manage\/orders\/new">/u);
    assert.match(ORDER, /backHref=\{ORDERS_HREF\}\s*backLabel=\{menuLabel\(actor, ORDERS_HREF\) \?\? 'Заказы'\}/u);
  });

  it('прежних «к сводке» и «к работам» на трёх экранах нет', () => {
    for (const page of [LEADS, LEAD, ORDER]) {
      assert.doesNotMatch(page, /к сводке|к работам|Очередь на «Сводке»/u);
    }
  });
});
