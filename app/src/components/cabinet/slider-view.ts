/**
 * Какие карточки ленты видны (решения Р-491, Р-538). Чистый расчёт для
 * `CardSlider.tsx`: на входе — края ленты и карточек, на выходе — первая и
 * последняя карточки, видные целиком.
 *
 * Во время прокрутки целиком не видна ни одна карточка. Прежде вид тогда
 * сбрасывался в первую карточку: счётчик мигал «1 из N», «назад» гасла, а
 * второе «вперёд» посреди анимации листало назад. Теперь берётся карточка,
 * левый край которой ближе всего к левому краю ленты.
 */

export interface Edges {
  readonly left: number;
  readonly right: number;
}

export interface SliderView {
  readonly first: number;
  readonly last: number;
}

export function visibleSlides(box: Edges, slides: readonly Edges[]): SliderView {
  let first = -1;
  let last = -1;
  slides.forEach((rect, index) => {
    if (rect.left >= box.left - 2 && rect.right <= box.right + 2) {
      if (first === -1) first = index;
      last = index;
    }
  });
  if (first !== -1) return { first, last };
  let nearest = 0;
  slides.forEach((rect, index) => {
    if (Math.abs(rect.left - box.left) < Math.abs((slides[nearest]?.left ?? 0) - box.left)) nearest = index;
  });
  return { first: nearest, last: nearest };
}

export const sameView = (a: SliderView, b: SliderView): boolean => a.first === b.first && a.last === b.last;
