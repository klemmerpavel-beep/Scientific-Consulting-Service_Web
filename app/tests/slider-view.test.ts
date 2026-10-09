/**
 * Лента карточек «Рекомендаций» (решения Р-491, Р-538): какие карточки
 * видны — в том числе посреди прокрутки, когда целиком не видна ни одна.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { sameView, visibleSlides } from '../src/components/cabinet/slider-view.ts';

const box = { left: 0, right: 600 };
// Карточки по 290 px с промежутком 20: по две на ленту.
const slides = (offset: number) =>
  Array.from({ length: 5 }, (_, i) => ({ left: i * 310 - offset, right: i * 310 + 290 - offset }));

describe('лента карточек: видимые карточки (Р-538)', () => {
  it('в покое — карточки, видные целиком', () => {
    assert.deepEqual(visibleSlides(box, slides(0)), { first: 0, last: 1 });
    assert.deepEqual(visibleSlides(box, slides(620)), { first: 2, last: 3 });
  });

  it('посреди прокрутки — ближайшая карточка, а не первая', () => {
    // Лента едет от пары 2–3 к паре 4: целиком не видна ни одна.
    const view = visibleSlides(box, slides(800));
    assert.notDeepEqual(view, { first: 0, last: 0 });
    assert.deepEqual(view, { first: 3, last: 3 });
    // Карточка шире ленты: тоже не первая.
    assert.deepEqual(visibleSlides({ left: 0, right: 200 }, slides(615)), { first: 2, last: 2 });
  });

  it('одинаковый вид не считается новым', () => {
    assert.ok(sameView({ first: 1, last: 2 }, { first: 1, last: 2 }));
    assert.ok(!sameView({ first: 1, last: 2 }, { first: 1, last: 1 }));
  });

  it('лента пересчитывается при смене числа карточек, ключ карточки — её собственный', () => {
    const code = readFileSync(path.join(import.meta.dirname, '..', 'src', 'components', 'cabinet', 'CardSlider.tsx'), 'utf8');
    assert.match(code, /visibleSlides\(/u);
    assert.match(code, /\}, \[measure, count\]\);/u);
    assert.doesNotMatch(code, /<li key=\{index\}>/u);
    assert.match(code, /aria-live=\{measured \? 'polite' : 'off'\}/u);
  });
});
