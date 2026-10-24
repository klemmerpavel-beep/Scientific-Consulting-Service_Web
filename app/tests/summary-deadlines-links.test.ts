/**
 * «Сорвано сроков — N» на «Сводке» ведёт к этим срокам; «Ближайшие сроки» —
 * все строки окна одним перечнем с прокруткой внутри плашки (решение
 * Р-724). Прежде фраза ответа называла шесть сорванных сроков и старшую
 * работу без перехода, «Ближайшие сроки» показывали три строки и текст
 * «И ещё 4 срока в том же окне.» без ссылки, а подпись группы «Сделать»
 * («сорванные сроки, ответы и решения») читалась как сорванные сроки
 * практики, хотя число в ней — дела «Мои» и «Контроль». Плашка держит
 * единый размер (Р-576): раскрытие на месте растило ряд с «Деньгами».
 * Цель «Начать с главного» не меняется (Р-207).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { practiceReview } from '../src/lib/cabinet/practice-review.ts';
import { answerDetail, answerSegments } from '../src/lib/cabinet/summary-answer.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const page = readFileSync(path.join(SRC, 'app', 'cabinet', 'manage', 'page.tsx'), 'utf8');
const ui = readFileSync(path.join(SRC, 'components', 'cabinet', 'ui.tsx'), 'utf8');

/** Разметка плашки «Сводки» по ключу, без комментариев. */
function plate(key: string): string {
  const start = page.indexOf(`    ${key}: (\n`);
  assert.ok(start > 0, `нет плашки ${key}`);
  const end = page.indexOf('\n    ),\n', start);
  return page.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/gu, '');
}

const AT = new Date(Date.UTC(2026, 8, 23, 9));
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const input = {
  light: {
    overdue: [{ title: 'Подготовка к предзащите', dueOn: day('2025-05-20'), href: '/cabinet/stages/s1' }],
    lateWorks: [
      { title: 'Сопровождение выпускной квалификационной работы', dueOn: day('2024-12-31'), href: '/cabinet/projects/PD-2024-009' },
    ],
  },
  live: 10,
  comments: 0,
  versions: 0,
  leads: 1,
  at: AT,
};

describe('ответ «Сводки» ведёт к сорванным срокам (Р-724)', () => {
  it('число сорванных сроков — к «Ближайшим срокам», старший — на свой экран', () => {
    const parts = answerSegments(input);
    const count = parts.find((part) => part.deadlines === true);
    assert.equal(count?.text, 'Сорвано сроков этапов и работ — 2');
    const oldest = parts.find((part) => part.href !== undefined);
    assert.equal(oldest?.text, 'Сопровождение выпускной квалификационной работы');
    assert.equal(oldest?.href, '/cabinet/projects/PD-2024-009');
  });

  it('текст ответа прежний: куски складываются в ту же фразу', () => {
    assert.equal(
      answerDetail(input),
      'Сорвано сроков этапов и работ — 2; старший — «Сопровождение выпускной квалификационной работы», 631 день. Действующих работ — 10. 1 заявка ждёт разбора.',
    );
    assert.equal(answerSegments({ ...input, light: { overdue: [], lateWorks: [] }, live: null, leads: 0 }).length, 0);
  });

  it('на экране: число — ссылкой на якорь блока, если он показан; старший — ссылкой; цвет — текста панели', () => {
    assert.match(page, /const deadlinesHere = dashboard && isShown\(layout, 'deadlines'\) && deadlines\.length > 0;/u);
    assert.match(page, /part\.deadlines === true && deadlinesHere \? \(\s*<a key=\{index\} href="#deadlines" style=\{\{ color: 'inherit' \}\}>/u);
    assert.match(page, /<a key=\{index\} href=\{part\.href\} style=\{\{ color: 'inherit' \}\}>/u);
    assert.match(page, /href: `\/cabinet\/stages\/\$\{stage\.id\}`/u);
    assert.match(page, /href: `\/cabinet\/projects\/\$\{work\.code\}` \}\)\),/u);
  });
});

describe('«Ближайшие сроки» — все строки окна в плашке единого размера (Р-724, Р-576)', () => {
  const block = plate('deadlines');

  it('плашка — перечень с прокруткой внутри, как «Ведутся сейчас»; якорь и ссылка «все работы» — в шапке', () => {
    assert.match(block, /^\s*<ScrollCard id="deadlines" title="Ближайшие сроки" href="\/cabinet\/projects" hrefLabel="все работы">/mu);
    assert.doesNotMatch(block, /<Card\b/u, 'плашка «Ближайшие сроки» осталась Card без прокрутки внутри');
    // Тот же перечень у «Ведутся сейчас» — образец единого размера.
    assert.match(plate('works'), /<ScrollCard title=/u);
  });

  it('все строки окна — одним перечнем; пустое состояние — в теле плашки', () => {
    assert.match(block, /\{deadlines\.map\(deadlineItem\)\}/u);
    assert.doesNotMatch(block, /deadlines\.slice\(/u, 'строки окна снова делятся на видимые и скрытые');
    assert.doesNotMatch(block, /<Disclosure\b/u, 'раскрытие на месте растит ряд плашек (Р-576)');
    assert.doesNotMatch(block, /И ещё/u);
    assert.doesNotMatch(page, /\bDEADLINES_SHOWN\b/u);
    const body = block.slice(block.indexOf('<ScrollCard'), block.indexOf('</ScrollCard>'));
    assert.match(body, /В ближайшие две недели сроков нет, сорванных сроков нет\./u);
  });

  it('у ScrollCard — необязательный якорь с отступом прокрутки 24 px', () => {
    const fn = ui.slice(ui.indexOf('export function ScrollCard('), ui.indexOf('\n}\n', ui.indexOf('export function ScrollCard(')));
    assert.match(fn, /\bid\?: string;/u);
    assert.match(fn, /<section\s+id=\{id\}\s+className="cab-card cab-dash-list"/u);
    assert.match(fn, /\.\.\.\(id === undefined \? \{\} : \{ scrollMarginTop: 24 \}\)/u);
  });
});

describe('подпись группы «Сделать» (Р-724)', () => {
  it('называет дела и контроль, а не сорванные сроки практики; число — дела «Требует внимания»', () => {
    const [act] = practiceReview({
      act: [{ title: 'Дело', note: null, href: '#' }],
      watch: [],
      chance: { count: 0, month: null },
    });
    assert.equal(act?.scope, 'ваши дела и контроль менеджеров');
    assert.equal(act?.count, 1);
    assert.doesNotMatch(act?.scope ?? '', /сорван/u);
  });

  it('«Начать с главного» не ведёт к старшему сроку ответа: цель — первое дело «Требует внимания»', () => {
    assert.match(page, /<ButtonLink href=\{main\.href\}>Начать с главного<\/ButtonLink>/u);
    // `main` — первое дело перечня `attention`, кроме срока приостановленной
    // работы (Р-720), а не старший срок из ответа.
    assert.equal(
      page.match(/const main = ([^;]+);/u)?.[1],
      "attention.find((row) => !('paused' in row && row.paused)) ?? attention[0]",
    );
    // `attention` — дела по своим работам (`attentionParts`, Р-337), а не
    // светофор всей практики, по которому строится ответ (Р-695).
    const list = page.slice(page.indexOf('const attention = ['), page.indexOf('const ATTENTION_LIMIT'));
    assert.match(list, /^const attention = \[\s*\.\.\.parts\.overdue\.map\(/u);
    assert.doesNotMatch(list, /\bpractice\b|answerParts|answerSegments/u);
    // Это тот же перечень, что блок «Требует внимания» под ответом.
    assert.match(page, /<Block id="attention"[^>]*>\s*<Heading[^>]*>\s*Требует внимания · \{attention\.length\}/u);
  });
});
