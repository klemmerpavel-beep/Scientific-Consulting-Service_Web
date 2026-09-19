import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Card, Heading, Mono, Text,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { financeSummary } from '../../../../lib/cabinet/finance';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

export default async function FinanceScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Финансовый контур ведёт руководитель: менеджер не видит ни начислений,
  // ни маржи (PD-LK-FUNC-002, п. 3.2).
  if (!can(actor, 'MARGIN_VIEW')) redirect('/cabinet/projects');

  const { rows, totals } = await financeSummary(actor);

  const tiles = [
    { label: 'Законтрактовано', value: totals.contracted },
    { label: 'Получено', value: totals.received },
    { label: 'К получению', value: totals.awaiting },
    { label: 'Потери', value: totals.lost },
    { label: 'Маржа', value: totals.margin },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <Mono>Деньги практики</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Договоры и расчёты
      </Heading>
      <Text muted style={{ marginBottom: 8 }}>
        Величины считаются по данным системы. Маржа — сумма договора за вычетом начислений
        эксперту; у исторических проектов, где исполнитель не указан, она равна сумме договора.
      </Text>
      <Text style={{ marginBottom: 24 }}>
        <a href="/cabinet/manage/finance/years">Итоги по годам</a> — выручка и прибыль по годам:
        введённые вами рядом с посчитанными кабинетом.
      </Text>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {tiles.map((tile) => (
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

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD}>Проект</th>
              <th style={TABLE_HEAD}>Клиент</th>
              <th style={{ ...TABLE_HEAD, textAlign: 'right' }}>Договор</th>
              <th style={{ ...TABLE_HEAD, textAlign: 'right' }}>Получено</th>
              <th style={{ ...TABLE_HEAD, textAlign: 'right' }}>К получению</th>
              <th style={{ ...TABLE_HEAD, textAlign: 'right' }}>Начислено</th>
              <th style={{ ...TABLE_HEAD, textAlign: 'right' }}>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={7}>
                  Договоров пока нет.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.projectId}>
                  <td style={TABLE_CELL}>
                    <a href={`/cabinet/projects/${row.code}/payments`}>{row.code}</a>
                    <br />
                    {row.title}
                  </td>
                  <td style={TABLE_CELL}>{row.client}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.contracted)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.received)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.awaiting)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.accrued)}</td>
                  <td style={TABLE_NUM}>{formatAmount(row.margin)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </Shell>
  );
}
