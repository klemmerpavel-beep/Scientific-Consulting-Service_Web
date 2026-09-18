import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { Card, Chip, Empty, Heading, Mono, Text, formatDate } from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { ownPayouts } from '../../../lib/cabinet/finance';
import { formatAmount } from '../../../lib/cabinet/money';
import { currentActor } from '../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Собственное вознаграждение эксперта. Ни суммы договора, ни маржи здесь нет
 * и быть не может: выборка ограничена начислениями самого эксперта, а
 * экономика проекта в объект не попадает.
 */
export default async function PayoutScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'PAYOUT_VIEW_OWN')) redirect('/cabinet/projects');

  const { rows, accrued, paid } = await ownPayouts(actor);

  return (
    <Shell actor={actor} current="/cabinet/payout">
      <Mono>Вознаграждение</Mono>
      <Heading level={1} style={{ margin: '12px 0 24px' }}>
        Начислено и выплачено
      </Heading>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: 'Начислено', value: accrued },
          { label: 'Выплачено', value: paid },
          { label: 'К выплате', value: accrued - paid },
        ].map((tile) => (
          <Card key={tile.label}>
            <Mono>{tile.label}</Mono>
            <Text
              size={22}
              style={{ marginTop: 8, color: 'var(--pd-ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatAmount(tile.value)}
            </Text>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="Начислений пока нет">
          Вознаграждение появится здесь, как только руководитель начислит его по этапу или проекту.
        </Empty>
      ) : (
        <Card>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
            {rows.map((row) => (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  borderBottom: '1px solid var(--pd-divider)',
                  paddingBottom: 14,
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <Text size={15} style={{ color: 'var(--pd-ink)' }}>
                    {row.project.code} · {row.project.title}
                  </Text>
                  <Text muted size={13} style={{ marginTop: 2 }}>
                    {row.stage?.title ?? 'по проекту в целом'}
                    {row.comment === null ? '' : ` · ${row.comment}`}
                  </Text>
                </div>
                <Chip tone={row.status === 'PAID' ? 'accent' : 'neutral'}>
                  {row.status === 'PAID' ? `выплачено ${formatDate(row.paidOn)}` : 'начислено'}
                </Chip>
                <Text size={16} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAmount(row.amount)}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
