import { redirect } from 'next/navigation';

import { LeadStatusChip } from '../../../../components/cabinet/LeadStatus';
import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  Block,
  Button,
  ButtonLink,
  Card,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  ScreenHead,
  Select,
  Text,
  formatDate,
  formatDay,
  plural,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TableCard,
  Tabs,
  Pager,
  clip,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  leadSourceLabel,
  } from '../../../../lib/cabinet/lead-labels';
import { LEAD_LIST_PAGE_SIZE, leadList, leadStatusCounts } from '../../../../lib/cabinet/queries';
import { COLUMN_SETS, columnSet, leadColumns } from '../../../../lib/cabinet/table-views';
import { requireActor } from '../../../../lib/cabinet/session';
import { SUMMARY_HREF, homeFor, menuLabel } from '../../../../lib/cabinet/nav';

export const dynamic = 'force-dynamic';

/** Адрес этой же страницы с другим номером: фильтры при листании сохраняются. */
function pageHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  next.set('page', String(page));
  return `/cabinet/manage/leads?${next.toString()}`;
}

// Ячейки — по центру строки: у имени увеличенная цель нажатия (44 px), и
// при выравнивании по верху оно стояло ниже соседних ячеек (Р-270).
const CELL = { ...TABLE_CELL, verticalAlign: 'middle' } as const;

export default async function AllLeadsScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireActor('/cabinet/manage/leads');
  if (!can(actor, 'REQUEST_MODERATE')) redirect(homeFor(actor));

  const sp = await searchParams;
  const filter = {
    source: sp.source ?? '',
    // Неизвестное состояние — «любое», как в выборке (Р-245).
    status: sp.status && Object.hasOwn(LEAD_STATUS_LABEL, sp.status) ? sp.status : '',
    query: sp.query ?? '',
    page: Number(sp.page ?? '1'),
  };
  // Набор столбцов — основные или подробно; выгрузка берёт тот же (К-3, Р-593).
  const set = columnSet(sp.cols);
  const columns = leadColumns(set);
  const [list, counts] = await Promise.all([
    leadList(actor, {
      source: filter.source || undefined,
      status: filter.status || undefined,
      query: filter.query || undefined,
      page: Number.isFinite(filter.page) ? filter.page : 1,
    }),
    leadStatusCounts(actor, { source: filter.source || undefined, query: filter.query || undefined }),
  ]);

  const kept = new URLSearchParams();
  if (filter.source) kept.set('source', filter.source);
  if (filter.status) kept.set('status', filter.status);
  if (filter.query) kept.set('query', filter.query);
  if (set === 'full') kept.set('cols', 'full');

  const exportHref = `/cabinet/manage/leads/export${kept.toString() ? `?${kept.toString()}` : ''}`;
  /** Адрес с другим состоянием или набором столбцов; страница — первая. */
  const linkWith = (change: { status?: string; cols?: string }) => {
    const next = new URLSearchParams(kept);
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined) continue;
      if (value === '' || (key === 'cols' && value === 'short')) next.delete(key);
      else next.set(key, value);
    }
    const tail = next.toString();
    return tail === '' ? '/cabinet/manage/leads' : `/cabinet/manage/leads?${tail}`;
  };
  // Плашки состояний с числами при том же отборе по странице и поиску
  // (К-3, Р-593). Пустые состояния не показываются, кроме выбранного.
  const statusTabs = [
    { href: linkWith({ status: '' }), label: `Все · ${counts.all}`, active: filter.status === '' },
    ...Object.entries(LEAD_STATUS_LABEL)
      .filter(([value]) => (counts.byStatus[value] ?? 0) > 0 || value === filter.status)
      .map(([value, label]) => ({
        href: linkWith({ status: value }),
        label: `${label} · ${counts.byStatus[value] ?? 0}`,
        active: value === filter.status,
      })),
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/leads">
      <ScreenHead
        backHref={SUMMARY_HREF}
        // Экран-цель — по меню роли: менеджеру «Сегодня», руководителю
        // «Сводка» (Р-703; решение Р-756).
        backLabel={menuLabel(actor, SUMMARY_HREF) ?? 'Сводка'}
        title="Все заявки"
        note={`Обращения с сайта целиком, включая разобранные. Очередь на «${
          actor.role === 'MANAGER' ? 'Сегодня' : 'Сводке'
        }» показывает только те, что ждут решения. Отзывы сюда не попадают — у них свой порядок.`}
      />

      {/* Метод get: фильтры остаются в адресе, страницу можно сохранить и
          прислать себе же. Для поиска это важнее, чем аккуратный адрес. */}
      {/* Отбор здесь из трёх полей и двух кнопок — это блок, а не полоса:
          в полосу он встаёт столбиком и читается хуже (решение Р-183). */}
      <Card style={{ marginBottom: 20 }}>
        <Tabs label="Состояние заявок" items={statusTabs} />
        <Form method="get">
          {filter.status ? <input type="hidden" name="status" value={filter.status} /> : null}
          {set === 'full' ? <input type="hidden" name="cols" value="full" /> : null}
          <FormRow>
            <Select label="Страница сайта" name="source" defaultValue={filter.source}>
              <option value="">Любая</option>
              {Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Field
              label="Поиск"
              name="query"
              defaultValue={filter.query}
              placeholder="имя, почта, телефон, тема"
            />
          </FormRow>
          <FormActions>
            <Button>Показать</Button>
            <ButtonLink href="/cabinet/manage/leads">Сбросить</ButtonLink>
          </FormActions>
        </Form>
      </Card>

      <Block
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'baseline',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
        as="div"
      >
        <Text style={{ margin: 0 }}>
          {plural(list.total, 'Найдена', 'Найдены', 'Найдено')} {list.total}{' '}
          {plural(list.total, 'заявка', 'заявки', 'заявок')}
          {list.total > 0
            ? `, показаны с ${(list.page - 1) * LEAD_LIST_PAGE_SIZE + 1} по ${(list.page - 1) * LEAD_LIST_PAGE_SIZE + list.rows.length}`
            : ''}
        </Text>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tabs
            flush
            label="Набор столбцов"
            items={COLUMN_SETS.map((item) => ({ href: linkWith({ cols: item.key }), label: item.label, active: item.key === set }))}
          />
          {list.total > 0 ? (
            <ButtonLink href={exportHref} download>
              Выгрузить .xlsx
            </ButtonLink>
          ) : null}
        </span>
      </Block>

      {list.rows.length === 0 ? (
        <Empty
          title="Ничего не найдено"
          filters={[
            filter.source ? `страница — ${LEAD_SOURCE_LABEL[filter.source] ?? filter.source}` : '',
            filter.status ? `состояние — ${LEAD_STATUS_LABEL[filter.status] ?? filter.status}` : '',
            filter.query ? `поиск — «${filter.query}»` : '',
          ]}
          resetHref="/cabinet/manage/leads"
        >
          Обращения никуда не делись — они не подошли под это условие.
        </Empty>
      ) : (
        <TableCard label="Обращения">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, minWidth: set === 'full' ? 1900 : undefined }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={TABLE_HEAD} scope="col">
                    {column.head === 'Дата (МСК)' ? 'Дата' : column.head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((lead) => (
                <tr key={lead.id}>
                  {columns.map((column) => {
                    switch (column.key) {
                      // Мгновение — днём по Москве; в книге — с минутами (Р-245).
                      case 'createdAt':
                        return <td key={column.key} style={{ ...CELL, whiteSpace: 'nowrap' }}>{formatDay(lead.createdAt)}</td>;
                      // Имя ведёт на разбор: экран заявки заведён решением
                      // Р-172, ссылки на него отсюда не было вовсе (Р-183).
                      case 'name':
                        return (
                          <td key={column.key} style={CELL}>
                            <a className="cab-mark" href={`/cabinet/manage/leads/${lead.id}`}>{lead.name ?? 'Без имени'}</a>
                          </td>
                        );
                      case 'status':
                        return (
                          <td key={column.key} style={CELL}>
                            <LeadStatusChip status={lead.status} />
                          </td>
                        );
                      // Длинное сообщение на экране — началом; в книге целиком.
                      case 'message':
                        return <td key={column.key} style={CELL}>{clip(lead.message ?? '', 120) || '—'}</td>;
                      default: {
                        const value = column.value(lead);
                        return (
                          <td key={column.key} style={column.numeric ? TABLE_NUM : CELL}>
                            {value === '' || value === null || value === undefined ? '—' : String(value)}
                          </td>
                        );
                      }
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Постраничность — общей частью (УМ-08, Р-390). */}
      <Pager label="Страницы перечня" page={list.page} pages={list.pages} hrefFor={(page) => pageHref(kept, page)} />
    </Shell>
  );
}
