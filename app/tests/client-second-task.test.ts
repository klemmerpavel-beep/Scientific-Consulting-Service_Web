/**
 * Второе дело клиента по той же работе видно на «Моих работах» и карточке
 * (решение Р-729). Прежде «Ещё дел за вами: N» стояло последней частью
 * пояснения ответа и на 390 px срезалось, плашка называла одно дело, а
 * карточка писала «Ещё дел: 1.» без названия и ссылки. В ответе — одна
 * кнопка (Р-207); ответ и плашка первым называют одно дело (Р-213).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const list = read('app', 'cabinet', 'projects', 'page.tsx');
const card = read('app', 'cabinet', 'projects', '[code]', 'page.tsx');
const ui = read('components', 'cabinet', 'ui.tsx');

describe('«Мои работы»: второе дело видно (Р-729)', () => {
  it('«Ещё дел за вами» — сразу после срока, до фразы о работе', () => {
    const start = list.indexOf('// Срок — первым');
    const detail = list.slice(start, list.indexOf('action: <ButtonLink', start));
    const due = detail.indexOf('`Срок этапа — ${formatDate(first.dueOn)}.`');
    const more = detail.indexOf('`Ещё дел за вами: ${pendingAll.length - 1}.`');
    const work = detail.indexOf('стоит, пока их нет.');
    assert.ok(due > 0 && more > due && work > more, `порядок: срок ${due}, ещё ${more}, работа ${work}`);
  });

  it('на плашке — строки остальных этапов работы, ждущих клиента', () => {
    assert.match(list, /onPageMore\.set\(stage\.project\.code, \[\.\.\.\(onPageMore\.get\(stage\.project\.code\) \?\? \[\]\), stage\]\)/u);
    assert.match(list, /\} else if \(forClient\) \{/u);
    assert.match(list, /\(onPageMore\.get\(project\.code\) \?\? \[\]\)\.map\(\(stage\) => \(\s*<Fragment key=\{stage\.id\}>\{waitingRow\(stage\)\}<\/Fragment>/u);
  });

  it('в ответе — одна кнопка', () => {
    const answer = list.slice(list.indexOf('if (forClient) {'), list.indexOf('} else if (awaitingNda) {'));
    // Три варианта ответа клиенту — после загрузки, дело, дел нет — по
    // одной кнопке на вариант.
    assert.equal([...answer.matchAll(/<ButtonLink\b/gu)].length, 3);
  });
});

describe('карточка: второе дело — ссылкой на его этап (Р-729)', () => {
  it('«Ещё: …» ведёт на экран следующего этапа, с его сроком и числом остальных', () => {
    assert.match(card, /const second = yourTurn\[1\] \?\? null;/u);
    assert.match(card, /<a href=\{`\/cabinet\/stages\/\$\{second\.id\}`\}>/u);
    assert.match(card, /`загрузить материалы к этапу «\$\{second\.title\}»`/u);
    assert.match(card, /`согласовать этап «\$\{second\.title\}»`/u);
    assert.match(card, /yourTurn\.length > 2 \? ` и ещё \$\{yourTurn\.length - 2\}` : ''/u);
    assert.doesNotMatch(card, /`Ещё дел: \$\{yourTurn\.length - 1\}\.`/u);
    assert.match(card, /more=\{more\}/u);
  });

  it('панель готовности выводит строку абзацем под главной фразой', () => {
    assert.match(ui, /\{more == null \? null : \(\s*<p style=\{\{ margin: 0, fontFamily: SANS, fontSize: 14/u);
  });
});
