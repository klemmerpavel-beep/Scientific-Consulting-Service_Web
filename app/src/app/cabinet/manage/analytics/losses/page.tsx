import { Card, Empty, Heading, Notice, Text } from '../../../../../components/cabinet/ui';
import { losses, overview } from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { Frame, Tile, Tiles, analyticsScreen, cell, head, num } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * Величина из брифа PD-LK-BRIEF-001. Показывается рядом с расчётной, но не
 * вместо неё: источник расхождения не установлен, и обе цифры имеют право
 * быть на экране — одна как факт данных, другая как утверждение заказчика
 * (решение Р-134).
 */
const BRIEF_LOSSES = 36_500_000n;

export default async function AnalyticsLosses() {
  const { actor, rows } = await analyticsScreen();
  const report = losses(rows);
  const total = overview(rows);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/losses"
      title="Потери"
      lead="Потерей считается недополученное по остановленным и отменённым работам. Работа, остановленная без задолженности, потерь не даёт."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">Проектов в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile
              label="Потери по расчёту"
              value={formatAmount(report.total)}
              note={`${report.rows.length} работ с остатком`}
            />
            <Tile label="Величина из брифа" value={formatAmount(BRIEF_LOSSES)} note="PD-LK-BRIEF-001, раздел 5" />
            <Tile label="Приостановлено" value={String(report.stopped)} note={`отменено ${report.cancelled}`} />
            <Tile label="Задолженность всего" value={formatAmount(total.outstanding)} note="включая действующие работы" />
          </Tiles>

          <div style={{ marginBottom: 28 }}>
            <Notice tone="quiet" role="status">
              Расчётная величина — {formatAmount(report.total)} — получена из данных системы и
              воспроизводима построчно. Бриф называет {formatAmount(BRIEF_LOSSES)}; ту же величину,
              что и расчёт, независимо даёт автотест панели учёта. Источник расхождения не установлен,
              поэтому показаны обе: подменять расчёт цифрой брифа нельзя, скрывать цифру брифа — тоже.
            </Notice>
          </div>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Остановленные работы
          </Heading>
          {report.rows.length === 0 ? (
            <Card>
              <Text muted>Остановленных работ с задолженностью нет.</Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflowX: 'auto' }}>
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
                      <td style={cell}>
                        {row.code}
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{row.title}</div>
                      </td>
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
            </Card>
          )}
        </>
      )}
    </Frame>
  );
}
