/**
 * Документ → черновик формы «Нового заказа» (решение Р-556).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orderDraftFromBrief } from '../src/lib/cabinet/brief/order-draft.ts';
import { parseBrief } from '../src/lib/cabinet/brief/parse.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { SAMPLES, makeDocx } from './helpers/make-docx.ts';

const TYPES = [
  { id: 't-dis', code: 'dissertation', name: 'Сопровождение диссертационного исследования' },
  { id: 't-art', code: 'article', name: 'Научные публикации и патентные материалы' },
  { id: 't-dip', code: 'diploma', name: 'Сопровождение выпускной квалификационной работы' },
];

const fromDocx = (blocks: Parameters<typeof makeDocx>[0]) =>
  orderDraftFromBrief(parseBrief(readBrief(makeDocx(blocks)).lines), TYPES);

describe('черновик нового заказа из документа (Р-556)', () => {
  it('анкета-таблица: поля формы, вид по названию, даты — в формате поля', () => {
    const { values, notes } = fromDocx([
      {
        table: [
          ['ФИО заказчика', 'Иванова Анна Сергеевна'],
          ['Почта', 'anna@example.org'],
          ['Вид работы', 'Сопровождение выпускной квалификационной работы'],
          ['Тема', 'Анализ рынка'],
          ['Цель работы', 'Оценить рынок.'],
          ['ФИО научного руководителя', 'Петров П. П.'],
          ['Вуз или организация', 'Университет'],
          ['Дата заказа', '01.10.2026'],
          ['Срок', '15.06.2027'],
        ],
      },
    ]);
    assert.equal(values.customer, 'Иванова Анна Сергеевна');
    assert.equal(values.serviceTypeId, 't-dip');
    assert.equal(values.title, 'Сопровождение выпускной квалификационной работы');
    assert.equal(values.topic, 'Анализ рынка');
    assert.equal(values.summary, 'Цель: Оценить рынок.\nНаучный руководитель: Петров П. П.');
    assert.equal(values.university, 'Университет');
    assert.equal(values.orderedOn, '2026-10-01');
    assert.equal(values.dueOn, '2027-06-15');
    assert.deepEqual(notes, []);
    assert.equal('cost' in values, false, 'деньги из документа не берутся');
  });

  it('исходные данные ВКР: вид по шифру — с пометкой, вуз одной строкой', () => {
    const { values, notes } = fromDocx(SAMPLES.variant);
    assert.equal(values.serviceTypeId, 't-dip');
    assert.ok(notes.some((note) => note.startsWith('Вид работы определён по тексту')));
    assert.equal(values.speciality, '15.04.02 Технологические машины и оборудование');
    assert.equal(values.university, 'Горный университет');
    assert.match(values.summary ?? '', /^Цель: Обосновать замену/u);
    assert.match(values.summary ?? '', /Задачи:\n1\. Проанализировать/u);
  });

  it('вид не распознан — пусто и заметка; дата не читается — пусто и заметка', () => {
    const { values, notes } = fromDocx(['Тема: Нечто', 'Срок: когда-нибудь']);
    assert.equal(values.serviceTypeId, '');
    assert.equal(values.dueOn, '');
    assert.ok(notes.includes('Вид работы не распознан — выберите вручную.'));
    assert.ok(notes.some((note) => note.startsWith('«Срок»: дата «когда-нибудь»')));
  });

  it('суть задачи сверх 2000 знаков: не влезшее называется, а не обрезается', () => {
    // Цель и задачи каждая в своём пределе (1000 и 1600), вместе — больше 2000.
    const goal = `Цель работы: ${'обосновать решение '.repeat(45)}`.trim();
    const tasks = Array.from({ length: 10 }, (_, index) => `Задача ${index + 1}: ${'подробное описание '.repeat(7)}`.trim());
    const { values, notes } = fromDocx([goal, 'Задачи:', ...tasks, 'Научный руководитель: Иванов И. И.']);
    assert.ok((values.summary ?? '').length <= 2000);
    assert.match(values.summary ?? '', /Научный руководитель/u);
    assert.ok(notes.some((note) => note.startsWith('В «Суть задачи» не поместилось: «Задачи»')));
  });
});
