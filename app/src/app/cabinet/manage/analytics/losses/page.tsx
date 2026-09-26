import {
  Card,
  Empty,
  Heading,
  TableCard,
  Text,
  plural,
} from '../../../../../components/cabinet/ui';
import { losses, overview } from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { Frame, Tile, Tiles, analyticsScreen, cell, head, num } from '../shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsLosses() {
  const { actor, rows } = await analyticsScreen();
  const report = losses(rows);
  const total = overview(rows);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/losses"
      title="Потери"
      lead="Потерей считается недополученное по приостановленным и отменённым работам. Работа, остановленная без задолженности, потерь не даёт. Остаток отменённых работ считается только здесь: к получению его больше не ждут. Приостановленные при этом остаются и в «к получению» — они могут возобновиться."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">Проектов в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile
              label="Потери"
              value={formatAmount(report.total)}
              note={`${report.rows.length} ${plural(report.rows.length, 'работа', 'работы', 'работ')} с остатком`}
            />
            <Tile label="Приостановлено" value={String(report.stopped)} note={`отменено ${report.cancelled}`} />
            <Tile label="Задолженность всего" value={formatAmount(total.outstanding)} note="по всем работам, кроме отменённых" />
          </Tiles>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Остановленные работы
          </Heading>
          {report.rows.length === 0 ? (
            <Card>
              <Text muted>Остановленных работ с задолженностью нет.</Text>
            </Card>
          ) : (
            <TableCard label="Остановленные работы">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={head} scope="col">Проект</th>
                    <th style={head} scope="col">Клиент</th>
                    <th style={head} scope="col">Договор</th>
                    <th style={head} scope="col">Получено</th>
                    <th style={head} scope="col">Недополучено</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.code}>
                      <td style={cell}>{row.title}</td>
                      <td style={cell}>{row.client}</td>
                      <td style={num}>{formatAmount(row.cost)}</td>
                      <td style={num}>{formatAmount(row.paid)}</td>
                      <td style={num}>{formatAmount(row.lost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...cell, fontWeight: 500, color: 'var(--pd-ink)' }} colSpan={4}>
                      Итого
                    </td>
                    <td style={{ ...num, fontWeight: 500, color: 'var(--pd-ink)' }}>
                      {formatAmount(report.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableCard>
          )}
        </>
      )}
    </Frame>
  );
}
