/**
 * «Что подготовить» по виду работы (решение Р-563): перечень у каждого вида,
 * отметка «приложено» по названию материала, срок показа, памятка Word.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Actor } from '../src/lib/cabinet/access.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { download } from '../src/lib/cabinet/downloads.ts';
import { PREPARE_MEMO, prepareDocx } from '../src/lib/cabinet/memos.ts';
import { PREPARE_LISTS, prepareList, prepareOpen, prepareStatus } from '../src/lib/cabinet/prepare-lists.ts';
import { SERVICE_CODES } from '../src/lib/cabinet/service-checklists.ts';

/** Слова вне клиентского словаря — как в проверке экранов (Р-277). */
const OFF_DICTIONARY = [/(?<!\p{L})заказ/iu, /исполнител/iu, /(?<!\p{L})эксперт/iu, /(?<!\p{L})практик(?:а|и|е|у|ой)(?!\p{L})/iu];

describe('«Что подготовить» (Р-563)', () => {
  it('перечень у каждого вида работы; ключи и названия не повторяются', () => {
    for (const code of SERVICE_CODES) {
      const list = prepareList(code);
      assert.ok(list !== null, code);
      assert.ok(list.items.length >= 3, code);
      assert.equal(new Set(list.items.map((item) => item.key)).size, list.items.length, code);
      assert.equal(new Set(list.items.map((item) => item.title)).size, list.items.length, code);
    }
    assert.equal(prepareList('unknown'), null);
  });

  it('тексты — клиентским словарём', () => {
    for (const list of PREPARE_LISTS) {
      for (const text of [list.title, ...list.items.flatMap((item) => [item.title, item.note])]) {
        for (const pattern of OFF_DICTIONARY) assert.equal(pattern.test(text), false, text);
      }
    }
  });

  it('приложено — по названию материала без различий в регистре, «ё» и пробелах', () => {
    const list = prepareList('diploma')!;
    const status = prepareStatus(list, [
      { title: '  методические   указания кафедры ' },
      { title: 'Задание на выпускную работу (черновик)' },
      { title: 'Замечания научного руководителя' },
    ]);
    assert.deepEqual([...status.attached].sort(), ['guidelines', 'supervisor']);
    assert.equal(status.done, 2);
    assert.equal(status.total, list.items.length);
    const yo = prepareList('dissertation')!;
    assert.equal(prepareStatus(yo, [{ title: 'Текущий текст диссертации' }]).done, 1);
  });

  it('показ — пока работа идёт и первый этап не согласован', () => {
    assert.equal(prepareOpen({ status: 'ACTIVE', stages: [] }), true);
    assert.equal(prepareOpen({ status: 'ACTIVE', stages: [{ state: 'IN_PROGRESS' }, { state: 'PLANNED' }] }), true);
    assert.equal(prepareOpen({ status: 'ACTIVE', stages: [{ state: 'DONE' }, { state: 'IN_PROGRESS' }] }), false);
    assert.equal(prepareOpen({ status: 'PAUSED', stages: [] }), false);
    assert.equal(prepareOpen({ status: 'COMPLETED', stages: [] }), false);
  });

  it('памятка Word: все виды и пункты, выдаётся клиенту', async () => {
    const lines = readBrief(prepareDocx()).lines.map((line) => line.text);
    assert.equal(lines[0], PREPARE_MEMO.title);
    for (const list of PREPARE_LISTS) {
      assert.ok(lines.includes(list.title), list.title);
      for (const item of list.items) assert.ok(lines.some((line) => line.includes(item.title)), item.title);
    }
    const client: Actor = { id: 'c', role: 'CLIENT', status: 'ACTIVE', clientProfileId: 'p', expertNdaSignedAt: null };
    const file = await download(client, PREPARE_MEMO.key);
    assert.equal(file?.file, PREPARE_MEMO.file);
  });
});
