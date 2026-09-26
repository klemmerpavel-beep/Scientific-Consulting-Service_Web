import { flashText } from '../../../../lib/cabinet/flash';
import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Block,
  Button,
  Disclosure,
  Empty,
  Chip,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Notice,
  FilterBar,
  ScreenHead,
  Select,
  Tabs,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  Text,
  formatDate,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  ROLE_LABEL,
  STATUS_LABEL,
  USER_PAGE_SIZE,
  accessLinkPeople,
  expertsForNda,
  listUsers,
  type Role,
} from '../../../../lib/cabinet/admin';
import { currentActor } from '../../../../lib/cabinet/session';
import { AccessLink } from '../../../../components/cabinet/AccessLink';
import { mailConfigured } from '../../../../lib/cabinet/mail';
import {
  changeUserRole,
  changeUserStatus,
  giveAccessLink,
  inviteUser,
  updateExpertNda,
} from '../../actions';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];

type UserState = 'ACTIVE' | 'SUSPENDED' | 'ERASED';
const STATES: UserState[] = ['ACTIVE', 'SUSPENDED', 'ERASED'];

export default async function UsersScreen({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    role?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'USER_MANAGE')) redirect('/cabinet/projects');

  const flags = await searchParams;
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(flags.error);
  const role = ROLES.includes(flags.role as Role) ? (flags.role as Role) : undefined;
  const status = STATES.includes(flags.status as UserState)
    ? (flags.status as UserState)
    : undefined;
  // Списки для договоров и ссылок входа — отдельными выборками: со страницы
  // перечня в двадцать строк эксперты и нужные люди уходили на следующие
  // страницы (решение Р-225). Ссылка выдаётся только действующим записям:
  // приостановленной и обезличенной вход закрыт (решение Р-195).
  const [list, experts, active] = await Promise.all([
    listUsers(actor, { role, status, page: Number(flags.page ?? '1') }),
    expertsForNda(actor),
    accessLinkPeople(actor),
  ]);
  const users = list.rows;
  // Текст блока зависит от того, настроена ли почта: с ней ссылка отсюда
  // — запасной путь, без неё — единственный.
  const mailReady = mailConfigured();

  /** Адрес того же экрана с другим отбором или страницей. */
  const href = (next: { role?: Role | null; status?: UserState | null; page?: number }) => {
    const params = new URLSearchParams();
    const wantRole = next.role === undefined ? role : (next.role ?? undefined);
    const wantStatus = next.status === undefined ? status : (next.status ?? undefined);
    if (wantRole !== undefined) params.set('role', wantRole);
    if (wantStatus !== undefined) params.set('status', wantStatus);
    if (next.page !== undefined && next.page > 1) params.set('page', String(next.page));
    const tail = params.toString();
    return tail === '' ? '/cabinet/manage/users' : `/cabinet/manage/users?${tail}`;
  };

  return (
    <Shell actor={actor} current="/cabinet/manage/users">
      <ScreenHead
        title="Учётные записи"
        note="Роль назначается здесь и нигде больше: она не приходит с формы входа и не меняется самим пользователем. При смене роли и при приостановке доступа все сессии отзываются."
      />

      {failure === undefined ? null : (
        <Block as="div" style={{ marginBottom: 20 }}>
          <Notice tone="error" role="alert">
            {failure}
          </Notice>
        </Block>
      )}
      {flags.created === undefined ? null : (
        <Block as="div" style={{ marginBottom: 20 }}>
          <Notice>
            Учётная запись заведена. Ссылку входа человек запрашивает сам на странице входа — почта
            уходит только по его действию.
          </Notice>
        </Block>
      )}

      {/* Завести запись нужно раз в несколько месяцев, а форма занимала
          треть экрана постоянно. Под свёрткой она на месте и не мешает
          работе с перечнем (решение Р-183). */}
      <Disclosure title="Завести учётную запись" style={{ marginBottom: 20 }}>
        <Form action={inviteUser}>
          <FormRow>
            <Field
              label="Имя и отчество"
              name="fullName"
              required
              placeholder="Соловьёв Дмитрий Викторович"
            />
            <Field label="Почта" name="email" type="email" required placeholder="expert@example.org" />
            <Select label="Роль" name="role" defaultValue="EXPERT">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormActions>
            <Button>Завести</Button>
          </FormActions>
        </Form>
      </Disclosure>

      <FilterBar>
        <Tabs
          flush
          label="Отбор по роли"
          items={[
            { href: href({ role: null }), label: 'Все роли', active: role === undefined },
            ...ROLES.map((item) => ({
              href: href({ role: item }),
              label: ROLE_LABEL[item],
              active: role === item,
            })),
          ]}
        />
        <Tabs
          flush
          label="Отбор по состоянию"
          items={[
            { href: href({ status: null }), label: 'Любое', active: status === undefined },
            ...STATES.map((item) => ({
              href: href({ status: item }),
              label: STATUS_LABEL[item],
              active: status === item,
            })),
          ]}
        />
      </FilterBar>

      <Text muted size={13} style={{ marginBottom: 12 }}>
        {list.total === 0
          ? 'Ни одной записи под этим отбором'
          : `Записей ${list.total}, показаны с ${(list.page - 1) * USER_PAGE_SIZE + 1} по ${(list.page - 1) * USER_PAGE_SIZE + users.length}`}
      </Text>

      {users.length === 0 ? (
        <Empty
          title="Ничего не найдено"
          filters={[
            role === undefined ? '' : `роль — ${ROLE_LABEL[role]}`,
            status === undefined ? '' : `состояние — ${STATUS_LABEL[status]}`,
          ]}
          resetHref="/cabinet/manage/users"
        >
          Учётные записи никуда не делись — они не подошли под это условие.
        </Empty>
      ) : (
      <TableCard label="Пользователи кабинета">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1240 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Кто</th>
              <th style={TABLE_HEAD} scope="col">Роль</th>
              <th style={TABLE_HEAD} scope="col">Состояние</th>
              <th style={TABLE_HEAD} scope="col">Последний вход</th>
              <th style={TABLE_HEAD} scope="col">Договор поручения</th>
              <th style={TABLE_HEAD} scope="col">Правка</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === actor.id;
              const erased = user.status === 'ERASED';
              const nda = user.expertProfile?.ndaSignedAt ?? null;
              return (
                <tr key={user.id}>
                  <td style={TABLE_CELL}>
                    {user.fullName}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{user.email}</div>
                  </td>
                  <td style={TABLE_CELL}>
                    {ROLE_LABEL[user.role as Role]}
                    {self ? (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        собственная запись
                      </div>
                    ) : null}
                  </td>
                  <td style={TABLE_CELL}>
                    <Chip tone={user.status === 'ACTIVE' ? 'accent' : 'neutral'}>
                      {STATUS_LABEL[user.status as keyof typeof STATUS_LABEL]}
                    </Chip>
                  </td>
                  <td style={TABLE_CELL}>
                    {formatDate(user.lastLoginAt) ?? 'не входил'} · сессий {user._count.sessions}
                  </td>
                  {/* Дата договора стоит одним написанием — русским. Поле
                      правки уехало в соседнюю колонку: браузер печатает в
                      нём дату по настройкам системы, и «08/12/2025» рядом
                      с «подписан 12 августа 2025» читалось двояко
                      (решение Р-183). */}
                  <td style={TABLE_CELL}>
                    {user.expertProfile === null
                      ? '—'
                      : nda === null
                        ? 'не подписан'
                        : formatDate(nda)}
                    {user.expertProfile !== null && nda === null ? (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-secondary)' }}>
                        без него материалы клиента не выдаются
                      </div>
                    ) : null}
                  </td>
                  {/* Действия — одной строкой: прежде каждое стояло своей
                      формой в теле строки, и строка вырастала до ста
                      семидесяти пикселей (решение Р-183). */}
                  <td style={TABLE_CELL}>
                    {/* Действия переносятся на вторую строку, когда ячейке
                        тесно: прежде «Приостановить» уезжала за правый край
                        и читалась обрезанной (решение Р-196). */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      {self || erased ? null : (
                        <Form action={changeUserRole} inline>
                          <input type="hidden" name="userId" value={user.id} />
                          <Select
                            label={`Роль: ${user.fullName}`}
                            labelHidden
                            name="role"
                            scope={user.id}
                            defaultValue={user.role}
                            minWidth={140}
                          >
                            {ROLES.map((item) => (
                              <option key={item} value={item}>
                                {ROLE_LABEL[item]}
                              </option>
                            ))}
                          </Select>
                          <Button tone="quiet">Сменить</Button>
                        </Form>
                      )}
                      {self || erased ? null : (
                        <Form action={changeUserStatus} inline>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
                          />
                          <Button tone="quiet">
                            {user.status === 'ACTIVE' ? 'Приостановить' : 'Вернуть доступ'}
                          </Button>
                        </Form>
                      )}
                      {self || erased ? (
                        <Text muted size={13} style={{ margin: 0 }}>
                          {erased ? 'запись обезличена' : 'себя не правят'}
                        </Text>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
      )}

      {/* Вход без письма: пока почтовый канал практики не настроен, ссылку
          на вход выдавали командой на сервере, и открытие кабинета
          клиенту было делом системного администратора. Теперь это делает
          руководитель (решение Р-195). */}
      <Disclosure title="Выдать ссылку входа" style={{ marginTop: 20 }}>
        <Text size={14} style={{ marginBottom: 14 }}>
          {mailReady
            ? 'Письмо со ссылкой приходит человеку само, когда он запрашивает вход. Ссылка отсюда нужна, если письмо не дошло: она действует два часа и срабатывает один раз.'
            : 'Почтовый канал практики не настроен, и письмо со ссылкой отправить некуда. Выдайте ссылку здесь и передайте её человеку тем каналом, которым с ним уже разговариваете: она действует два часа и срабатывает один раз.'}
        </Text>
        {active.length === 0 ? (
          <Text muted>Действующих учётных записей нет: ссылку выдавать некому.</Text>
        ) : (
          <AccessLink
            action={giveAccessLink}
            people={active.map((user) => ({
              id: user.id,
              label: `${user.fullName} · ${ROLE_LABEL[user.role as Role]} · ${user.email}`,
            }))}
          />
        )}
      </Disclosure>

      {/* Дата договора поручения касается только экспертов, и править её
          приходится раз в год. В строке она держала третью форму и
          растягивала строку; здесь она рядом с теми, кого касается
          (решение Р-183). */}
      {experts.length === 0 ? null : (
        <Disclosure title="Договоры поручения обработки данных" style={{ marginTop: 20 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
            {experts.map((user) => (
              <li key={user.id} style={{ display: 'grid', gap: 8 }}>
                <Text size={14} style={{ margin: 0 }}>
                  {user.fullName}
                  {user.expertProfile?.ndaSignedAt == null
                    ? ' · без договора материалы клиента не выдаются'
                    : ` · подписан ${formatDate(user.expertProfile.ndaSignedAt)}`}
                </Text>
                <Form action={updateExpertNda} inline>
                  <input type="hidden" name="userId" value={user.id} />
                  <Field
                    label={`Дата подписания: ${user.fullName}`}
                    labelHidden
                    name="signedOn"
                    type="date"
                    scope={user.id}
                    defaultValue={user.expertProfile?.ndaSignedAt?.toISOString().slice(0, 10) ?? ''}
                    minWidth={170}
                    dense
                  />
                  <Button tone="quiet">Сохранить</Button>
                </Form>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {list.pages <= 1 ? null : (
        <nav
          aria-label="Страницы перечня"
          style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 20 }}
        >
          {list.page > 1 ? (
            <a className="cab-mark" href={href({ page: list.page - 1 })}>
              Предыдущие
            </a>
          ) : null}
          <Text muted style={{ margin: 0 }}>
            Страница {list.page} из {list.pages}
          </Text>
          {list.page < list.pages ? (
            <a className="cab-mark" href={href({ page: list.page + 1 })}>
              Следующие
            </a>
          ) : null}
        </nav>
      )}
    </Shell>
  );
}
