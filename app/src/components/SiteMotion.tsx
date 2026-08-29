'use client';

import { useEffect } from 'react';

/**
 * Движение на страницах. Две вещи и ничего больше.
 *
 * 1. Раздел проявляется, когда до него доходит чтение: подъём на 14 пикселей
 *    за 520 мс. Внутри раздела, если его содержимое — ряд из трёх-шести
 *    одинаковых карточек, они выходят по очереди с шагом 55 мс.
 * 2. Волосяная полоса вверху показывает, сколько страницы прочитано.
 *
 * Первый экран не анимируется намеренно: это первое, что видит человек,
 * пришедший по объявлению, и появиться он должен мгновенно.
 *
 * На правовых документах появление разделов выключено: там шестнадцать
 * пунктов одного сплошного текста, и движение на каждом — шум, а не
 * ориентир. Полоса прочтения остаётся, на длинном документе она полезна.
 *
 * Скрытие объявлено только там, где выполняются сценарии (класс `pd-js` на
 * корне) и только при разрешённом движении. Если сценарии не выполнились
 * или человек попросил уменьшить движение, содержимое видно сразу.
 */

const STAGGER_MS = 55;
const STAGGER_MIN = 3;
const STAGGER_MAX = 6;

/** Доля окна, при заходе за которую раздел считается дошедшим до чтения */
const REVEAL_AT = 0.88;

/** Ряд одинаковых карточек, который стоит выпустить по очереди */
function staggerRow(section: Element): HTMLElement[] {
  const rows = section.querySelectorAll<HTMLElement>(':scope > div, :scope > ol, :scope > ul');
  for (const row of rows) {
    const kids = Array.from(row.children) as HTMLElement[];
    if (kids.length < STAGGER_MIN || kids.length > STAGGER_MAX) continue;
    const display = getComputedStyle(row).display;
    if (display !== 'grid' && display !== 'flex') continue;
    // Ряд однородных карточек, а не заголовок с подписью рядом
    if (new Set(kids.map((k) => k.tagName)).size !== 1) continue;
    return kids;
  }
  return [];
}

export default function SiteMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    root.classList.add('pd-js');

    const isDocument = !!document.querySelector('.doc-layout');
    const sections = isDocument
      ? []
      : Array.from(document.querySelectorAll<HTMLElement>('main > section')).slice(1);

    for (const section of sections) {
      section.classList.add('pd-rise');
      staggerRow(section).forEach((kid, i) => {
        kid.classList.add('pd-rise-kid');
        kid.style.transitionDelay = `${i * STAGGER_MS}ms`;
      });
    }

    const bar = document.createElement('div');
    bar.className = 'pd-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    const pending = new Set(sections);

    /**
     * Проверка идёт по положению кромки, а не по наблюдателю пересечений.
     * Наблюдатель не срабатывает на разделах, которые проскочили мимо окна
     * при переходе по якорю или прыжке в конец страницы, — и они остаются
     * невидимыми навсегда. Здесь такое невозможно: всё, что оказалось выше
     * нижней кромки окна, показывается, сколько бы резким ни был прыжок.
     */
    const sweep = () => {
      const h = window.innerHeight;
      for (const s of pending) {
        const r = s.getBoundingClientRect();
        if (r.top < h * REVEAL_AT || r.bottom < h) {
          s.classList.add('pd-in');
          pending.delete(s);
        }
      }
    };

    const drawBar = () => {
      const run = root.scrollHeight - root.clientHeight;
      const part = run > 0 ? Math.min(1, Math.max(0, root.scrollTop / run)) : 0;
      bar.style.transform = `scaleX(${part})`;
    };

    let ticking = 0;
    const tick = () => {
      ticking = 0;
      sweep();
      drawBar();
    };
    const onMove = () => {
      if (ticking) return;
      ticking = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      if (ticking) cancelAnimationFrame(ticking);
      bar.remove();
      root.classList.remove('pd-js');
    };
  }, []);

  return null;
}
