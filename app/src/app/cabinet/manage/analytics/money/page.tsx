import {
  BarChart,
  LineChart,
  Legend,
  compactMoney,
  compactNumber,
  seriesColor,
} from '../../../../../components/cabinet/Charts';
import { Card, Chip, Empty, Heading, Text, formatDate } from '../../../../../components/cabinet/ui';
import {
  byMonth,
  overview,
  receivables,
  seasonalNorm,
} from '../../../../../lib/cabinet/analytics/metrics';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { ChartCard, Frame, Tile, Tiles, analyticsScreen, cell, head, num, share } from '../shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsMoney() {
  const { actor, rows } = await analyticsScreen();
  const now = new Date();

  const total = overview(rows);
  const months = byMonth(rows);
  const season = seasonalNorm(rows, now);
  const debts = receivables(rows, now);
  const overdue = debts.filter((debt) => debt.overdueDays !== null && debt.overdueDays > 0);

  return (
    <Frame
      actor={actor}
      current="/cabinet/manage/analytics/money"
      title="Деньги"
      lead="Поступившим считается сумма траншей со статусом «оплачен». Отдельного поля «получено» у проекта нет: оно разошлось бы с траншами при первой же правке."
    >
      {rows.length === 0 ? (
        <Empty title="Считать нечего">Данных о договорах в системе нет.</Empty>
      ) : (
        <>
          <Tiles>
            <Tile label="Законтрактовано" value={formatAmount(total.contracted)} />
            <Tile label="Получено" value={formatAmount(total.received)} note={`${share(total.collection)} по завершённым`} />
            <Tile label="Задолженность" value={formatAmount(total.outstanding)} note={`${debts.length} работ с остатком`} />
            <Tile
              label="Просрочено"
              value={formatAmount(overdue.reduce((acc, debt) => acc + debt.debt, 0n))}
              note={`${overdue.length} работ со сроком в прошлом`}
            />
          </Tiles>

          <ChartCard
            title="Договоры и поступления по месяцам"
            note="Обе величины отнесены к дате заказа: поступление показано там, где возникло обязательство, а не там, где пришли деньги — даты платежей в перенесённой истории отсутствуют."
          >
            <LineChart
              title="Договоры и поступления по месяцам"
              categories={months.map((month) => month.label)}
              series={[
                { name: 'Законтрактовано', points: months.map((month) => Number(month.contracted) / 100) },
                { name: 'Получено', points: months.map((month) => Number(month.received) / 100) },
              ]}
              format={(value) => compactMoney(BigInt(Math.round(value * 100)))}
            />
            <Legend
              items={[
                { label: 'Законтрактовано', color: seriesColor(0) },
                { label: 'Получено', color: seriesColor(1) },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Сезонная норма заказов"
            note="Среднее число заказов месяца по наблюдавшимся годам. Знаменатель — фактически наблюдавшиеся месяцы, а не календарные годы: история начинается и заканчивается в середине года, и деление на число лет занижало бы крайние месяцы."
          >
            <BarChart
              title="Сезонная норма заказов"
              data={season.map((month) => ({ label: month.label, value: month.norm }))}
              format={(value) => compactNumber(value, 1)}
              height={220}
            />
          </ChartCard>

          <Heading level={2} style={{ marginBottom: 12 }}>
            Дебиторская задолженность
          </Heading>
          {debts.length === 0 ? (
            <Card>
              <Text muted>Незакрытых остатков нет.</Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <caption style={{ ...cell, captionSide: 'top', borderBottom: 'none' }}>
                  Остаток считается по каждой работе отдельно: переплата по одному договору не
                  погашает долг по другому.
                </caption>
                <thead>
                  <tr>
                    <th style={head} scope="col">Проект</th>
                    <th style={head} scope="col">Клиент</th>
                    <th style={head} scope="col">Договор</th>
                    <th style={head} scope="col">Получено</th>
                    <th style={head} scope="col">Остаток</th>
                    <th style={head} scope="col">Срок</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.slice(0, 40).map((debt) => (
                    <tr key={debt.code}>
                      <td style={cell}>
                        {debt.code}
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{debt.title}</div>
                      </td>
                      <td style={cell}>{debt.client}</td>
                      <td style={num}>{formatAmount(debt.cost)}</td>
                      <td style={num}>{formatAmount(debt.paid)}</td>
                      <td style={num}>{formatAmount(debt.debt)}</td>
                      <td style={cell}>
                        {formatDate(debt.dueOn) ?? '—'}
                        {debt.overdueDays !== null && debt.overdueDays > 0 ? (
                          <div style={{ marginTop: 4 }}>
                            <Chip>просрочка {debt.overdueDays} дн.</Chip>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </Frame>
  );
}
