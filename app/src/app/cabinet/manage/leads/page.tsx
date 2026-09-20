import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  Block,
  Button,
  ButtonLink,
  Card,
  Chip,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  ScreenHead,
  Select,
  Text,
  formatDate,
  plural,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  leadSourceLabel,
  leadStatusLabel,
} from '../../../../lib/cabinet/lead-labels';
import { LEAD_LIST_PAGE_SIZE, leadList } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/** Адрес этой же страницы с другим номером: фильтры при листании сохраняются. */
function pageHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  next.set('page', String(page));
  return `/cabinet/manage/leads?${next.toString()}`;
}

export default async function AllLeadsScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_MODERATE')) redirect('/cabinet/projects');

  const sp = await searchParams;
  const filter = {
    source: sp.source ?? '',
    status: sp.status ?? '',
    query: sp.query ?? '',
    page: Number(sp.page ?? '1'),
  };
  const list = await leadList(actor, {
    source: filter.source || undefined,
    status: filter.status || undefined,
    query: filter.query || undefined,
    page: Number.isFinite(filter.page) ? filter.page : 1,
  });

  const kept = new URLSearchParams();
  if (filter.source) kept.set('source', filter.source);
  if (filter.status) kept.set('status', filter.status);
  if (filter.query) kept.set('query', filter.query);

  const exportHref = `/cabinet/manage/leads/export${kept.toString() ? `?${kept.toString()}` : ''}`;

  return (
    <Shell actor={actor} current="/cabinet/manage/leads">
      <ScreenHead
        backHref="/cabinet/manage"
        backLabel="к сводке"
        title="Все заявки"
        note="Обращения с сайта целиком, включая разобранные. Очередь на «Сводке» показывает только те, что ждут решения. Отзывы сюда не попадают — у них свой порядок."
      />

      {/* Метод get: фильтры остаются в адресе, страницу можно сохранить и
          прислать себе же. Для поиска это важнее, чем аккуратный адрес. */}
      {/* Отбор здесь из трёх полей и двух кнопок — это блок, а не полоса:
          в полосу он встаёт столбиком и читается хуже (решение Р-183). */}
      <Card style={{ marginBottom: 20 }}>
        <Form method="get">
          <FormRow>
            <Select label="Страница сайта" name="source" defaultValue={filter.source}>
              <option value="">Любая</option>
              {Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select label="Состояние" name="status" defaultValue={filter.status}>
              <option value="">Любое</option>
              {Object.entries(LEAD_STATUS_LABEL).map(([value, label]) => (
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
          Найдено {list.total} {plural(list.total, 'заявка', 'заявки', 'заявок')}
          {list.total > 0
            ? `, показаны с ${(list.page - 1) * LEAD_LIST_PAGE_SIZE + 1} по ${(list.page - 1) * LEAD_LIST_PAGE_SIZE + list.rows.length}`
            : ''}
        </Text>
        {list.total > 0 ? <ButtonLink href={exportHref}>Выгрузить в таблицу</ButtonLink> : null}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Дата</th>
                <th style={TABLE_HEAD} scope="col">Страница</th>
                <th style={TABLE_HEAD} scope="col">Кто</th>
                <th style={TABLE_HEAD} scope="col">Контакт</th>
                <th style={TABLE_HEAD} scope="col">Тема</th>
                <th style={TABLE_HEAD} scope="col">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((lead) => (
                <tr key={lead.id}>
                  <td style={TABLE_CELL}>{formatDate(lead.createdAt)}</td>
                  <td style={TABLE_CELL}>{leadSourceLabel(lead.source)}</td>
                  {/* Имя ведёт на разбор: экран заявки заведён решением
                      Р-172, но ссылки на него отсюда не было вовсе, и
                      попасть туда можно было только со сводки (Р-183). */}
                  <td style={TABLE_CELL}>
                    <a href={`/cabinet/manage/leads/${lead.id}`}>{lead.name ?? 'Без имени'}</a>
                  </td>
                  <td style={TABLE_CELL}>{lead.contact}</td>
                  <td style={TABLE_CELL}>{lead.topic ?? lead.need ?? '—'}</td>
                  <td style={TABLE_CELL}>
                    <Chip tone={lead.projectId === null ? 'neutral' : 'accent'}>
                      {leadStatusLabel(lead.status)}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {list.pages > 1 ? (
        <nav
          aria-label="Страницы перечня"
          style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}
        >
          {list.page > 1 ? (
            <a className="cab-mark" href={pageHref(kept, list.page - 1)}>
              Предыдущие
            </a>
          ) : null}
          <Text muted style={{ margin: 0 }}>
            Страница {list.page} из {list.pages}
          </Text>
          {list.page < list.pages ? (
            <a className="cab-mark" href={pageHref(kept, list.page + 1)}>
              Следующие
            </a>
          ) : null}
        </nav>
      ) : null}
    </Shell>
  );
}
