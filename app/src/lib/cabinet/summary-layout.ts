/**
 * Раскладка «Сводки» руководителя (план владельца по образцу, пункт К-5,
 * решение Р-595): какие плашки показывать и в каком порядке.
 *
 * Настраиваются:
 * - восемь плашек сетки «Сводки» (Р-576) — порядок и показ;
 * - две полосы во всю ширину — «Разбор практики» (К-2) и «Пульс практики»
 *   (К-1) — только показ: их место над сеткой задано смыслом.
 *
 * Не настраиваются ответ экрана, «Требует внимания» и «На этой неделе»: на
 * них ведут число в ответе и группы «Разбора» (Р-210, Р-586), скрыть их —
 * оставить ссылки в пустоту.
 *
 * Здесь только разбор значения, без базы: сохранённая раскладка читается
 * снисходительно. Неизвестные ключи отбрасываются, недостающие плашки
 * встают в конец в порядке по умолчанию и показываются — новая плашка не
 * пропадёт у того, кто настроил «Сводку» до неё.
 */

export const SUMMARY_PLATES = [
  { key: 'team', label: 'Команда' },
  { key: 'load', label: 'Чем занята практика' },
  { key: 'months', label: 'Заказы по месяцам' },
  { key: 'demand', label: 'Что заказывают' },
  { key: 'deadlines', label: 'Ближайшие сроки' },
  { key: 'money', label: 'Деньги' },
  { key: 'works', label: 'Ведутся сейчас' },
  { key: 'leads', label: 'Заявки' },
] as const;

export const SUMMARY_BANDS = [
  { key: 'review', label: 'Разбор практики' },
  { key: 'pulse', label: 'Пульс практики' },
] as const;

export type PlateKey = (typeof SUMMARY_PLATES)[number]['key'];
export type BandKey = (typeof SUMMARY_BANDS)[number]['key'];
export type LayoutKey = PlateKey | BandKey;

export interface SummaryLayout {
  /** Все плашки в порядке показа — и видимые, и скрытые. */
  readonly order: readonly PlateKey[];
  /** Скрытые плашки и полосы. */
  readonly hidden: readonly LayoutKey[];
}

const PLATE_KEYS: readonly PlateKey[] = SUMMARY_PLATES.map((plate) => plate.key);
const LAYOUT_KEYS: readonly LayoutKey[] = [...PLATE_KEYS, ...SUMMARY_BANDS.map((band) => band.key)];

const isPlate = (value: unknown): value is PlateKey => typeof value === 'string' && (PLATE_KEYS as readonly string[]).includes(value);
const isKey = (value: unknown): value is LayoutKey => typeof value === 'string' && (LAYOUT_KEYS as readonly string[]).includes(value);

export const DEFAULT_LAYOUT: SummaryLayout = { order: PLATE_KEYS, hidden: [] };

/** Раскладка из сохранённого значения; всё непонятное — по умолчанию. */
export function parseLayout(value: unknown): SummaryLayout {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_LAYOUT;
  const raw = value as { order?: unknown; hidden?: unknown };
  const listed = Array.isArray(raw.order) ? raw.order.filter(isPlate) : [];
  const order = [...new Set(listed)];
  for (const key of PLATE_KEYS) if (!order.includes(key)) order.push(key);
  const hidden = Array.isArray(raw.hidden) ? [...new Set(raw.hidden.filter(isKey))] : [];
  return { order, hidden };
}

/** Раскладка по умолчанию — её не хранят: в базе остаётся пусто. */
export function isDefaultLayout(layout: SummaryLayout): boolean {
  return layout.hidden.length === 0 && layout.order.every((key, index) => key === PLATE_KEYS[index]);
}

export interface LayoutChoice {
  readonly key: string;
  /** Место из формы, 1…8; неразборчивое — прежнее место. */
  readonly place: number;
  /** Место до правки — то, что форма показала; нет — место по умолчанию. */
  readonly was?: number;
  readonly shown: boolean;
}

/**
 * Раскладка из формы экрана настройки. Места могут совпасть: плашку
 * поставили на место 1, а прежняя плашка места 1 осталась на нём. Тогда
 * передвинутая встаёт на выбранное место, остальные сдвигаются, сохраняя
 * прежний порядок, — как при перестановке в списке.
 */
export function layoutFromChoices(choices: readonly LayoutChoice[]): SummaryLayout {
  const byKey = new Map(choices.filter((choice) => isKey(choice.key)).map((choice) => [choice.key as LayoutKey, choice]));
  const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
  const order = [...PLATE_KEYS]
    .map((key, index) => {
      const choice = byKey.get(key);
      const was = finite(choice?.was) ? choice.was : index + 1;
      const place = finite(choice?.place) ? choice.place : was;
      // Как перестановка в списке: поднятая плашка встаёт перед той, что
      // занимала место, опущенная — после неё.
      const rank = place < was ? place - 0.5 : place > was ? place + 0.5 : place;
      return { key, rank, was };
    })
    .sort((a, b) => a.rank - b.rank || a.was - b.was)
    .map((item) => item.key);
  // Флажок формы шлётся только отмеченным: строка ключа есть, а флажка
  // нет — плашка или полоса скрыта.
  const hidden = LAYOUT_KEYS.filter((key) => byKey.has(key) && !byKey.get(key)!.shown);
  return { order, hidden };
}

/** Видимые плашки в порядке показа. */
export function visiblePlates(layout: SummaryLayout): PlateKey[] {
  return layout.order.filter((key) => !layout.hidden.includes(key));
}

export function isShown(layout: SummaryLayout, key: LayoutKey): boolean {
  return !layout.hidden.includes(key);
}
