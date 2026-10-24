'use client';

import { useEffect } from 'react';

/**
 * Закреплённая шапка длинных страниц (решение Р-609).
 *
 * На страницах, где шапка макета помечена `data-pd-stick` («Аспирантам»,
 * «Студентам», «Компаниям», «Экспертам» — все длиннее семи экранов), после
 * ухода первого раздела за верхний край закрепляется компактная полоса:
 * вордмарк и главная кнопка шапки (`data-pd-stick-cta`). Полоса собирается
 * из копий этих двух ссылок, поэтому их оформление, наведение и путь
 * остаются макетными: «Оставить заявку» открывает окно заявки, как кнопка
 * шапки (Р-484), «Заполнить анкету» ведёт к анкете.
 *
 * Монтируется окном заявки (`RequestDialog`), а не общим макетом: полоса
 * существует ради кнопки заявки, а `layout.tsx` и `globals.css` входят в
 * отпечаток снимков кабинета (Р-214) — правка там требовала бы пересъёмки
 * кабинета, который полоса не затрагивает.
 *
 * Высота 64 px и линия 1 px цвета рамки, фон белый непрозрачный: при
 * прозрачности .92 заголовки разделов просвечивали под вордмарком. Слой 20:
 * над разделами (до 9), под кнопкой замечаний (30/31), полосой прочтения
 * (40), окнами (43—45) и уведомлением о cookies (50). Появление — сдвиг
 * сверху за 180 мс; при уменьшенном движении переход снимает общее правило
 * `globals.css`, сама полоса остаётся — это навигация, а не движение. Без
 * сценариев полосы нет, шапка остаётся обычной. Скрытая полоса недоступна
 * ни фокусу, ни чтению с экрана (`visibility`).
 *
 * Копии видны при любых правилах страницы: на «Экспертам» до 768 px кнопка
 * шапки скрыта классом `.ex-headcta`, и её копия пропадала вместе с ней
 * (Р-612). До 430 px кнопка полосы — 12 px с полями 16 px, как кнопки шапок
 * «Студентам» и «Компаниям».
 *
 * Отступ якорей 80 px — с `!important`: разделы макетов несут встроенный
 * `scroll-margin-top: 24px`, он перебивал правило, и при переходе по якорю
 * начало раздела вставало под полосу (на «Экспертам» «Заполнить анкету»
 * прятала метку и верх заголовка анкеты, Р-623).
 */

const CSS = `
.pd-stick{position:fixed;inset:0 0 auto 0;z-index:20;background:#FFFFFF;border-bottom:1px solid #E3E7EC;transform:translateY(-100%);visibility:hidden;transition:transform 180ms cubic-bezier(.2,0,.2,1),visibility 0s linear 180ms}
.pd-stick.pd-stick-on{transform:none;visibility:visible;transition:transform 180ms cubic-bezier(.2,0,.2,1),visibility 0s}
.pd-stick-row{max-width:1220px;height:64px;margin:0 auto;padding:0 30px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.pd-stick-row>a:first-child{font-size:21px!important}
.pd-stick-row>a{display:inline-flex!important;white-space:nowrap}
@media (max-width:430px){.pd-stick-row>a:last-child{padding:12px 16px!important;font-size:12px!important}}
@media (max-width:480px){.pd-stick-row{padding:0 20px}}
.pd-has-stick [id]{scroll-margin-top:80px!important}
@media print{.pd-stick{display:none}}
`;

export default function StickyBar() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('header[data-pd-stick]');
    const first = document.querySelector<HTMLElement>('main > section');
    const mark = head?.querySelector<HTMLAnchorElement>('a[aria-label]');
    const cta = head?.querySelector<HTMLAnchorElement>('a[data-pd-stick-cta]');
    if (!head || !first || !mark || !cta) return;

    // Своя область навигации: содержимое страницы вне областей axe считает
    // ошибкой (region), а вторая «шапка» (banner) была бы повтором.
    const bar = document.createElement('nav');
    bar.className = 'pd-stick';
    bar.setAttribute('aria-label', 'Быстрый переход');
    const row = document.createElement('div');
    row.className = 'pd-stick-row';
    for (const link of [mark, cta]) {
      const copy = link.cloneNode(true) as HTMLElement;
      // Копия не повторяет идентификаторы и метку шапки.
      copy.removeAttribute('id');
      copy.removeAttribute('data-pd-stick-cta');
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      row.appendChild(copy);
    }
    bar.appendChild(row);
    document.body.appendChild(bar);
    const root = document.documentElement;
    root.classList.add('pd-has-stick');

    let shown = false;
    let ticking = 0;
    const tick = () => {
      ticking = 0;
      const on = first.getBoundingClientRect().bottom < 0;
      if (on === shown) return;
      shown = on;
      bar.classList.toggle('pd-stick-on', on);
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
      root.classList.remove('pd-has-stick');
    };
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
