/**
 * Геометрия графиков.
 *
 * Порт `src/ui/charts.js` панели `nauchny-konsalting-panel` (293 строки,
 * SVG без единой внешней зависимости). Перенесены расчёты: «красивый»
 * потолок шкалы, деления, столбец со скруглённым верхом, сглаживание
 * ломаной, дуга кольца. Разметка вынесена в `components/cabinet/Charts.tsx`
 * и собирается элементами React, а не строкой: строковая сборка требовала
 * бы ручного экранирования имён клиентов, а забытое экранирование — это
 * не косметика, а внедрение разметки.
 *
 * Палитра графиков новых цветов не вводит: берётся существующая шкала
 * синего из таблицы токенов (решение Р-135). Библиотека графиков не
 * подключается — правило репозитория и требование дизайн-системы.
 */

/**
 * Шкала рядов: четыре значения с уверенным различием.
 *
 * Прежняя шкала перечисляла шесть оттенков синего подряд, и две соседние
 * ступени — `--pd-accent` `#14417A` и `--pd-accent-press` `#0F3260` —
 * различались меньше чем на три процента светлоты. Их не различает ни
 * дальтоник, ни нормальное зрение на проекторе, а смысл сегмента держался
 * ровно на этом различии.
 *
 * Оставлены три ступени синего с шагом светлоты около двадцати пунктов и
 * нейтральный серый: он отличается от синего не светлотой, а тоном, и
 * потому различим и при цветовой слепоте. Новых цветов не вводится —
 * все четыре берутся из таблицы токенов.
 *
 * Сверх четырёх рядов цвета повторяются, поэтому доля подписывается прямо
 * в сегменте: смысл не должен держаться на одной заливке.
 */
export const SERIES_COLORS = [
  'var(--pd-accent-deep)',
  'var(--pd-accent-soft)',
  'var(--pd-accent-edge)',
  'var(--pd-ink-muted)',
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}


/**
 * «Красивый» потолок шкалы: 1, 2, 2.5 или 5 на степень десяти.
 * Произвольный максимум дал бы деления вида «37 428», которые нечитаемы.
 */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Значения делений шкалы сверху вниз. */
export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => max * (1 - index / count));
}

/** Столбец со скруглённым только верхом: низ упирается в ось. */
export function topRoundedBar(x: number, y: number, w: number, h: number, r = 5): string {
  if (h <= 0) return '';
  const radius = Math.min(r, w / 2, h);
  return [
    `M${x} ${y + h}`,
    `L${x} ${y + radius}`,
    `Q${x} ${y} ${x + radius} ${y}`,
    `L${x + w - radius} ${y}`,
    `Q${x + w} ${y} ${x + w} ${y + radius}`,
    `L${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Сглаженная ломаная: Катмулл — Ром, переведённый в кубические Безье.
 * Прямые отрезки на помесячном ряде читаются как скачки, которых в данных нет.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return `M${points.map((point) => `${point.x} ${point.y}`).join(' L')}`;
  }
  let path = `M${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += `C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return path;
}

/** Дуга сегмента кольца от угла к углу (углы в радианах, ноль — сверху). */
export function donutArc(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): string {
  const large = to - from > Math.PI ? 1 : 0;
  const at = (radius: number, angle: number): string =>
    `${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`;
  return [
    `M${at(outer, from)}`,
    `A${outer} ${outer} 0 ${large} 1 ${at(outer, to)}`,
    `L${at(inner, to)}`,
    `A${inner} ${inner} 0 ${large} 0 ${at(inner, from)}`,
    'Z',
  ].join(' ');
}

/**
 * Краткая запись суммы для подписей на графике: «1,2 млн», «340 тыс».
 * На оси и над столбцом полная запись не помещается, а округление до
 * миллионов в таблице было бы недопустимо — там суммы полные.
 */
export function compactMoney(kopecks: bigint): string {
  const rubles = Number(kopecks) / 100;
  const abs = Math.abs(rubles);
  if (abs >= 1e6) {
    const value = rubles / 1e6;
    return `${value.toFixed(abs >= 1e7 ? 1 : 2).replace('.', ',').replace(/,?0+$/u, '')} млн`;
  }
  if (abs >= 1e3) return `${Math.round(rubles / 1e3)} тыс`;
  return String(Math.round(rubles));
}

/** Целые числа с разделителем разрядов — для подписей неденежных рядов. */
export function compactNumber(value: number, digits = 0): string {
  const factor = 10 ** digits;
  return (Math.round(value * factor) / factor).toLocaleString('ru-RU');
}
