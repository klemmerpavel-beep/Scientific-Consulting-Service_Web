'use client';

import { useEffect } from 'react';

import { hashTarget } from './hash-target';

/**
 * Прокрутка к якорю адреса после загрузки экрана (решение Р-697).
 *
 * Экраны кабинета приходят потоком после скелета `app/cabinet/loading.tsx`:
 * в ответе сервера цель якоря лежит в скрытом куске, который переносится
 * сценарием, и браузер её не находит. «Пульс практики» по
 * `?period=7#pulse` открывался с начала страницы, а блок стоит на полторы
 * тысячи пикселей ниже. Здесь прокрутка повторяется, когда экран уже на
 * месте; отступ сверху задаёт `scroll-margin-top` самого блока. Без
 * сценария экран остаётся прежним: якорь просто не срабатывает.
 */
export default function HashScroll() {
  useEffect(() => {
    const id = hashTarget(window.location.hash);
    if (id !== null) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);
  return null;
}
