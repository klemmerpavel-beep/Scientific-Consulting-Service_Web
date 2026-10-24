/**
 * Цель якоря из адреса страницы (решение Р-697). Чистый расчёт для
 * `HashScroll.tsx`: на входе — `location.hash`, на выходе — `id` блока или
 * `null`, если якоря нет. Испорченная кодировка якоря экран не роняет:
 * `decodeURIComponent` на ней бросает исключение, а цели у такого адреса
 * всё равно нет.
 */
export function hashTarget(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
