/**
 * Чем плашка работы в перечне отличается от соседних (решение Р-916).
 *
 * Аудит 15.11.2026, находка Н-7: у работ из книги заказов название равно
 * типу сопровождения, и три работы одного типа стояли у клиента тремя
 * одинаковыми плашками. Ответы владельца 15.11.2026: клиенту — тема
 * заголовком, тип строкой ниже; сотруднику — код работы только в перечне,
 * последним в строке фактов, приглушённым шрифтом.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { clientPlateHead, plateCode } from '../src/lib/cabinet/work-plate.ts';

const TYPE = 'Сопровождение диссертационного исследования';
const page = readFileSync(path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'projects', 'page.tsx'), 'utf8');

describe('заголовок плашки клиента (Р-916)', () => {
  it('название равно типу, тема есть — заголовком тема, тип строкой ниже', () => {
    assert.deepEqual(clientPlateHead({ title: TYPE, topic: ' Модели спроса на рынке труда ', type: TYPE }), {
      heading: 'Модели спроса на рынке труда',
      typeLine: TYPE,
      topicAsHeading: true,
    });
  });

  it('у работы своё название — оно и заголовок, тема остаётся строкой', () => {
    assert.deepEqual(clientPlateHead({ title: 'Диссертация Ивановой', topic: 'Модели спроса', type: TYPE }), {
      heading: 'Диссертация Ивановой',
      typeLine: TYPE,
      topicAsHeading: false,
    });
  });

  it('темы нет — заголовком тип, и вторично он не повторяется', () => {
    for (const topic of [null, '', '   ', TYPE]) {
      assert.deepEqual(clientPlateHead({ title: TYPE, topic, type: TYPE }), {
        heading: TYPE,
        typeLine: null,
        topicAsHeading: false,
      });
    }
  });

  it('две работы одного типа с разными темами получают разные заголовки', () => {
    const first = clientPlateHead({ title: TYPE, topic: 'Тема первая', type: TYPE });
    const second = clientPlateHead({ title: TYPE, topic: 'Тема вторая', type: TYPE });
    assert.notEqual(first.heading, second.heading);
  });
});

describe('код работы на плашке (Р-916)', () => {
  it('сотруднику — код, клиенту — нет', () => {
    assert.equal(plateCode('PD-2026-047', false), 'PD-2026-047');
    assert.equal(plateCode('PD-2026-047', true), null);
  });

  it('код стоит последним в строке фактов, помеченным элементом', () => {
    assert.match(page, /const code = plateCode\(project\.code, forClient\);/u);
    assert.match(
      page,
      /\{facts\.join\(' · '\)\}\s*\{code === null \? null : \(\s*<>\s*\{facts\.length === 0 \? '' : ' · '\}\s*<span data-work-code="">\{code\}<\/span>/u,
    );
  });

  it('пометка `data-work-code` есть только в перечне работ', () => {
    assert.equal((page.match(/data-work-code/gu) ?? []).length, 1);
  });
});

describe('плашка клиента в разметке (Р-916)', () => {
  it('ветка клиента: заголовок-ссылка, режется тремя строками, тип — приглушённой строкой', () => {
    assert.match(page, /const clientHead = forClient\s*\? clientPlateHead\(\{ title: project\.title, topic: project\.topic, type: project\.serviceType\.name \}\)\s*: null;/u);
    assert.match(page, /WebkitLineClamp: 3,[\s\S]{0,400}className="cab-stretch"[\s\S]{0,120}\{clientHead\.heading\}/u);
    assert.match(page, /\{clientHead\.typeLine === null \? null : \(\s*<Text muted size=\{13\}/u);
  });

  it('тема, ставшая заголовком, строкой ниже не повторяется', () => {
    assert.match(page, /project\.topic === null \|\| project\.topic === project\.title \|\| clientHead\?\.topicAsHeading === true \? null : \(/u);
  });
});
