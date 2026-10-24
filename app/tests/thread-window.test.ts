/**
 * Окно переписки (решение Р-636): экран открывается на последних ста
 * сообщениях, ранние — ссылкой над лентой. Ветка не читается целиком ни на
 * одном экране переписки, а карточка работы берёт восемь последних строк
 * выборкой, а не срезом всей ветки.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { THREAD_WINDOW, THREAD_WINDOW_MAX, sliceWindow, threadWindow } from '../src/lib/cabinet/thread-window.ts';

const APP = path.join(import.meta.dirname, '..');
const read = (...parts: string[]) => readFileSync(path.join(APP, 'src', 'app', 'cabinet', ...parts), 'utf8');

describe('окно переписки (Р-636)', () => {
  it('окно из адреса — целое число окон от одного до предела', () => {
    assert.equal(threadWindow(undefined), THREAD_WINDOW);
    assert.equal(threadWindow(''), THREAD_WINDOW);
    assert.equal(threadWindow('abc'), THREAD_WINDOW);
    assert.equal(threadWindow('-5'), THREAD_WINDOW);
    assert.equal(threadWindow('100'), 100);
    assert.equal(threadWindow('150'), 200);
    assert.equal(threadWindow('200'), 200);
    assert.equal(threadWindow('999999'), THREAD_WINDOW_MAX);
  });

  it('лишнее сообщение выборки говорит о ранних и на экран не попадает', () => {
    const rows = [1, 2, 3, 4, 5];
    assert.deepEqual(sliceWindow(rows, 4), { messages: [2, 3, 4, 5], earlier: true });
    assert.deepEqual(sliceWindow(rows, 5), { messages: rows, earlier: false });
    assert.deepEqual(sliceWindow([], 5), { messages: [], earlier: false });
  });

  it('экраны переписки читают окно, а не всю ветку, и дают ссылку на ранние', () => {
    const screens: [string, RegExp][] = [
      ['projects/[code]/messages/page.tsx', /list(?:Messages|Internal)\(actor, project\.id\)/u],
      ['head/page.tsx', /listStaffThread\(actor, actor\.id\)/u],
      ['manage/team/[staffId]/page.tsx', /listStaffThread\(actor, staffId\)/u],
    ];
    for (const [file, whole] of screens) {
      const source = read(...file.split('/'));
      assert.doesNotMatch(source, whole, `${file}: ветка читается целиком`);
      assert.match(source, /\{ last: shown \+ 1 \}/u, `${file}: нет окна выборки`);
      assert.match(source, /earlierHref=/u, `${file}: нет ссылки на ранние сообщения`);
    }
  });

  it('карточка работы берёт восемь последних строк выборкой', () => {
    const source = read('projects', '[code]', 'page.tsx');
    assert.match(source, /listMessages\(actor, project\.id, \{ last: 8 \}\)/u);
    assert.doesNotMatch(source, /listMessages\([^)]*\)\)\.slice\(/u);
  });
});
