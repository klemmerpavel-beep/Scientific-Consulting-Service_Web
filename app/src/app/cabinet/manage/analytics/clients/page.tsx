import {
  Legend,
  RankChart,
  StackBar,
  compactMoney,
  seriesColor,
} from '../../../../../components/cabinet/Charts';
import {
  Empty,
  Heading,
  formatDate,
  plural,
} from '../../../../../components/cabinet/ui';
import { SEGMENT_LABEL, clients, type ClientSegment } from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import {
  ChartCard,
  Frame,
  LongTable,
  Tile,
  Tiles,
  analyticsScreen,
  cell,
  head,
  num,
  share,
} from '../shared';

export const dynamic = 'force-dynamic';

/** Доля сегмента: целые проценты, малая доля — словами, а не «0 %». */
function segmentShare(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '—';
  const percent = (value / total) * 100;
  return percent < 1 ? 'менее 1 %' : `${Math.round(percent)} %`;
}

const SEGMENT_ORDER: ClientSegment[] = ['CORE', 'ACTIVE', 'DORMANT_VALUABLE', 'DORMANT_ONCE'];

export default async function AnalyticsClients() {
  const { actor, rows } = await analyticsScreen();
  const report = clients(rows, new Date());
  const top = report.clients.slice(0, 10);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/clients"
      title="Клиенты"
      lead="Клиент считается по карточке, а не по написанию ФИО: карточки, сведённые вручную после переноса истории, здесь уже едины."
    >
      {report.clients.length === 0 ? (
        <Empty title="Считать нечего">Клиентов в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile label="Клиентов" value={String(report.clients.length)} />
            <Tile
              label="Повторных"
              value={String(report.repeat)}
              note={`${share(report.repeatShare)} клиентов заказывали дважды и более`}
            />
            <Tile label="Медиана LTV" value={formatAmount(report.medianLtv)} note="половина клиентов приносит больше, половина меньше" />
            <Tile label="Доля топ-5" value={share(report.top5Share)} note="пять крупнейших клиентов в сумме договоров" />
          </Tiles>

          <ChartCard
            title="Сегменты"
            note="Недавним считается клиент с заказом за последние 180 дней. Ядро — недавние с двумя и более заказами; спящие делятся по LTV относительно медианы."
          >
            <StackBar
              width={1120}
              title="Сегменты клиентов"
              segments={SEGMENT_ORDER.map((segment, index) => ({
                label: SEGMENT_LABEL[segment],
                value: report.segments[segment],
                color: seriesColor(index),
              }))}
            />
            {/* Столбцом, а не потоком: четыре длинные метки переносились и
                рвали порядок чтения. Доля прежде существовала только внутри
                рисунка и до читалки не доходила (решение Р-176). */}
            <Legend
              column
              items={SEGMENT_ORDER.map((segment, index) => ({
                label: SEGMENT_LABEL[segment],
                color: seriesColor(index),
                value: `${report.segments[segment]} ${plural(report.segments[segment], 'клиент', 'клиента', 'клиентов')}`,
                share: segmentShare(report.segments[segment], report.clients.length),
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Десять крупнейших по LTV"
            note="LTV — сумма договоров клиента за всю историю, включая незакрытые работы."
            numbers={
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={head} scope="col">Клиент</th>
                    <th style={{ ...head, textAlign: 'right' }} scope="col">LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((client) => (
                    <tr key={client.clientId}>
                      <td style={cell}>{client.name}</td>
                      <td style={num}>{formatAmount(client.ltv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <RankChart
              title="Десять крупнейших клиентов"
              width={1120}
              labelWidth={240}
              data={top.map((client) => ({ label: client.name, value: Number(client.ltv) / 100 }))}
              format={(value) => compactMoney(BigInt(Math.round(value * 100)))}
            />
          </ChartCard>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Клиенты
          </Heading>
          <LongTable
            label="Клиенты"
            minWidth={760}
            columns={
              <tr>
                <th style={head} scope="col">Клиент</th>
                <th style={head} scope="col">Сегмент</th>
                <th style={head} scope="col">Заказов</th>
                <th style={head} scope="col">LTV</th>
                <th style={head} scope="col">Оплачено</th>
                <th style={head} scope="col">Последний заказ</th>
              </tr>
            }
            rows={report.clients.map((client) => (
              <tr key={client.clientId}>
                <td style={cell}>{client.name}</td>
                <td style={cell}>{SEGMENT_LABEL[client.segment]}</td>
                <td style={num}>{client.orders}</td>
                <td style={num}>{formatAmount(client.ltv)}</td>
                <td style={num}>{formatAmount(client.paid)}</td>
                {/* Дата и давность — одной строкой: вторым ярусом они
                    делали каждую строку таблицы вдвое выше. */}
                <td style={cell}>
                  {formatDate(client.lastOrder) ?? '—'}
                  {client.recencyDays === null
                    ? ''
                    : ` · ${client.recencyDays} ${plural(client.recencyDays, 'день', 'дня', 'дней')} назад`}
                </td>
              </tr>
            ))}
          />

        </>
      )}
    </Frame>
  );
}
