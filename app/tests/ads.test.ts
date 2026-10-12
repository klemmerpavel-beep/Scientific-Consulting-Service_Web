/**
 * Раздел «Реклама» руководителя (решение Р-550).
 *
 * Реестр переносится из `marketing/` в модуль приложения скриптом, и
 * правка источника без переноса должна валить проверки, как расхождение
 * макета и компонента. Здесь же — разбор документов, расчёты сводки,
 * воронка заявок и место раздела в меню.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { ADS_REGISTRY } from '../content/ads-registry.generated.ts';
import { funnelOf, sourceFunnels } from '../src/lib/cabinet/ads/funnel.ts';
import { isExternal, parseInline, parseMarkdown } from '../src/lib/cabinet/ads/markdown.ts';
import {
  budgetWithoutVat,
  docByPath,
  figures,
  moscowDayStart,
  openWorks,
  proposalKey,
  spendByWeek,
  testPhase,
} from '../src/lib/cabinet/ads/registry.ts';
import type { Actor } from '../src/lib/cabinet/access.ts';
import { ADS_HREF, activeItem, navFor } from '../src/lib/cabinet/nav.ts';
import { OUTPUT, loadRegistry, renderModule, validateRegistry } from '../../tools/ads-registry.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');

describe('реестр рекламы перенесён из marketing/', () => {
  it('модуль совпадает с выводом скрипта: правка источника без переноса не проходит', () => {
    const expected = renderModule(loadRegistry(ROOT));
    const actual = readFileSync(path.join(ROOT, OUTPUT), 'utf8');
    assert.equal(actual, expected, 'запустите node tools/ads-registry.mjs из корня репозитория');
  });

  it('каждая ссылка на документ ведёт на документ реестра', () => {
    const slugs = new Set(ADS_REGISTRY.docs.map((doc) => doc.slug));
    const refs = [
      ...ADS_REGISTRY.campaigns.map((row) => row.doc),
      ...ADS_REGISTRY.conclusions.map((row) => row.doc),
      ...ADS_REGISTRY.proposals.map((row) => row.doc),
      ...ADS_REGISTRY.works.map((row) => row.doc),
    ].filter((value): value is string => value !== null);
    for (const ref of refs) assert.ok(slugs.has(ref), `нет документа ${ref}`);
  });

  it('ключ отметки предложения проходит проверку механизма отметок', () => {
    const KEY = /^[a-z]+(?::[\w.-]+){1,3}$/u;
    for (const row of ADS_REGISTRY.proposals) assert.ok(KEY.test(proposalKey(row.id)), row.id);
  });

  it('скрипт отклоняет незнакомое состояние и ссылку на несуществующий документ', () => {
    const source = JSON.parse(readFileSync(path.join(ROOT, 'marketing', 'registry.json'), 'utf8'));
    const campaign = source.campaigns[0];
    assert.throws(
      () => validateRegistry({ ...source, campaigns: [{ ...campaign, status: 'RUNNING' }] }),
      /состояние «RUNNING»/u,
    );
    assert.throws(
      () => validateRegistry({ ...source, campaigns: [{ ...campaign, doc: 'нет-такого' }] }),
      /нет документа/u,
    );
    assert.doesNotThrow(() => validateRegistry(source));
  });
});

describe('документы в кабинете держат словарь его экранов', () => {
  it('без знаков-украшений и прежних названий ролей', () => {
    for (const doc of ADS_REGISTRY.docs.filter((item) => item.external === null)) {
      assert.doesNotMatch(doc.markdown, /[←-⇿☀-➿✓✔✖\u{1F300}-\u{1FAFF}]/u, doc.slug);
      assert.doesNotMatch(doc.markdown, /[Ээ]ксперт(?!из)|[Ии]сполнител|Специалист практики/u, doc.slug);
    }
  });

  it('документ вне кабинета — ссылка на файл в репозитории, без текста', () => {
    const outside = ADS_REGISTRY.docs.filter((item) => item.external !== null);
    assert.ok(outside.length > 0);
    for (const doc of outside) {
      assert.match(doc.external ?? '', /^https:\/\/github\.com\/klemmerpavel-beep\/Scientific-Consulting-Service_Web\/blob\/main\/marketing\//u);
      assert.equal(doc.markdown, '');
    }
  });
});

describe('разбор документов', () => {
  it('строка: жирный, код, ссылка, курсив, зачёркнутый', () => {
    assert.deepEqual(parseInline('a **b** `c` [d](https://e.ru) *f* ~~g~~'), [
      { t: 'text', v: 'a ' },
      { t: 'strong', v: 'b' },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'c' },
      { t: 'text', v: ' ' },
      { t: 'link', v: 'd', href: 'https://e.ru' },
      { t: 'text', v: ' ' },
      { t: 'em', v: 'f' },
      { t: 'text', v: ' ' },
      { t: 'strike', v: 'g' },
    ]);
  });

  it('блоки: заголовок, абзац в две строки, список с продолжением, таблица, цитата, код, черта', () => {
    const blocks = parseMarkdown(
      [
        '# Заголовок',
        '',
        'Первая строка',
        'вторая строка.',
        '',
        '- пункт один',
        '  продолжение',
        '  - вложенный',
        '1. нумерованный',
        '',
        '| А | Б |',
        '|---|---:|',
        '| 1 | 2 |',
        '',
        '> цитата',
        '',
        '```',
        'код <b>',
        '```',
        '',
        '---',
      ].join('\n'),
    );
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['heading', 'paragraph', 'list', 'table', 'quote', 'code', 'rule'],
    );
    const paragraph = blocks[1];
    assert.ok(paragraph?.kind === 'paragraph');
    assert.deepEqual(paragraph.inlines, [{ t: 'text', v: 'Первая строка вторая строка.' }]);
    const list = blocks[2];
    assert.ok(list?.kind === 'list');
    assert.deepEqual(
      list.items.map((item) => [item.depth, item.ordered]),
      [
        [0, false],
        [1, false],
        [0, true],
      ],
    );
    assert.deepEqual(list.items[0]?.inlines, [{ t: 'text', v: 'пункт один продолжение' }]);
    const table = blocks[3];
    assert.ok(table?.kind === 'table');
    assert.equal(table.rows.length, 1);
    const code = blocks[5];
    assert.ok(code?.kind === 'code');
    assert.equal(code.text, 'код <b>', 'код отдаётся текстом, разметка не исполняется');
  });

  it('ссылкой показываются только http и https', () => {
    assert.equal(isExternal('https://pravo.ru/news/255214/'), true);
    assert.equal(isExternal('javascript:alert(1)'), false);
    assert.equal(isExternal('../research/01.md'), false);
  });

  it('относительная ссылка на документ папки находит его в реестре', () => {
    const from = ADS_REGISTRY.docs.find((doc) => doc.slug === 'students');
    assert.ok(from !== undefined);
    assert.equal(docByPath(ADS_REGISTRY.docs, from.path, '../research/01-экономика-и-сезонность.md')?.slug, 'economics');
    assert.equal(docByPath(ADS_REGISTRY.docs, from.path, '00-аудит-и-критический-путь.md')?.slug, 'audit');
    assert.equal(docByPath(ADS_REGISTRY.docs, from.path, '../../docs/PLAN.md'), null);
  });

  it('каждый документ реестра разбирается без потери текста', () => {
    for (const doc of ADS_REGISTRY.docs.filter((item) => item.external === null)) {
      const blocks = parseMarkdown(doc.markdown);
      assert.ok(blocks.length > 0, doc.slug);
      assert.equal(blocks[0]?.kind, 'heading', `${doc.slug}: документ начинается с заголовка`);
    }
  });
});

describe('расчёты сводки', () => {
  it('показатели суммы кампаний', () => {
    const value = figures([
      { budgetPlan: 1000, spend: 500, impressions: 1000, clicks: 50, leads: 2 },
      { budgetPlan: 1000, spend: 0, impressions: 0, clicks: 0, leads: 0 },
    ]);
    assert.equal(value.spent, 0.25);
    assert.equal(value.ctr, 0.05);
    assert.equal(value.cpc, 10);
    assert.equal(value.cpl, 250);
    assert.equal(figures([]).cpc, null, 'без кликов цены клика нет');
  });

  it('бюджет без НДС и фаза теста по московскому дню', () => {
    const registry = { test: { from: '2026-10-27', to: '2026-11-23', budgetWithVat: 20000, vatRate: 0.22, baselineDays: 42 } };
    assert.equal(Math.round(budgetWithoutVat(registry)), 16393);
    assert.equal(testPhase(registry, new Date('2026-10-12T09:00:00Z')).phase, 'before');
    const first = testPhase(registry, new Date('2026-10-26T21:30:00Z'));
    assert.deepEqual([first.phase, first.day, first.days], ['running', 1, 28]);
    assert.equal(testPhase(registry, new Date('2026-11-23T21:00:00Z')).phase, 'after');
    assert.equal(moscowDayStart('2026-10-27').toISOString(), '2026-10-26T21:00:00.000Z');
  });

  it('открытые работы — по сроку, сделанные не входят', () => {
    const rows = openWorks([
      { id: 'b', title: '', owner: '', due: '2026-10-20', status: 'PLANNED', doc: null },
      { id: 'a', title: '', owner: '', due: null, status: 'PLANNED', doc: null },
      { id: 'c', title: '', owner: '', due: '2026-10-14', status: 'WAITING_OWNER', doc: null },
      { id: 'd', title: '', owner: '', due: '2026-10-01', status: 'DONE', doc: null },
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['c', 'b', 'a'],
    );
  });

  it('расход по неделям складывает кампании', () => {
    assert.deepEqual(
      spendByWeek([
        { week: '2026-11-02', campaign: 'x', spend: 100, impressions: 0, clicks: 3, leads: 1 },
        { week: '2026-10-26', campaign: 'x', spend: 50, impressions: 0, clicks: 1, leads: 0 },
        { week: '2026-11-02', campaign: 'y', spend: 25, impressions: 0, clicks: 2, leads: 0 },
      ]),
      [
        { week: '2026-10-26', spend: 50, clicks: 1, leads: 0 },
        { week: '2026-11-02', spend: 125, clicks: 5, leads: 1 },
      ],
    );
  });
});

describe('воронка заявок с посадочных', () => {
  it('целевая — с консультации; спам в заявки не входит', () => {
    assert.deepEqual(
      funnelOf([
        { status: 'NEW' },
        { status: 'AWAITING_REPLY' },
        { status: 'CONSULTED' },
        { status: 'CONTRACTED' },
        { status: 'DECLINED' },
        { status: 'SPAM' },
      ]),
      { total: 5, open: 2, targeted: 2, contracted: 1, declined: 1, spam: 1 },
    );
  });

  it('период теста и базовый уровень до него — раздельно', () => {
    const from = new Date('2026-10-26T21:00:00Z');
    const to = new Date('2026-11-23T21:00:00Z');
    const baselineFrom = new Date(from.getTime() - 42 * 86_400_000);
    const rows = [
      { source: 'students', status: 'NEW', createdAt: new Date('2026-10-01T10:00:00Z') },
      { source: 'students', status: 'SPAM', createdAt: new Date('2026-10-02T10:00:00Z') },
      { source: 'students', status: 'CONSULTED', createdAt: new Date('2026-10-28T10:00:00Z') },
      { source: 'postgrad', status: 'NEW', createdAt: new Date('2026-11-30T10:00:00Z') },
    ];
    const [students, postgrad] = sourceFunnels(rows, ['students', 'postgrad'], { from, to, baselineFrom });
    assert.equal(students?.test.targeted, 1);
    assert.equal(students?.baselineWeekly, 1 / 6, 'спам до запуска в базовый уровень не входит');
    assert.equal(postgrad?.test.total, 0, 'заявка после теста в тест не входит');
  });
});

describe('«Реклама» в меню руководителя', () => {
  const head: Actor = { id: 'head-ads', role: 'HEAD', status: 'ACTIVE', clientProfileId: null, expertNdaSignedAt: null };
  const manager: Actor = { ...head, id: 'manager-ads', role: 'MANAGER' };

  it('пункт стоит за «Аналитикой» и перед «Управлением»', () => {
    const labels = navFor(head).map((item) => item.label);
    assert.ok(labels.indexOf('Реклама') === labels.indexOf('Аналитика') + 1, labels.join(', '));
    assert.ok(labels.indexOf('Реклама') < labels.indexOf('Управление'));
  });

  it('документ раздела подсвечивает «Рекламу», а не «Управление»', () => {
    assert.equal(activeItem(navFor(head), `${ADS_HREF}/doc/plan`), ADS_HREF);
    assert.equal(activeItem(navFor(head), ADS_HREF), ADS_HREF);
  });

  it('менеджеру раздела нет', () => {
    assert.equal(navFor(manager).some((item) => item.href === ADS_HREF), false);
  });
});
