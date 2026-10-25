'use client';

import { useEffect } from 'react';

/**
 * Признак исхода в адресе — один раз (решение Р-725).
 *
 * Действие возвращает на экран с признаком (`?done=approved`), экран
 * показывает строку исхода, а этот блок убирает признак из адреса, не
 * перезагружая экран. Обновление страницы строку не повторяет, и ссылка,
 * скопированная из адреса, исхода не несёт. Якорь остаётся. Без сценария
 * признак остаётся в адресе — строка просто повторится при обновлении.
 */
export default function DropFlag({ names }: { names: readonly string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const present = names.filter((name) => url.searchParams.has(name));
    if (present.length === 0) return;
    for (const name of present) url.searchParams.delete(name);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [names]);
  return null;
}
