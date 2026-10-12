/**
 * Документ → черновик «Новой заявки» клиента (решение Р-559): те же поля,
 * что клиент заполняет руками, пределы полей заявки, заметки клиентским
 * словарём.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseBrief } from '../src/lib/cabinet/brief/parse.ts';
import { readBrief } from '../src/lib/cabinet/brief/read.ts';
import { requestDraftFromBrief } from '../src/lib/cabinet/brief/request-draft.ts';
import { variantFields } from '../src/lib/cabinet/brief/work-rows.ts';
import { SAMPLES, makeDocx } from './helpers/make-docx.ts';

const TYPES = [
  { code: 'dissertation', name: 'Сопровождение диссертационного исследования' },
  { code: 'article', name: 'Научные публикации и патентные материалы' },
  { code: 'diploma', name: 'Сопровождение выпускной квалификационной работы' },
];

const parse = (blocks: Parameters<typeof makeDocx>[0]) => parseBrief(readBrief(makeDocx(blocks)).lines);
const draftOf = (blocks: Parameters<typeof makeDocx>[0], variant: number | null = null) => {
  const brief = parse(blocks);
  return requestDraftFromBrief(brief, variantFields(brief, variant), TYPES);
};

/** Слова вне клиентского словаря — как в проверке экранов (Р-277). */
const OFF_DICTIONARY = [/(?<!\p{L})заказ/iu, /исполнител/iu, /(?<!\p{L})эксперт/iu, /(?<!\p{L})практик(?:а|и|е|у|ой)(?!\p{L})/iu];

describe('черновик заявки клиента из документа (Р-559)', () => {
  it('анкета-таблица: поля заявки, тип по названию, руководитель — своим полем', () => {
    const { values, notes } = draftOf([
      {
        table: [
          ['ФИО автора', 'Иванова Анна Сергеевна'],
          ['Вид работы', 'Сопровождение выпускной квалификационной работы'],
          ['Тема', 'Анализ рынка'],
          ['Цель работы', 'Оценить рынок.'],
          ['ФИО научного руководителя', 'Петров П. П.'],
          ['Вуз или организация', 'Университет'],
          ['Направление или научная специальность', '38.04.01 Экономика'],
          ['Срок', 'до 15 июня 2027'],
        ],
      },
    ]);
    assert.deepEqual(values, {
      applicantName: 'Иванова Анна Сергеевна',
      supervisorName: 'Петров П. П.',
      need: 'Сопровождение выпускной квалификационной работы',
      topic: 'Анализ рынка',
      deadline: 'до 15 июня 2027',
      message: 'Цель: Оценить рынок.',
      organization: 'Университет',
      speciality: '38.04.01 Экономика',
    });
    assert.deepEqual(notes, []);
  });

  it('исходные данные ВКР: тип по шифру — с пометкой; задачи — в «Что требуется»', () => {
    const { values, notes } = draftOf(SAMPLES.variant);
    assert.equal(values.need, 'Сопровождение выпускной квалификационной работы');
    assert.ok(notes.some((note) => note.startsWith('Тип сопровождения определён по тексту документа')));
    assert.match(values.message ?? '', /^Цель: Обосновать замену/u);
    assert.match(values.message ?? '', /Задачи:\n1\. Проанализировать/u);
    assert.equal(values.organization, 'Горный университет');
  });

  it('тип не распознан — пусто и заметка; длинная тема — пусто и заметка', () => {
    const { values, notes } = draftOf([`Тема работы: ${'Очень длинная тема '.repeat(30)}`]);
    assert.equal(values.need, '');
    assert.equal(values.topic, '');
    assert.ok(notes.some((note) => note.startsWith('Тип сопровождения не распознан')));
    assert.ok(notes.some((note) => note.startsWith('«Тема» длиннее 500 знаков')), 'длинную тему отсекает разбор');
  });

  it('несколько вариантов: без выбора темы нет, с выбором — тема и цель варианта', () => {
    const blocks = [
      'Вариант 1. Первая тема',
      'Цель работы: Первая цель.',
      'Вариант 2. Вторая тема',
      'Тема работы: Уточнённая вторая тема',
      'Цель работы: Вторая цель.',
      'Университет: Вуз',
    ];
    assert.equal(draftOf(blocks).values.topic, '');
    const second = draftOf(blocks, 1).values;
    assert.equal(second.topic, 'Уточнённая вторая тема');
    assert.equal(second.message, 'Цель: Вторая цель.');
    assert.equal(second.organization, 'Вуз');
  });

  it('заметки — клиентским словарём', () => {
    const texts = [
      ...draftOf([`Тема работы: ${'т'.repeat(600)}`]).notes,
      ...draftOf(SAMPLES.variant).notes,
      ...draftOf(SAMPLES.thesis).notes,
    ];
    assert.ok(texts.length > 0);
    for (const text of texts) {
      for (const pattern of OFF_DICTIONARY) assert.equal(pattern.test(text), false, text);
    }
  });
});
