import {
  Legend,
  RankChart,
  StackBar,
  compactMoney,
  seriesColor } from '../../../../../components/cabinet/Charts'; import { Card,
  Empty,
  Heading,
  TableCard,
  Text,
  formatDate,
  plural,
} from '../../../../../components/cabinet/ui';
import { SEGMENT_LABEL, clients, type ClientSegment } from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, cell, head, num, share } from '../shared';

export const dynamic = 'force-dynamic';

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
              title="Сегменты клиентов"
              segments={SEGMENT_ORDER.map((segment) => ({
                label: SEGMENT_LABEL[segment],
                value: report.segments[segment],
              }))}
            />
            <Legend
              items={SEGMENT_ORDER.map((segment, index) => ({
                label: SEGMENT_LABEL[segment],
                color: seriesColor(index),
                value: `${report.segments[segment]}`,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Десять крупнейших по LTV"
            note="LTV — сумма договоров клиента за всю историю, включая незакрытые работы."
          >
            <RankChart
              title="Десять крупнейших клиентов"
              data={top.map((client) => ({ label: client.name, value: Number(client.ltv) / 100 }))}
              format={(value) => compactMoney(BigInt(Math.round(value * 100)))}
            />
          </ChartCard>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Клиенты
          </Heading>
          <TableCard label="Клиенты">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={head} scope="col">Клиент</th>
                  <th style={head} scope="col">Сегмент</th>
                  <th style={head} scope="col">Заказов</th>
                  <th style={head} scope="col">LTV</th>
                  <th style={head} scope="col">Оплачено</th>
                  <th style={head} scope="col">Последний заказ</th>
                </tr>
              </thead>
              <tbody>
                {report.clients.slice(0, 50).map((client) => (
                  <tr key={client.clientId}>
                    <td style={cell}>{client.name}</td>
                    <td style={cell}>{SEGMENT_LABEL[client.segment]}</td>
                    <td style={num}>{client.orders}</td>
                    <td style={num}>{formatAmount(client.ltv)}</td>
                    <td style={num}>{formatAmount(client.paid)}</td>
                    <td style={cell}>
                      {formatDate(client.lastOrder) ?? '—'}
                      {client.recencyDays === null ? null : (
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                          {client.recencyDays} {plural(client.recencyDays, 'день', 'дня', 'дней')} назад
                        </div>
                      )}
                    </td>
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
