import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Form,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  FilterBar,
  FilterSearch,
  Tabs,
  Text,
  formatDate,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { flaggedMessages } from '../../../../lib/cabinet/messages';
import { clientRegistry, expertRegistry } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/** Сколько строк реестра показывается на одной странице. */
const PAGE_SIZE = 20;

type Tab = 'clients' | 'experts' | 'flagged';

const TABS: readonly Tab[] = ['clients', 'experts', 'flagged'];

/**
 * Реестры клиентов и экспертов.
 *
 * Три раздела стояли на одном экране друг под другом и давали три с
 * половиной экрана прокрутки: чтобы посмотреть экспертов, приходилось
 * пролистать всех клиентов. Разделы разведены вкладками, и выборка идёт
 * только по открытой — два лишних запроса к базе на каждом открытии
 * экрана тоже исчезают (решение Р-173).
 */
export default async function RegistryScreen({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REGISTRY_VIEW')) redirect('/cabinet/projects');

  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'clients';
  const query = (sp.q ?? '').trim();
  const needle = query.toLocaleLowerCase('ru');

  const clients = tab === 'clients' ? await clientRegistry(actor) : [];
  const experts = tab === 'experts' ? await expertRegistry(actor) : [];
  const flagged = tab === 'flagged' ? await flaggedMessages(actor) : [];

  const matched =
    needle === ''
      ? clients
      : clients.filter(
          (row) =>
            row.fullName.toLocaleLowerCase('ru').includes(needle) ||
            (row.university ?? '').toLocaleLowerCase('ru').includes(needle) ||
            (row.speciality ?? '').toLocaleLowerCase('ru').includes(needle),
        );
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const shown = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (next: Tab, nextPage = 1) => {
    const params = new URLSearchParams();
    if (next !== 'clients') params.set('tab', next);
    if (query !== '' && next === 'clients') params.set('q', query);
    if (nextPage > 1) params.set('page', String(nextPage));
    const tail = params.toString();
    return tail === '' ? '/cabinet/manage/registry' : `/cabinet/manage/registry?${tail}`;
  };

  // Контакты клиента попадают в объект только тем, кому они открыты
  // матрицей прав: у столбца нет данных — нет и столбца.
  const withContacts = clients.length > 0 && 'email' in clients[0]!;

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <ScreenHead
        title="Реестры"
        note="Клиенты, эксперты и сообщения с признаком передачи контактов."
      />

      {/* Вкладки и поиск стоят одной полосой: прежде они шли двумя
          рядами, и поиск отрывался от раздела, к которому относится
          (решение Р-183). */}
      <FilterBar>
        <Tabs
          flush
          label="Разделы реестра"
          items={[
            { href: href('clients'), label: 'Клиенты', active: tab === 'clients' },
            { href: href('experts'), label: 'Эксперты', active: tab === 'experts' },
            { href: href('flagged'), label: 'Контакты в переписке', active: tab === 'flagged' },
          ]}
        />
        {tab !== 'clients' || (clients.length <= PAGE_SIZE && query === '') ? null : (
          <FilterSearch>
            <Form method="get" inline>
              <Field
                label="Поиск по клиентам"
                name="q"
                labelHidden
                defaultValue={query}
                placeholder="Фамилия, вуз или направление"
                minWidth={220}
                dense
              />
              <Button tone="quiet">Найти</Button>
            </Form>
          </FilterSearch>
        )}
      </FilterBar>

      {tab === 'clients' ? (
        <>
          <TableCard label="Клиенты">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Клиент</th>
                  <th style={TABLE_HEAD} scope="col">Вуз и специальность</th>
                  {withContacts ? (
                    <th style={TABLE_HEAD} scope="col">Контакты</th>
                  ) : null}
                  <th style={TABLE_HEAD} scope="col">Работ</th>
                  <th style={TABLE_HEAD} scope="col">Последний вход</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td style={TABLE_CELL} colSpan={withContacts ? 5 : 4}>
                      {clients.length === 0
                        ? 'Клиентов пока нет.'
                        : `Под поиском «${query}» ничего нет. Всего клиентов — ${clients.length}.`}
                    </td>
                  </tr>
                ) : (
                  shown.map((client) => (
                    <tr key={client.id}>
                      <td style={TABLE_CELL}>{client.fullName}</td>
                      <td style={TABLE_CELL}>
                        {[client.university, client.speciality].filter(Boolean).join(' · ') || '—'}
                      </td>
                      {/* Почта и телефон одной строкой: двумя ярусами они
                          давали строку в 67 px, и двадцать строк реестра
                          занимали полторы тысячи пикселей (решение Р-184). */}
                      {'email' in client ? (
                        <td style={TABLE_CELL}>
                          {[client.email, client.phone].filter(Boolean).join(' · ') || '—'}
                        </td>
                      ) : null}
                      <td style={TABLE_CELL}>
                        {client.projects}
                        {client.active > 0 ? ` · ${client.active} в работе` : ''}
                      </td>
                      <td style={TABLE_CELL}>{formatDate(client.lastLoginAt) ?? 'не входил'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>

          {pages <= 1 ? null : (
            <nav
              aria-label="Страницы реестра клиентов"
              style={{
                display: 'flex',
                gap: 20,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 20,
              }}
            >
              {page > 1 ? (
                <a className="cab-mark" href={href('clients', page - 1)}>
                  Предыдущие
                </a>
              ) : null}
              <Text muted size={14}>
                Страница {page} из {pages} · всего {matched.length}{' '}
                {plural(matched.length, 'клиент', 'клиента', 'клиентов')}
              </Text>
              {page < pages ? (
                <a className="cab-mark" href={href('clients', page + 1)}>
                  Следующие
                </a>
              ) : null}
            </nav>
          )}
        </>
      ) : null}

      {tab === 'experts' ? (
        <>
          <TableCard label="Эксперты">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Эксперт</th>
                  <th style={TABLE_HEAD} scope="col">Специализация</th>
                  <th style={TABLE_HEAD} scope="col">Договор поручения</th>
                  <th style={TABLE_HEAD} scope="col">Загрузка</th>
                </tr>
              </thead>
              <tbody>
                {experts.length === 0 ? (
                  <tr>
                    <td style={TABLE_CELL} colSpan={4}>
                      Экспертов пока нет.
                    </td>
                  </tr>
                ) : (
                  experts.map((expert) => (
                    <tr key={expert.id}>
                      <td style={TABLE_CELL}>
                        {expert.fullName}
                        {expert.degree === null ? '' : ` · ${expert.degree}`}
                      </td>
                      <td style={TABLE_CELL}>{expert.specialization ?? '—'}</td>
                      <td style={TABLE_CELL}>
                        {expert.ndaSignedAt === null ? (
                          <Chip>не подписан</Chip>
                        ) : (
                          <Chip>подписан {formatDate(expert.ndaSignedAt)}</Chip>
                        )}
                      </td>
                      <td style={TABLE_CELL}>
                        {expert.active} в работе из {expert.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
          <Text muted size={13} style={{ marginTop: 10 }}>
            Без подписанного договора поручения обработки персональных данных эксперт не получает
            доступа к материалам клиента, даже будучи назначенным на работу.
          </Text>
        </>
      ) : null}

      {tab === 'flagged' ? (
        <Card>
          {flagged.length === 0 ? (
            <Text muted>Таких сообщений нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {flagged.map((message) => (
                <li key={message.id}>
                  <Text size={14}>{message.body}</Text>
                  <Text muted size={13} style={{ marginTop: 4 }}>
                    {message.author.fullName} · {message.project.title} ·{' '}
                    {formatDate(message.createdAt)}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          <Text muted size={13} style={{ marginTop: 12 }}>
            Отправку такие сообщения не блокируют: запрет породил бы обход, а пометка даёт повод
            вмешаться.
          </Text>
        </Card>
      ) : null}
    </Shell>
  );
}
