import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  ButtonLink,
  FilterBar,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Tabs,
  formatDate,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { formatPlain } from '../../../../lib/cabinet/money';
import { homeFor } from '../../../../lib/cabinet/nav';
import {
  ORDER_DEBT_FILTERS,
  ORDER_STATUS_FILTERS,
  orderFilters,
  ordersTable,
  type OrderDebtFilter,
  type OrderStatusFilter,
} from '../../../../lib/cabinet/orders';
import { PROJECT_STATUS_LABEL } from '../../../../lib/cabinet/project-status';
import { requireActor } from '../../../../lib/cabinet/session';
import { ORDER_COLUMNS, orderTotals } from '../../../../lib/cabinet/table-views';

export const dynamic = 'force-dynamic';

const STATUS_TAB: Record<OrderStatusFilter, string> = {
  all: 'Все',
  ACTIVE: PROJECT_STATUS_LABEL.ACTIVE,
  PAUSED: PROJECT_STATUS_LABEL.PAUSED,
  COMPLETED: PROJECT_STATUS_LABEL.COMPLETED,
  CANCELLED: PROJECT_STATUS_LABEL.CANCELLED,
};

const DEBT_TAB: Record<OrderDebtFilter, string> = {
  all: 'С долгом и без',
  owing: 'С долгом',
  settled: 'Без долга',
};

/**
 * «Заказы» — книга заказов в кабинете (запрос владельца 13.11.2026,
 * решение Р-874): те же столбцы, что в файле владельца, итог «Сумма»,
 * отбор по состоянию и долгу, выгрузка .xlsx того же вида. Строка ведёт на
 * карточку работы, где «Редактировать заказ» и «Деньги по заказу».
 */
export default async function OrdersScreen({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; debt?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/orders');
  // Руководителю — все работы, менеджеру — свои; клиенту и куратору раздела нет.
  if (!can(actor, 'REGISTRY_VIEW')) redirect(homeFor(actor));

  const sp = await searchParams;
  const filter = orderFilters(sp.status, sp.debt);
  const table = await ordersTable(actor, filter);
  const totals = orderTotals(table.rows);
  const href = (status: OrderStatusFilter, debt: OrderDebtFilter) => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (debt !== 'all') params.set('debt', debt);
    const tail = params.toString();
    return tail === '' ? '/cabinet/manage/orders' : `/cabinet/manage/orders?${tail}`;
  };
  const exportHref = href(filter.status, filter.debt).replace('/cabinet/manage/orders', '/cabinet/manage/orders/export');
  const filtered = filter.status !== 'all' || filter.debt !== 'all';

  return (
    <Shell actor={actor} current="/cabinet/manage/orders">
      <ScreenHead
        title="Заказы"
        note={`${actor.role === 'HEAD' ? 'Все работы практики' : 'Ваши работы'} — как в книге заказов: дата, заказчик, тип, описание, срок, стоимость, статус, оплачено и остаток. Строка ведёт на карточку работы: там «Редактировать заказ» и «Деньги по заказу» — записать поступление.`}
        action={<ButtonLink href="/cabinet/manage/orders/new">Новый заказ</ButtonLink>}
      />

      <FilterBar>
        <Tabs
          flush
          label="Отбор по состоянию работы"
          items={ORDER_STATUS_FILTERS.map((status) => ({
            href: href(status, filter.debt),
            label: `${STATUS_TAB[status]} · ${table.byStatus[status]}`,
            active: status === filter.status,
          }))}
        />
        <Tabs
          flush
          label="Отбор по долгу"
          items={ORDER_DEBT_FILTERS.map((debt) => ({
            href: href(filter.status, debt),
            label: `${DEBT_TAB[debt]} · ${table.byDebt[debt]}`,
            active: debt === filter.debt,
          }))}
        />
        {table.rows.length > 0 ? (
          <span style={{ marginLeft: 'auto' }}>
            <ButtonLink href={exportHref} download>
              Выгрузить .xlsx
            </ButtonLink>
          </span>
        ) : null}
      </FilterBar>

      <TableCard label="Заказы">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
          <thead>
            <tr>
              {ORDER_COLUMNS.map((column) => (
                <th key={column.key} scope="col" style={column.numeric ? TABLE_NUM_HEAD : TABLE_HEAD}>
                  {column.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={ORDER_COLUMNS.length}>
                  {table.all === 0
                    ? 'Заказов пока нет: они появляются с одобренной заявкой, «Новым заказом» и переносом книги заказов.'
                    : filtered
                      ? 'По этому отбору заказов нет.'
                      : 'Заказов нет.'}
                </td>
              </tr>
            ) : (
              table.rows.map((row) => (
                <tr key={row.code}>
                  <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{formatDate(row.orderedOn)}</td>
                  <td style={TABLE_CELL}>{row.client}</td>
                  <td style={TABLE_CELL}>{row.type}</td>
                  <td style={{ ...TABLE_CELL, minWidth: 240 }}>
                    {/* Строка ведёт на карточку работы (Р-184): ссылкой —
                        название, тема — под ним, если не повторяет его. */}
                    <a className="cab-mark" href={`/cabinet/projects/${encodeURIComponent(row.code)}`}>
                      {row.title}
                    </a>
                    {row.topic === null || row.topic === row.title ? null : (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{row.topic}</div>
                    )}
                  </td>
                  <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{formatDate(row.dueOn) ?? '—'}</td>
                  <td style={TABLE_NUM}>{row.contract === null ? '—' : formatPlain(row.contract)}</td>
                  <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{PROJECT_STATUS_LABEL[row.status]}</td>
                  <td style={TABLE_NUM}>{formatPlain(row.received)}</td>
                  <td style={TABLE_NUM}>
                    {row.rest === null ? '—' : row.overpaid > 0n ? `переплата ${formatPlain(row.overpaid)}` : formatPlain(row.rest)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {table.rows.length === 0 ? null : (
            <tfoot>
              <tr>
                <th scope="row" colSpan={5} style={{ ...TABLE_HEAD, borderBottom: 'none' }}>
                  {`Сумма · ${table.rows.length}`}
                </th>
                <td style={{ ...TABLE_NUM, fontWeight: 600, color: 'var(--pd-ink)', background: 'var(--pd-surface-quiet)', borderBottom: 'none' }}>
                  {formatPlain(totals.contract)}
                </td>
                <td style={{ ...TABLE_CELL, background: 'var(--pd-surface-quiet)', borderBottom: 'none' }} />
                <td style={{ ...TABLE_NUM, fontWeight: 600, color: 'var(--pd-ink)', background: 'var(--pd-surface-quiet)', borderBottom: 'none' }}>
                  {formatPlain(totals.received)}
                </td>
                <td style={{ ...TABLE_NUM, fontWeight: 600, color: 'var(--pd-ink)', background: 'var(--pd-surface-quiet)', borderBottom: 'none' }}>
                  {formatPlain(totals.rest)}
                  {totals.overpaid > 0n ? (
                    <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--pd-ink-muted)' }}>
                      {`переплата ${formatPlain(totals.overpaid)}`}
                    </div>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </TableCard>
    </Shell>
  );
}
