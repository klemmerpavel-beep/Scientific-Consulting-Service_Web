/**
 * Экран этапа клиента: на «Ждём ваших данных» ответ можно и словами,
 * «напишите менеджеру» ведёт в переписку, на этапах с ходом практики нет
 * призыва приложить материал (решение Р-750; Р-183, Р-206, Р-316, Р-728).
 *
 * Прежде ссылок на экране, кроме названия работы, не было: ответить
 * текстом клиент шёл на карточку и листал к полю переписки; на «Не начат»
 * и «В работе» читал «приложите первый», хотя от него ничего не ждали.
 *
 * Запуск: node --test tests/client-stage-answer.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CLOSED_FOR_PARTY, STAGE_DONE_FOR_PARTY } from '../src/lib/cabinet/access.ts';
import {
  CLIENT_ANSWER_LEAD,
  WRITE_MANAGER,
  clientEmptyMaterials,
  clientMessagesHref,
} from '../src/lib/cabinet/stage-state.ts';

const APP = path.resolve(import.meta.dirname, '..');
const source = (file: string) => readFileSync(path.join(APP, file), 'utf8');

describe('тексты клиента (Р-750)', () => {
  it('пустой перечень: «приложите первый» — только на «Ждём ваших данных»', () => {
    assert.equal(clientEmptyMaterials('AWAITING_CLIENT', true), 'Материалов по этапу пока нет — приложите первый.');
    for (const state of ['NOT_STARTED', 'IN_PROGRESS'] as const) {
      assert.equal(clientEmptyMaterials(state, true), 'Материалов по этапу пока нет. Сейчас от вас ничего не требуется.');
    }
    for (const state of ['IN_APPROVAL', 'DONE'] as const) {
      assert.doesNotMatch(clientEmptyMaterials(state, true), /приложите/u, state);
    }
    assert.equal(clientEmptyMaterials('AWAITING_CLIENT', false), 'Материалов по этапу пока нет.');
  });

  it('строка ответа и ссылка в поле переписки работы', () => {
    assert.equal(`${CLIENT_ANSWER_LEAD}написать менеджеру.`, 'Ответ можно приложить файлом ниже или написать менеджеру.');
    assert.equal(clientMessagesHref('PD-2026-047'), '/cabinet/projects/PD-2026-047/messages#body');
  });

  it('оба отказа кончаются «напишите менеджеру» — хвост ставится ссылкой', () => {
    for (const refusal of [CLOSED_FOR_PARTY, STAGE_DONE_FOR_PARTY]) assert.ok(refusal.endsWith(WRITE_MANAGER), refusal);
  });
});

describe('экран этапа (Р-750)', () => {
  const page = source('src/app/cabinet/stages/[id]/page.tsx');

  it('строка ответа — клиенту действующей работы на «Ждём ваших данных», пока он ничего не приложил', () => {
    assert.match(
      page,
      /const clientAnswer = actor\.role === 'CLIENT' && live && state === 'AWAITING_CLIENT';/u,
    );
    assert.match(page, /\{CLIENT_ANSWER_LEAD\}\s*<a href=\{clientMessagesHref\(stage\.project\.code\)\}>\s*написать менеджеру/u);
  });

  it('новый блок не заводится: строка — в блоке описания, без него — в «Материалах и версиях»', () => {
    // Условие, при котором блока описания нет, — то же, что у stageDescribed.
    assert.match(
      page,
      /const stageDescribed =\s*\(stage\.summary \?\? ''\)\.trim\(\) !== '' \|\| stage\.blockedReason !== null \|\| lastReturn !== undefined \|\| uploadedByClient !== null;/u,
    );
    assert.match(
      page,
      /\) : \(stage\.summary \?\? ''\)\.trim\(\) === '' &&\s*stage\.blockedReason === null &&\s*lastReturn === undefined &&\s*uploadedByClient === null \? null : \(/u,
    );
    assert.match(page, /\{stage\.blockedReason\}\s*<\/Notice>\s*<\/div>\s*\)\}\s*\{answerLine\}\s*<\/Block>/u);
    assert.match(page, /\{stageDescribed \? null : answerLine\}/u);
    assert.equal((page.match(/\{answerLine\}|: answerLine\}/gu) ?? []).length, 2, 'строка выводится в двух взаимоисключающих местах');
  });

  it('пустой перечень клиенту — по состоянию этапа; куратору и практике — прежнее правило', () => {
    assert.match(page, /actor\.role === 'CLIENT'\s*\? clientEmptyMaterials\(state, mayUpload\)\s*: mayUpload && !\(curatorView && curatorLine\.idle\)/u);
  });

  it('отказ «…напишите менеджеру» — клиенту ссылкой, куратору текстом', () => {
    assert.match(
      page,
      /actor\.role === 'CLIENT' && refusal\.endsWith\(WRITE_MANAGER\) \? \(\s*<>\s*\{refusal\.slice\(0, -WRITE_MANAGER\.length\)\}\s*<a href=\{clientMessagesHref\(stage\.project\.code\)\}>/u,
    );
  });

  it('поле переписки работы называется body', () => {
    assert.match(source('src/app/cabinet/projects/[code]/messages/page.tsx'), /<Field\s+label=\{form\.label\}\s+name="body"/u);
  });
});
