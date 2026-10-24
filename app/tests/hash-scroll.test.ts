/**
 * Якорь в адресе экрана кабинета (решение Р-697).
 *
 * Экраны приходят потоком после скелета `app/cabinet/loading.tsx`: в ответе
 * сервера цель якоря лежит в скрытом куске, который переносится
 * сценарием, и браузер её не находит — «Пульс практики» по
 * `?period=7#pulse` открывался с начала страницы. Прокрутку к цели после
 * загрузки делает `HashScroll` в каркасе; ссылки периода «Получено» ведут
 * к своему блоку «Деньги».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { hashTarget } from '../src/components/cabinet/hash-target.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

describe('цель якоря из адреса (Р-697)', () => {
  it('имя без решётки', () => {
    assert.equal(hashTarget('#pulse'), 'pulse');
    assert.equal(hashTarget('#manage-card'), 'manage-card');
  });

  it('пустой якорь и одна решётка — цели нет', () => {
    assert.equal(hashTarget(''), null);
    assert.equal(hashTarget('#'), null);
  });

  it('закодированное имя раскодируется, испорченное — не роняет экран', () => {
    assert.equal(hashTarget('#%D0%B4%D0%B5%D0%BD%D1%8C%D0%B3%D0%B8'), 'деньги');
    assert.equal(hashTarget('#%E0%A4%A'), null);
  });
});

describe('каркас прокручивает к якорю после загрузки (Р-697)', () => {
  it('`HashScroll` — в каркасе кабинета', () => {
    const shell = read('components', 'cabinet', 'Shell.tsx');
    assert.match(shell, /import HashScroll from '\.\/HashScroll';/u);
    assert.match(shell, /<HashScroll \/>/u);
  });

  it('`HashScroll` работает в браузере и прокручивает к цели якоря', () => {
    const code = read('components', 'cabinet', 'HashScroll.tsx');
    assert.match(code, /^'use client';/u);
    assert.match(code, /hashTarget\(window\.location\.hash\)/u);
    assert.match(code, /scrollIntoView\(\{ block: 'start' \}\)/u);
  });
});

describe('«Получено» на «Сводке» возвращает к блоку «Деньги» (Р-697)', () => {
  const page = read('app', 'cabinet', 'manage', 'page.tsx');

  it('у плашки «Деньги» есть якорь с отступом сверху', () => {
    assert.match(page, /<Card id="money" style=\{\{ display: 'flex', flexDirection: 'column', scrollMarginTop: 24 \}\}>/u);
  });

  it('ссылки «за 90 дней» и «за всё время» ведут к «Деньгам»', () => {
    assert.match(page, /href="\/cabinet\/manage\?received=90#money"/u);
    assert.match(page, /href="\/cabinet\/manage\?received=all#money"/u);
  });

  it('период «Пульса» по-прежнему ведёт к «Пульсу»', () => {
    assert.match(page, /\}#pulse`;/u);
    assert.match(page, /<section id="pulse"[^>]*scrollMarginTop: 24/u);
  });
});
