import {
  RankChart,
  compactNumber } from '../../../../../components/cabinet/Charts'; import { Card,
  Empty,
  Heading,
  TableCard,
  Text,
} from '../../../../../components/cabinet/ui';
import { cycles, overview } from '../../../../../lib/cabinet/analytics/metrics';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, cell, cycleLabel, head, num, share } from '../shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsProjects() {
  const { actor, rows } = await analyticsScreen();
  const now = new Date();
  const report = cycles(rows, now);
  const total = overview(rows);

  // Для графика берутся позиции, где медиана вычислена: «более N дней»
  // столбцом не изобразить, не соврав про величину.
  const withMedian = report.byType.filter((row) => row.estimate.median !== null);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/projects"
      title="Сроки"
      lead="Срок оценивается по Каплану — Мейеру: незавершённые работы не выбрасываются, а цензурируют кривую. Среднее по закрытым занижало бы срок, потому что длинные работы ещё идут."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">Проектов в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile
              label="Медиана срока"
              value={cycleLabel(report.overall)}
              note={`${report.overall.observations} наблюдений, завершено ${report.overall.events}`}
            />
            <Tile label="В работе" value={String(total.active)} note={`приостановлено ${total.paused}`} />
            <Tile
              label="В срок"
              value={report.withDue === 0 ? '—' : share(report.onTime / report.withDue)}
              note={`из ${report.withDue} завершённых с заданным сроком`}
            />
            <Tile label="Просрочено" value={String(report.overdueOpen)} note="незакрытых работ со сроком в прошлом" />
          </Tiles>

          {withMedian.length === 0 ? (
            <Card style={{ marginBottom: 28 }}>
              <Text muted>
                Ни по одной позиции кривая не опустилась до половины: завершённых работ пока меньше,
                чем нужно для медианы. В таблице ниже — оценка снизу.
              </Text>
            </Card>
          ) : (
            <ChartCard
              title="Медиана срока по позициям"
              note="Показаны только позиции, где медиана достигнута. Там, где завершённых работ мало, кривая до половины не опускается, и медианы не существует — такую позицию столбцом не изобразить, не соврав."
              numbers={
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={head} scope="col">Позиция</th>
                      <th style={{ ...head, textAlign: 'right' }} scope="col">Медиана срока</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withMedian.map((row) => (
                      <tr key={row.typeCode}>
                        <td style={cell}>{row.typeName}</td>
                        <td style={num}>{row.estimate.median} дн.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <RankChart
                width={1120}
                labelWidth={380}
                title="Медиана срока по позициям"
                data={withMedian.map((row) => ({ label: row.typeName, value: row.estimate.median! }))}
                format={(value) => `${compactNumber(value)} дн.`}
              />
            </ChartCard>
          )}

          <Heading level={2} style={{ marginBottom: 12 }}>
            Сроки по позициям
          </Heading>
          <TableCard label="Сроки по позициям">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <caption style={{ ...cell, captionSide: 'top', borderBottom: 'none' }}>
                «Более N дней» означает, что завершённых работ недостаточно для медианы: N — наибольший
                наблюдавшийся срок.
              </caption>
              <thead>
                <tr>
                  <th style={head} scope="col">Позиция</th>
                  <th style={head} scope="col">Наблюдений</th>
                  <th style={head} scope="col">Завершено</th>
                  <th style={head} scope="col">Медиана срока</th>
                </tr>
              </thead>
              <tbody>
                {report.byType.map((row) => (
                  <tr key={row.typeCode}>
                    <td style={cell}>{row.typeName}</td>
                    <td style={num}>{row.estimate.observations}</td>
                    <td style={num}>{row.estimate.events}</td>
                    <td style={cell}>{cycleLabel(row.estimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </Frame>
  );
}
