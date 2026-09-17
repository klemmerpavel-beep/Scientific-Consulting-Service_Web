import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import AnalyticsTabs from '../../../../components/cabinet/AnalyticsTabs';
import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Card, Heading, Mono, Text, Tile, Tiles } from '../../../../components/cabinet/ui';
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

export const cell: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--pd-divider)',
  fontFamily: SANS,
  fontSize: 14,
  color: 'var(--pd-ink-secondary)',
  textAlign: 'left',
  verticalAlign: 'top',
};

export const num: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export const head: React.CSSProperties = {
  ...cell,
  fontWeight: 500,
  color: 'var(--pd-ink)',
  background: 'var(--pd-surface-quiet)',
  whiteSpace: 'nowrap',
};

/** Плитка величины. Под каждой — пояснение, откуда число взялось. */
// Плитки живут в общем модуле оформления; вкладки берут их отсюда.
export { Tile, Tiles };

/** Карточка графика: заголовок, сам график, под ним — пояснение расчёта. */
export function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
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
    </Card>
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
