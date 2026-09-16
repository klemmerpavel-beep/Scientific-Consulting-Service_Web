import { RankChart, compactMoney } from '../../../../../components/cabinet/Charts';
import { Card, Chip, Empty, Heading, Notice, Text } from '../../../../../components/cabinet/ui';
import { products } from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, cell, head, num, share } from '../shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsProducts() {
  const { actor, rows } = await analyticsScreen();
  const list = products(rows);
  const scattered = list.filter((product) => product.needsPriceList && product.orders >= 3);
  const total = list.reduce((acc, product) => acc + product.total, 0n);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/products"
      title="Продукты"
      lead="Позиции берутся из справочника типов сопровождения. Исторические написания сведены к ним при переносе книги заказов."
    >
      {list.length === 0 ? (
        <Empty title="Считать нечего">Проектов в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile label="Позиций" value={String(list.length)} />
            <Tile label="Заказов" value={String(list.reduce((acc, product) => acc + product.orders, 0))} />
            <Tile label="Сумма договоров" value={formatAmount(total)} />
            <Tile
              label="Требуют прайса"
              value={String(scattered.length)}
              note="разброс чека выше 40 % при трёх и более заказах"
            />
          </Tiles>

          {scattered.length === 0 ? null : (
            <div style={{ marginBottom: 28 }}>
              <Notice tone="error" role="status">
                Цена по позициям {scattered.map((product) => product.typeName).join(', ')} назначается
                по случаю: разброс чека выше 40 %. Прайс по ним из практики не выводится — его нужно
                установить решением.
              </Notice>
            </div>
          )}

          <ChartCard
            title="Средний чек по позициям"
            note="Рядом с каждой позицией в таблице — медиана: при малом числе заказов она устойчивее среднего."
          >
            <RankChart
              title="Средний чек по позициям"
              data={list.map((product) => ({
                label: product.typeName,
                value: Number(product.averageCheck) / 100,
              }))}
              format={(value) => compactMoney(BigInt(Math.round(value * 100)))}
            />
          </ChartCard>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Позиции
          </Heading>
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
              <thead>
                <tr>
                  <th style={head} scope="col">Позиция</th>
                  <th style={head} scope="col">Заказов</th>
                  <th style={head} scope="col">Сумма</th>
                  <th style={head} scope="col">Средний чек</th>
                  <th style={head} scope="col">Медиана</th>
                  <th style={head} scope="col">От</th>
                  <th style={head} scope="col">До</th>
                  <th style={head} scope="col">Разброс</th>
                </tr>
              </thead>
              <tbody>
                {list.map((product) => (
                  <tr key={product.typeCode}>
                    <td style={cell}>{product.typeName}</td>
                    <td style={num}>{product.orders}</td>
                    <td style={num}>{formatAmount(product.total)}</td>
                    <td style={num}>{formatAmount(product.averageCheck)}</td>
                    <td style={num}>{formatAmount(product.medianCheck)}</td>
                    <td style={num}>{formatAmount(product.min)}</td>
                    <td style={num}>{formatAmount(product.max)}</td>
                    <td style={cell}>
                      {product.needsPriceList ? (
                        <Chip tone="warn">{share(product.variation)}</Chip>
                      ) : (
                        share(product.variation)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Text muted size={13} style={{ marginTop: 12 }}>
            Разброс — отношение стандартного отклонения чека к среднему. Значение выше 40 % означает,
            что цена в пределах одной позиции различается кратно.
          </Text>
        </>
      )}
    </Frame>
  );
}
