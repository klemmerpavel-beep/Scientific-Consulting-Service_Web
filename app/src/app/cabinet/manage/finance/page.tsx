import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  BarChart,
  DonutChart,
  Legend,
  compactMoney,
  compactNumber,
  seriesColor,
} from '../../../../components/cabinet/Charts';
import {
  Card,
  Disclosure,
  Heading,
  Mono,
  ScreenHead,
  Tile,
  Tiles,
  FilterBar,
  Tabs,
  Text,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { financeSummary } from '../../../../lib/cabinet/finance';
import { byMonth } from '../../../../lib/cabinet/analytics/metrics';
import { loadRows } from '../../../../lib/cabinet/analytics/data';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Доля в сумме договоров. Целые проценты, без ложной точности; доля
 * меньше процента пишется словами — «0 %» читалось бы как «ничего».
 */
function donutShare(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '—';
  const percent = (value / total) * 100;
  return percent < 1 ? 'менее 1 %' : `${Math.round(percent)} %`;
}

/** Сколько строк расчётов показывается на одной странице. */
const PAGE_SIZE = 20;

export default async function FinanceScreen({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; page?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Финансовый контур ведёт руководитель: менеджер не видит ни начислений,
  // ни маржи (PD-LK-FUNC-002, п. 3.2).
  if (!can(actor, 'MARGIN_VIEW')) redirect('/cabinet/projects');

  const sp = await searchParams;
  const { rows, totals } = await financeSummary(actor);
  // Помесячный ряд и разбиение работ на действующие и закрытые: деньги
  // ушли с главной, и отвечать на вопрос «когда они приходят» теперь
  // этому экрану (решение Р-194).
  const months = byMonth(await loadRows(actor)).slice(-12);
  const openCount = rows.filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED').length;
  const closedCount = rows.length - openCount;
  const openSum = rows
    .filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED')
    .reduce((acc, row) => acc + row.contracted, 0n);
  const closedSum = totals.contracted - openSum;

  // По умолчанию показываются работы с незакрытым остатком: за этим на
  // экран и приходят. Полный перечень — вкладкой рядом (решение Р-172).
  // Итоги считаются по всем работам и от отбора не зависят.
  const owing = rows.filter((row) => row.awaiting > 0n);
  const all = sp.set === 'all';
  const chosen = all ? rows : owing;
  const pages = Math.max(1, Math.ceil(chosen.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const shown = chosen.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (set: 'owing' | 'all', next = 1) => {
    const params = new URLSearchParams();
    if (set === 'all') params.set('set', 'all');
    if (next > 1) params.set('page', String(next));
    const tail = params.toString();
    return tail === '' ? '/cabinet/manage/finance' : `/cabinet/manage/finance?${tail}`;
  };

  const tiles = [
    { label: 'Законтрактовано', value: totals.contracted },
    { label: 'Получено', value: totals.received },
    { label: 'К получению', value: totals.awaiting },
    // «Списано», а не «Потери»: здесь считаются транши со статусом
    // списания, а вкладка аналитики «Потери» считает недополученное по
    // остановленным работам. Две разные величины под одним словом на
    // соседних экранах читались как одна (решение Р-182).
    { label: 'Списано', value: totals.lost },
    { label: 'Маржа', value: totals.margin },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        title="Договоры и расчёты"
        note="Маржа — сумма договора за вычетом начислений эксперту; у исторических работ, где исполнитель не указан, она равна сумме договора."
      />
      <Text style={{ marginBottom: 24 }}>
        <a href="/cabinet/manage/finance/years">Итоги по годам</a> — выручка и прибыль по годам:
        введённые вами рядом с посчитанными кабинетом.
      </Text>

      <Tiles>
        {tiles.map((tile) => (
          <Tile key={tile.label} label={tile.label} value={formatAmount(tile.value)} />
        ))}
      </Tiles>

      {/* Две диаграммы: когда приходят деньги и как сумма договоров делится
          между действующими и закрытыми работами. Заказчик попросил их
          именно здесь, а не на главной (решение Р-194). */}
      <div
        style={{
          display: 'grid',
          // Не больше двух плашек в ряду (решение Р-189).
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(440px,100%),1fr))',
          gap: 20,
          margin: '24px 0',
          maxWidth: 'calc(2 * 600px + 20px)',
        }}
      >
        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Деньги по месяцам
          </Heading>
          {months.length === 0 ? (
            <Text muted>Поступлений пока нет.</Text>
          ) : (
            <>
              <BarChart
                title="Поступления по месяцам"
                width={460}
                height={220}
                unit="тыс ₽"
                data={months.map((month) => ({
                  label: month.label,
                  value: Number(month.received) / 100_000,
                }))}
                format={(value) => compactNumber(value, 0)}
              />
              <Text muted size={13} style={{ marginTop: 10 }}>
                Получено по месяцу начала работы, последние двенадцать месяцев.
              </Text>
              <Disclosure title="Числа" style={{ marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TABLE_HEAD} scope="col">Месяц</th>
                      <th style={TABLE_NUM_HEAD} scope="col">Получено</th>
                      <th style={TABLE_NUM_HEAD} scope="col">Заказов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((month) => (
                      <tr key={month.key}>
                        <td style={TABLE_CELL}>{month.label}</td>
                        <td style={TABLE_NUM}>{formatAmount(month.received)}</td>
                        <td style={TABLE_NUM}>{month.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            </>
          )}
        </Card>

        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Действующие и закрытые
          </Heading>
          {rows.length === 0 ? (
            <Text muted>Работ с договором пока нет.</Text>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
              <div style={{ width: 220, flex: '0 0 auto' }}>
                <DonutChart
                  title="Сумма договоров: действующие и закрытые работы"
                  center={String(rows.length)}
                  centerLabel="работ"
                  segments={[
                    { label: 'Действующие', value: Number(openSum), color: seriesColor(0) },
                    { label: 'Закрытые', value: Number(closedSum), color: seriesColor(2) },
                  ]}
                />
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <Legend
                  column
                  items={[
                    {
                      label: `Действующие · ${openCount}`,
                      color: seriesColor(0),
                      value: formatAmount(openSum),
                      share: donutShare(Number(openSum), Number(totals.contracted)),
                    },
                    {
                      label: `Закрытые · ${closedCount}`,
                      color: seriesColor(2),
                      value: formatAmount(closedSum),
                      share: donutShare(Number(closedSum), Number(totals.contracted)),
                    },
                  ]}
                />
                <Text muted size={13} style={{ marginTop: 12 }}>
                  Доля в сумме договоров: {compactMoney(totals.contracted)} за всё время.
                </Text>
              </div>
            </div>
          )}
        </Card>
      </div>

      <FilterBar>
        <Tabs
          flush
          label="Отбор расчётов"
          items={[
            {
              href: href('owing'),
              label: `С остатком · ${owing.length}`,
              active: !all,
            },
            { href: href('all'), label: `Все работы · ${rows.length}`, active: all },
          ]}
        />
      </FilterBar>

      <TableCard label="Деньги по работам">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Проект</th>
              <th style={TABLE_HEAD} scope="col">Клиент</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Договор</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Получено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>К получению</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Начислено</th>
              <th scope="col" style={TABLE_NUM_HEAD}>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={7}>
                  {rows.length === 0
                    ? 'Договоров пока нет.'
                    : 'Незакрытых остатков нет — все работы оплачены.'}
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.projectId}>
                  {/* Код и название одной строкой: двумя ярусами строка
                      занимала 67 px, и двадцать строк давали полторы
                      тысячи пикселей (решение Р-184). */}
                  <td style={TABLE_CELL}>
                    {/* Ссылкой служит вся строка, а не один код: ссылка
                        посреди текста отличается только цветом, и
                        проверка доступности законно против (Р-184). */}
                    <a className="cab-mark" href={`/cabinet/projects/${row.code}/payments`}>
                      {row.title}
                    </a>
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
      </TableCard>

      {pages <= 1 ? null : (
        <nav
          aria-label="Страницы расчётов"
          style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 20 }}
        >
          {page > 1 ? (
            <a className="cab-mark" href={href(all ? 'all' : 'owing', page - 1)}>
              Предыдущие
            </a>
          ) : null}
          <Text muted size={14}>
            Страница {page} из {pages} · всего {chosen.length}{' '}
            {plural(chosen.length, 'работа', 'работы', 'работ')}
          </Text>
          {page < pages ? (
            <a className="cab-mark" href={href(all ? 'all' : 'owing', page + 1)}>
              Следующие
            </a>
          ) : null}
        </nav>
      )}
    </Shell>
  );
}
