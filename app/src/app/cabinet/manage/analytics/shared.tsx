import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import AnalyticsTabs from '../../../../components/cabinet/AnalyticsTabs';
import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  Card,
  Disclosure,
  Heading,
  Mono,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TableCard,
  Text,
  Tile,
  Tiles,
  plural,
} from '../../../../components/cabinet/ui';
import { can, type Actor } from '../../../../lib/cabinet/access';
import { loadRows } from '../../../../lib/cabinet/analytics/data';
import type { ProjectRow } from '../../../../lib/cabinet/analytics/metrics';
import { currentActor } from '../../../../lib/cabinet/session';

/**
 * Общая часть вкладок аналитики: проверка доступа, выборка и каркас.
 *
 * Проверка стоит здесь, а не в разметке каждой вкладки: забытая проверка
 * на одной из шести страниц открыла бы всю практику. Выборка идёт через
 * `loadRows`, который сам спрашивает разрешение — то есть отказ наступит
 * даже если этот каркас обойти.
 */
export async function analyticsScreen(): Promise<{ actor: Actor; rows: ProjectRow[] }> {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'ANALYTICS_VIEW')) redirect('/cabinet/projects');
  return { actor, rows: await loadRows(actor) };
}

export function Frame({
  actor,
  current,
  title,
  lead,
  children,
}: {
  actor: Actor;
  current: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <Shell actor={actor} current="/cabinet/manage/analytics">
      <Mono>Аналитика практики</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {title}
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        {lead}
      </Text>
      <AnalyticsTabs current={current} />
      {children}
    </Shell>
  );
}

// Плитки живут в общем модуле оформления; вкладки берут их отсюда.
export { Tile, Tiles };

// Стили таблиц живут в общем модуле оформления; вкладки берут их отсюда
// под прежними именами.
export { TABLE_CELL as cell, TABLE_HEAD as head, TABLE_NUM as num };

/**
 * Карточка графика: заголовок, сам график, под ним — пояснение расчёта и,
 * при надобности, свёртка с числами.
 *
 * График объявлен картинкой (`role="img"`), и читалка получает от него
 * только название: подсказки над столбцами до неё не доходят. Поэтому
 * каждый вывод обязан существовать и текстом. Там, где числа не вынесены
 * в легенду или в таблицу рядом, они кладутся сюда — свёрткой, чтобы не
 * удлинять экран (решение Р-175).
 */
export function ChartCard({
  title,
  note,
  numbers,
  children,
}: {
  title: string;
  note?: string;
  /** Те же значения текстом: таблица под свёрткой. */
  numbers?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 28 }}>
      <Heading level={2} style={{ marginBottom: 12 }}>
        {title}
      </Heading>
      {children}
      {note === undefined ? null : (
        <Text muted size={13} style={{ marginTop: 12 }}>
          {note}
        </Text>
      )}
      {numbers === undefined ? null : (
        <Disclosure title="Числа" style={{ marginTop: 16 }}>
          {numbers}
        </Disclosure>
      )}
    </Card>
  );
}

/**
 * Длинная таблица: первые строки на виду, остаток — под свёрткой.
 *
 * Таблицы аналитики шли целиком: двадцать клиентов давали тысячу триста
 * пикселей, а дебиторка была обрезана на сороковой строке молча — плитка
 * выше честно называла полное число работ с остатком, и расхождение никак
 * не объяснялось. Первых десяти строк довольно, чтобы увидеть главное:
 * перечни отсортированы по убыванию величины. Остаток никуда не девается —
 * он раскрывается на месте, без ухода на другой экран (решение Р-176).
 *
 * Строки передаются готовыми: у каждой таблицы свои колонки, и сводить их
 * к общему описанию значило бы завести язык описания таблиц ради четырёх
 * применений.
 */
export function LongTable({
  label,
  columns,
  rows,
  visible = 10,
  minWidth = 720,
  caption,
}: {
  label: string;
  /** Строка заголовков: те же `<th scope="col">`, что и были. */
  columns: ReactNode;
  rows: readonly ReactNode[];
  visible?: number;
  minWidth?: number;
  caption?: ReactNode;
}) {
  const shown = rows.slice(0, visible);
  const rest = rows.slice(visible);
  const style = { width: '100%', borderCollapse: 'collapse' as const, minWidth };

  return (
    <>
      <TableCard label={label}>
        <table style={style}>
          {caption === undefined ? null : caption}
          <thead>{columns}</thead>
          <tbody>{shown}</tbody>
        </table>
      </TableCard>
      {rest.length === 0 ? null : (
        <Disclosure
          title={`Ещё ${rest.length} ${plural(rest.length, 'строка', 'строки', 'строк')}`}
          style={{ marginTop: 12 }}
        >
          <table style={style}>
            <thead>{columns}</thead>
            <tbody>{rest}</tbody>
          </table>
        </Disclosure>
      )}
    </>
  );
}

/** Доля в процентах, без ложной точности. */
export function share(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** Срок в днях словами, с учётом оценки снизу при цензурировании. */
export function cycleLabel(estimate: {
  median: number | null;
  lower: number | null;
  observations: number;
}): string {
  if (estimate.observations === 0) return 'нет наблюдений';
  if (estimate.median !== null) return `${estimate.median} дн.`;
  return estimate.lower === null ? 'нет оценки' : `более ${estimate.lower} дн.`;
}
