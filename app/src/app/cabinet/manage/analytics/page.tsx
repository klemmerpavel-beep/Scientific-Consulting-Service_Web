import { BarChart, DonutChart, Legend, compactMoney, seriesColor } from '../../../../components/cabinet/Charts';
import { Card, Empty, Heading, Text } from '../../../../components/cabinet/ui';
import { byMonth, conclusions, overview, products } from '../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../lib/cabinet/money';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, share } from './shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsOverview() {
  const { actor, rows } = await analyticsScreen();
  const now = new Date();

  const total = overview(rows);
  const months = byMonth(rows);
  const productRows = products(rows);
  const outputs = conclusions(rows, now);

  const period =
    total.period.from === null
      ? '—'
      : `${total.period.from.toLocaleDateString('ru-RU')} — ${total.period.to!.toLocaleDateString('ru-RU')}`;

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics"
      title="Обзор практики"
      lead="Величины считаются по данным системы на момент открытия страницы. Ни одна не введена вручную и не взята из внешнего источника."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">
          В системе нет ни одного проекта. Аналитика появится после переноса истории или первой
          одобренной заявки.
        </Empty>
      ) : (
        <>
          <Tiles>
            <Tile label="Законтрактовано" value={formatAmount(total.contracted)} note={`${total.projects} проектов, период ${period}`} />
            <Tile label="Получено" value={formatAmount(total.received)} note={`собрано ${share(total.collection)} по завершённым`} />
            <Tile label="Задолженность" value={formatAmount(total.outstanding)} note="остаток по каждой работе, не меньше нуля" />
            <Tile label="Средний чек" value={formatAmount(total.averageCheck)} note={`клиентов ${total.clients}`} />
          </Tiles>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Выводы
          </Heading>
          <div style={{ display: 'grid', gap: 16, marginBottom: 28 }}>
            {outputs.length === 0 ? (
              <Card>
                <Text muted>Данных пока мало: выводы появятся, когда наберётся история.</Text>
              </Card>
            ) : (
              outputs.map((item) => (
                <Card key={item.title}>
                  <Heading level={3} style={{ marginBottom: 6 }}>
                    {item.title}
                  </Heading>
                  <Text muted>{item.text}</Text>
                </Card>
              ))
            )}
          </div>

          <ChartCard
            title="Законтрактовано по месяцам"
            note="По дате заказа. Месяц без заказов показан нулём, а не пропуском: разрыв читался бы как отсутствие данных."
          >
            <BarChart
              title="Законтрактовано по месяцам"
              data={months.map((month) => ({ label: month.label, value: Number(month.contracted) / 100 }))}
              format={(value) => compactMoney(BigInt(Math.round(value * 100)))}
            />
          </ChartCard>

          <ChartCard title="Структура по типам сопровождения" note="Доля в сумме договоров.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
              <div style={{ width: 260, flex: '0 0 auto' }}>
                <DonutChart
                  title="Структура по типам сопровождения"
                  center={compactMoney(total.contracted)}
                  centerLabel="всего"
                  segments={productRows.map((product) => ({
                    label: product.typeName,
                    value: Number(product.total),
                  }))}
                />
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <Legend
                  items={productRows.map((product, index) => ({
                    label: product.typeName,
                    color: seriesColor(index),
                    value: formatAmount(product.total),
                  }))}
                />
              </div>
            </div>
          </ChartCard>
        </>
      )}
    </Frame>
  );
}
