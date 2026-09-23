import {
  BarChart,
  DonutChart,
  Legend,
  compactMoney,
  compactNumber,
  seriesColor,
} from '../../../../components/cabinet/Charts';
import { Card, Chip, Empty, Heading, Mono, Text, plural } from '../../../../components/cabinet/ui';
import { byMonth, conclusions, overview, products, verdict } from '../../../../lib/cabinet/analytics/metrics';
import { formatAmount, formatRounded } from '../../../../lib/cabinet/money';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, cell, head, num, share } from './shared';
import { now as clockNow } from '../../../../lib/cabinet/clock';

export const dynamic = 'force-dynamic';

/**
 * Уверенность вывода: слово и цвет полосы. Слово обязательно — смысл не
 * держится на одном цвете (правило Р-165, решение Р-194).
 */
const CONFIDENCE = {
  sure: { label: 'подтверждено числами', edge: 'var(--pd-accent)' },
  likely: { label: 'вероятно', edge: 'var(--pd-accent-edge)' },
  risky: { label: 'под вопросом', edge: 'var(--pd-border)' },
} as const;

/**
 * Доля типа в сумме договоров. Целые проценты, без ложной точности; доля
 * меньше процента пишется словами — «0 %» читалось бы как «ничего», хотя
 * сумма у такой позиции есть и стоит рядом.
 */
function donutShare(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '—';
  const percent = (value / total) * 100;
  return percent < 1 ? 'менее 1 %' : `${Math.round(percent)} %`;
}

export default async function AnalyticsOverview() {
  const { actor, rows } = await analyticsScreen();
  const now = clockNow();

  const total = overview(rows);
  const months = byMonth(rows);
  const productRows = products(rows);
  const outputs = conclusions(rows, now);
  const digest = verdict(rows, now);

  const period =
    total.period.from === null
      ? '—'
      : `${total.period.from.toLocaleDateString('ru-RU')} — ${total.period.to!.toLocaleDateString('ru-RU')}`;

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics"
      title="Обзор практики"
      lead="Величины считаются по данным системы: ни одна не введена вручную."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">
          В системе нет ни одного проекта. Аналитика появится после переноса истории или первой
          одобренной заявки.
        </Empty>
      ) : (
        <>
          {/* Итог первой строкой: заказчик просил подавать аналитику ёмко и
              концентрированно — открыл и понял, как дела, не читая плиток.
              Отдельного экрана под это не заводится, чтобы не держать
              четвёртую копию одних и тех же чисел (решение Р-202). */}
          {digest === null ? null : (
            <Card style={{ marginBottom: 20 }}>
              <Heading level={2} size={3} style={{ marginBottom: 8 }}>
                Итог
              </Heading>
              <Text size={15}>{digest.state}</Text>
              {digest.risk === null ? null : (
                <Text size={15} style={{ marginTop: 8 }}>
                  <strong style={{ fontWeight: 600 }}>Под угрозой: </strong>
                  {digest.risk}
                </Text>
              )}
              {digest.first === null ? null : (
                <Text size={15} style={{ marginTop: 8 }}>
                  <strong style={{ fontWeight: 600 }}>Первым делом: </strong>
                  {digest.first}
                </Text>
              )}
            </Card>
          )}

          <Tiles>
            <Tile label="Законтрактовано" value={formatAmount(total.contracted)} note={`${total.projects} ${plural(total.projects, 'работа', 'работы', 'работ')}, период ${period}`} />
            <Tile label="Получено" value={formatAmount(total.received)} note={`собрано ${share(total.collection)} по завершённым`} />
            <Tile label="Задолженность" value={formatAmount(total.outstanding)} note="остаток по каждой работе, не меньше нуля" />
            <Tile label="Средний чек" value={formatRounded(total.averageCheck)} note={`клиентов ${total.clients}`} />
          </Tiles>

          <Heading level={2} style={{ marginBottom: 4 }}>
            Выводы и что делать
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            Каждый вывод несёт действие, срок и — где величина считается честно — оценку
            эффекта. Уверенность: «подтверждено числами» — прямой счёт по своим данным,
            «вероятно» — спрос проверен, но повторение не гарантировано, «под вопросом» —
            решение спорное, зато потенциал наибольший.
          </Text>
          {/* Не больше двух плашек в ряду (решение Р-189). */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(440px,100%),1fr))',
              gap: 16,
              marginBottom: 28,
            }}
          >
            {outputs.length === 0 ? (
              <Card>
                <Text muted>Данных пока мало: выводы появятся, когда наберётся история.</Text>
              </Card>
            ) : (
              outputs.map((item) => (
                <Card
                  key={item.title}
                  style={{
                    // Полоса слева называет уверенность цветом, а подпись
                    // ниже — словом: смысл не держится на цвете (Р-165).
                    borderLeft: `3px solid ${CONFIDENCE[item.confidence].edge}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Mono>{item.area}</Mono>
                  <Heading level={3} style={{ margin: '8px 0 6px' }}>
                    {item.title}
                  </Heading>
                  <Text muted size={14}>
                    {item.text}
                  </Text>
                  <Text size={14} style={{ marginTop: 10 }}>
                    <strong style={{ fontWeight: 600 }}>Что делать: </strong>
                    {item.action}
                  </Text>
                  <div style={{ marginTop: 'auto' }} />
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px solid var(--pd-divider)',
                    }}
                  >
                    <Chip tone={item.confidence === 'sure' ? 'accent' : undefined}>
                      {CONFIDENCE[item.confidence].label}
                    </Chip>
                    <Chip>срок: {item.term}</Chip>
                    {item.effect === null ? null : (
                      <Chip>оценка: {formatRounded(item.effect)}</Chip>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <ChartCard
            title="Законтрактовано по месяцам"
            note="По дате заказа. Месяц без заказов показан нулём, а не пропуском: разрыв читался бы как отсутствие данных."
            numbers={
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={head} scope="col">Месяц</th>
                    <th style={{ ...head, textAlign: 'right' }} scope="col">Заказов</th>
                    <th style={{ ...head, textAlign: 'right' }} scope="col">Законтрактовано</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.label}>
                      <td style={cell}>{month.label}</td>
                      <td style={num}>{month.orders}</td>
                      <td style={num}>{formatAmount(month.contracted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            {/* Величина выражена тысячами рублей, и единица стоит в шкале:
                подпись «570» вместо «570 тыс» втрое короче, и подписанными
                оказываются все столбцы, а не каждый третий (решение Р-175). */}
            <BarChart
              title="Законтрактовано по месяцам"
              width={1000}
              unit="тыс ₽"
              data={months.map((month) => ({
                label: month.label,
                value: Number(month.contracted) / 100_000,
              }))}
              format={(value) => compactNumber(value, 0)}
            />
          </ChartCard>

          <ChartCard title="Структура по типам сопровождения" note="Доля в сумме договоров.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
              <div style={{ width: 260, flex: '0 0 auto' }}>
                <DonutChart
                  title="Структура по типам сопровождения"
                  center={compactMoney(total.contracted)}
                  centerLabel="всего"
                  segments={productRows.map((product, index) => ({
                    label: product.typeName,
                    value: Number(product.total),
                    color: seriesColor(index),
                  }))}
                />
              </div>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <Legend
                  column
                  items={productRows.map((product, index) => ({
                    label: product.typeName,
                    color: seriesColor(index),
                    value: formatAmount(product.total),
                    share: donutShare(Number(product.total), Number(total.contracted)),
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
