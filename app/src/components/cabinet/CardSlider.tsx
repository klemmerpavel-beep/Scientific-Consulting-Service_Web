'use client';

import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { sameView, visibleSlides } from './slider-view';

/**
 * Лента карточек со слайдером (решение Р-491).
 *
 * Рекомендации стояли сплошным перечнем: десять клиентов «Возврата» с
 * кнопками под каждым читались одним полотном. Теперь каждая рекомендация
 * — своя карточка, карточки блока идут лентой: на широком экране по две,
 * ниже 720 px ширины блока — по одной. Листается кнопками «назад» и
 * «вперёд», прокруткой и клавишами стрелок на ленте; счётчик называет,
 * какие карточки видны.
 *
 * Без сценария лента остаётся обычной горизонтальной прокруткой с
 * привязкой к карточкам: всё доступно, кнопки лишь не работают.
 */
export default function CardSlider({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const count = items.length;
  const track = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({ first: 0, last: 0 });
  // Счётчик объявляется читалке только после первого замера: до него он
  // показывает расчётное «1 из N», а не то, что видно (Р-538).
  const [measured, setMeasured] = useState(false);

  const measure = useCallback(() => {
    const el = track.current;
    if (el === null) return;
    const next = visibleSlides(
      el.getBoundingClientRect(),
      [...el.children].map((slide) => slide.getBoundingClientRect()),
    );
    // Посреди прокрутки целиком не видна ни одна карточка: берётся
    // ближайшая, а не первая; одинаковый вид не перерисовывается (Р-538).
    setView((prev) => (sameView(prev, next) ? prev : next));
    setMeasured(true);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (el === null) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      resize.disconnect();
    };
    // Число карточек меняется после отметки — вид пересчитывается (Р-538).
  }, [measure, count]);

  const go = (step: -1 | 1) => {
    const el = track.current;
    if (el === null) return;
    const slides = [...el.children] as HTMLElement[];
    const span = view.last - view.first + 1;
    const target = step === 1 ? Math.min(view.last + 1, count - 1) : Math.max(view.first - span, 0);
    const slide = slides[target];
    if (slide === undefined) return;
    el.scrollTo({ left: slide.offsetLeft - (slides[0]?.offsetLeft ?? 0) });
  };

  if (count === 0) return null;
  const all = view.first === 0 && view.last >= count - 1;
  const shown = view.first === view.last ? `${view.first + 1}` : `${view.first + 1}–${view.last + 1}`;

  return (
    <div className="cab-slider">
      {count < 2 ? null : (
        <div className="cab-slider-nav">
          <span className="cab-slider-count" aria-live={measured ? 'polite' : 'off'}>
            {`${shown} из ${count}`}
          </span>
          <button
            type="button"
            className="cab-btn cab-slider-step"
            aria-label="Предыдущие карточки"
            disabled={view.first === 0}
            onClick={() => go(-1)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="cab-btn cab-slider-step"
            aria-label="Следующие карточки"
            disabled={all || view.last >= count - 1}
            onClick={() => go(1)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
      <ul
        ref={track}
        className={count === 1 ? 'cab-slider-track cab-slider-one' : 'cab-slider-track'}
        aria-label={label}
        tabIndex={0}
      >
        {items.map((item, index) => (
          // Ключ карточки — её собственный: после отметки карточки не
          // перенимают состояние соседей (Р-538).
          <li key={isValidElement(item) && item.key !== null ? item.key : index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
