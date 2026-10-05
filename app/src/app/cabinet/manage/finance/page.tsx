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
  Pager,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { financeSummary } from '../../../../lib/cabinet/finance';
import { byMonth } from '../../../../lib/cabinet/analytics/metrics';
import { loadRows } from '../../../../lib/cabinet/analytics/data';
import { formatAmount } from '../../../../lib/cabinet/money';
import { requireActor } from '../../../../lib/cabinet/session';
import { homeFor } from '../../../../lib/cabinet/nav';
import { now as clockNow } from '../../../../lib/cabinet/clock';

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
  const actor = await requireActor('/cabinet/manage/finance');
  // Финансовый контур ведёт руководитель: менеджер не видит ни начислений,
  // ни маржи (PD-LK-FUNC-002, п. 3.2).
  if (!can(actor, 'MARGIN_VIEW')) redirect(homeFor(actor));

  const sp = await searchParams;
  const { rows, totals } = await financeSummary(actor);
  // Помесячный ряд и разбиение работ на действующие и закрытые: деньги
  // ушли с главной, и отвечать на вопрос «когда они приходят» теперь
  // этому экрану (решение Р-194).
  //
  // Ряд доходит до текущего месяца: окно «последние двенадцать месяцев»
  // кончается сегодняшним месяцем, а не месяцем последнего начала работы
  // (решение Р-257).
  const months = byMonth(await loadRows(actor), clockNow()).slice(-12);
  const openCount = rows.filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED').length;
  const closedCount = rows.length - openCount;
  const openSum = rows
    .filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED')
    .reduce((acc, row) => acc + row.contracted, 0n);
  const closedSum = totals.contracted - openSum;

  // По умолчанию показываются работы с незакрытым остатком: за этим на
  // экран и приходят. Полный перечень — вкладкой рядом (решение Р-172).
  // Итоги считаются по всем работам и от отбора не зависят. Отменённая
  // работа в «С остатком» не попадает: её остаток — потеря, и к получению
  // у неё ноль (решение Р-257).
  const owing = rows.filter((row) => row.awaiting > 0n);
  const all = sp.set === 'all';
  const chosen = all ? rows : owing;
  const pages = Math.max(1, Math.ceil(chosen.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(Number(sp.page)) || 1), pages);
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
    // Маржа вычитает и начисления по работам без договора: строк у таких
    // работ здесь нет, и прежде эти деньги из итога выпадали (решение
    // Р-257).
    {
      label: 'Маржа',
      value: totals.margin,
      note:
        totals.accruedWithoutContract > 0n
          ? `с учётом начислений по работам без договора: ${formatAmount(totals.accruedWithoutContract)}`
          : undefined,
    },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/finance">
      <ScreenHead
        title="Деньги"
        note="Маржа — сумма договора за вычетом списанного и начислений куратору; у исторических работ, где куратор не указан, начислений нет. «К получению» не считает отменённые работы: их неоплаченное учтено в потерях."
      />
      <Text style={{ marginBottom: 24 }}>
        <a href="/cabinet/manage/finance/years">Итоги по годам</a> — выручка и прибыль по годам:
        введённые вами рядом с посчитанными кабинетом.{' '}
        <a href="/cabinet/manage/finance/payouts">Вознаграждение кураторов</a> — начислено, выплачено и
        к выплате по каждому куратору.{' '}
        <a href="/cabinet/manage/finance/debtors">Должники</a> — просроченные платежи: напомнить,
        перенести дату или списать.{' '}
        <a href="/cabinet/manage/finance/receipts">Поступления</a> — когда придут деньги по
        заключённым договорам, по месяцам.{' '}
        <a href="/cabinet/manage/finance/profit">Прибыль по месяцам</a> — поступления, выплаты
        кураторам и расходы по статьям; здесь же вносятся расходы.
      </Text>

      <Tiles>
        {tiles.map((tile) => (
          <Tile key={tile.label} label={tile.label} value={formatAmount(tile.value)} note={tile.note} />
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
          {/* Это не поступления месяца: ряд относит оплату к месяцу начала
              работы, когда бы деньги ни пришли. Прежде заголовок «Деньги по
              месяцам» и подпись «Поступления» обещали кассу месяца
              (решение Р-257). */}
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Оплаты по месяцу начала работы
          </Heading>
          {months.length === 0 ? (
            <Text muted>Работ с датой начала пока нет.</Text>
          ) : (
            <>
              <BarChart
                title="Оплаты по месяцу начала работы"
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
                Полученное по работам, начатым в месяце, — когда бы оно ни пришло; это не
                поступления месяца. Последние двенадцать месяцев, включая текущий.
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
              {/* Рамка — в поле рисунка, 260 px, как на аналитике: в рамке
                  220 кольцо сжималось, и подписи в 12 px выходили по
                  10,2 px — ниже нижней ступени кегля (решение Р-253). */}
              <div style={{ width: 260, flex: '0 0 auto' }}>
                <DonutChart
                  title="Сумма договоров: действующие и закрытые работы"
                  center={String(rows.length)}
                  centerLabel="работ с договором"
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
            // Строки экрана — договоры: работа без договора здесь не стоит,
            // и «Все работы» обещали больше, чем показано (решение Р-257).
            { href: href('all'), label: `Все работы с договором · ${rows.length}`, active: all },
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
                    : 'Незакрытых остатков нет. Неполученное по отменённым работам — потеря, а не долг: оно на вкладке «Потери» аналитики.'}
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
                  <td style={TABLE_CELL}>
                    {row.client}
                    {/* Кто ведёт работу — ссылкой на «Работы» с отбором (РК-03). */}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      менеджер —{' '}
                      <a className="cab-mark" href={`/cabinet/projects?state=all&manager=${row.manager.id}`}>
                        {row.manager.fullName}
                      </a>
                      {row.expert === null ? null : (
                        <>
                          {' · куратор — '}
                          <a className="cab-mark" href={`/cabinet/projects?state=all&curator=${row.expert.id}`}>
                            {row.expert.fullName}
                          </a>
                        </>
                      )}
                    </div>
                  </td>
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

      {/* Постраничность — общей частью (УМ-08, Р-390). */}
      <Pager
        label="Страницы расчётов"
        page={page}
        pages={pages}
        hrefFor={(next) => href(all ? 'all' : 'owing', next)}
        total={`${chosen.length} ${plural(chosen.length, 'работа', 'работы', 'работ')}`}
      />
    </Shell>
  );
}
