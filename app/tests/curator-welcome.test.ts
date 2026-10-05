/**
 * Первый вход куратора и «Сообщить руководителю» (требование Э-12,
 * решение Р-331): три строки и два правила блока; сообщить — не чаще раза
 * в сутки; письмо руководителю — с почтой куратора, без данных клиентов.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CURATOR_WELCOME, NDA_REQUEST_PAUSE_MS, ndaRequestOpen, ndaWaitingLetter } from '../src/lib/cabinet/curator-welcome.ts';

describe('блок первого входа куратора', () => {
  it('три строки: где ход, как сдать этап, как спросить менеджера (С-4)', () => {
    assert.equal(CURATOR_WELCOME.lines.length, 3);
    assert.match(CURATOR_WELCOME.lines[0], /«Назначенных работ»/u);
    assert.match(CURATOR_WELCOME.lines[1], /«Сдать этап менеджеру»/u);
    assert.equal(CURATOR_WELCOME.lines[2], 'Вопрос по заданию — письмом менеджеру работы, почта — в «О работе» на карточке работы.');
  });

  it('два правила работы', () => {
    assert.deepEqual(CURATOR_WELCOME.rules, [
      'Автор работы — клиент: вы разбираете, комментируете и редактируете его текст.',
      'Общение с клиентом — только в кабинете.',
    ]);
  });
});

describe('«Сообщить руководителю»', () => {
  const at = new Date(Date.UTC(2026, 9, 4, 12));
  it('не чаще раза в сутки', () => {
    assert.equal(ndaRequestOpen(null, at), true);
    assert.equal(ndaRequestOpen(new Date(at.getTime() - NDA_REQUEST_PAUSE_MS + 60_000), at), false);
    assert.equal(ndaRequestOpen(new Date(at.getTime() - NDA_REQUEST_PAUSE_MS), at), true);
  });

  it('письмо руководителю — ФИО и почта куратора, число работ', () => {
    const letter = ndaWaitingLetter({ fullName: 'Орлов Пётр Ильич', email: 'orlov@example.org' }, 2);
    assert.equal(letter.subject, 'Куратор Орлов Пётр Ильич ждёт договор поручения');
    assert.match(letter.body, /\(orlov@example\.org\)/u);
    assert.match(letter.body, /Назначенных действующих работ: 2\./u);
    assert.match(ndaWaitingLetter({ fullName: 'О', email: 'o@example.org' }, 0).body, /пока нет/u);
  });
});
