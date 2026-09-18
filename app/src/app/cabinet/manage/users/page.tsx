import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Button, Card, Chip, Field, Heading, Mono, Notice, Text, formatDate,
  TABLE_CELL,
  TABLE_HEAD,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { ROLE_LABEL, STATUS_LABEL, listUsers, type Role } from '../../../../lib/cabinet/admin';
import { currentActor } from '../../../../lib/cabinet/session';
import { changeUserRole, changeUserStatus, inviteUser, updateExpertNda } from '../../actions';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];

const field: React.CSSProperties = {
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--pd-edge-neutral)',
  background: 'var(--pd-ink-inverse)',
  color: 'var(--pd-ink)',
  fontFamily: SANS,
  fontSize: 16,
};

export default async function UsersScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'USER_MANAGE')) redirect('/cabinet/projects');

  const flags = await searchParams;
  const users = await listUsers(actor);

  return (
    <Shell actor={actor} current="/cabinet/manage/users">
      <Mono>Учётные записи</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Пользователи
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Роль назначается здесь и нигде больше: она не приходит с формы входа и не меняется самим
        пользователем. При смене роли и при приостановке доступа все сессии отзываются — вкладка,
        открытая до изменения, иначе доработала бы прежними правами.
      </Text>

      {flags.error === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="error" role="alert">
            {decodeURIComponent(flags.error)}
          </Notice>
        </div>
      )}
      {flags.created === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice>
            Учётная запись заведена. Ссылку входа человек запрашивает сам на странице входа — почта
            уходит только по его действию.
          </Notice>
        </div>
      )}

      <Card style={{ marginBottom: 32 }}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Завести учётную запись
        </Heading>
        <form action={inviteUser} style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', alignItems: 'end' }}>
          <Field label="Имя и отчество" name="fullName" required placeholder="Соловьёв Дмитрий Викторович" />
          <Field label="Почта" name="email" type="email" required placeholder="expert@example.org" />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Роль</span>
            <select name="role" defaultValue="EXPERT" style={field}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Button type="submit">Завести</Button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Кто</th>
              <th style={TABLE_HEAD} scope="col">Роль</th>
              <th style={TABLE_HEAD} scope="col">Состояние</th>
              <th style={TABLE_HEAD} scope="col">Последний вход</th>
              <th style={TABLE_HEAD} scope="col">Договор поручения</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === actor.id;
              const erased = user.status === 'ERASED';
              return (
                <tr key={user.id}>
                  <td style={TABLE_CELL}>
                    {user.fullName}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{user.email}</div>
                  </td>
                  <td style={TABLE_CELL}>
                    {self || erased ? (
                      ROLE_LABEL[user.role as Role]
                    ) : (
                      <form action={changeUserRole} style={{ display: 'flex', gap: 8 }}>
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          name="role"
                          defaultValue={user.role}
                          aria-label={`Роль: ${user.fullName}`}
                          style={{ ...field, minWidth: 150 }}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" tone="quiet">
                          Сменить
                        </Button>
                      </form>
                    )}
                    {self ? (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        собственная запись
                      </div>
                    ) : null}
                  </td>
                  <td style={TABLE_CELL}>
                    <Chip tone={user.status === 'ACTIVE' ? 'ok' : user.status === 'ERASED' ? 'neutral' : 'warn'}>
                      {STATUS_LABEL[user.status as keyof typeof STATUS_LABEL]}
                    </Chip>
                    {self || erased ? null : (
                      <form action={changeUserStatus} style={{ marginTop: 8 }}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
                        />
                        <Button type="submit" tone="quiet">
                          {user.status === 'ACTIVE' ? 'Приостановить' : 'Вернуть доступ'}
                        </Button>
                      </form>
                    )}
                  </td>
                  <td style={TABLE_CELL}>
                    {formatDate(user.lastLoginAt) ?? 'не входил'}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      сессий {user._count.sessions}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>
                    {user.expertProfile === null ? (
                      '—'
                    ) : (
                      <form action={updateExpertNda} style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="date"
                          name="signedOn"
                          aria-label={`Дата подписания договора поручения: ${user.fullName}`}
                          defaultValue={user.expertProfile.ndaSignedAt?.toISOString().slice(0, 10) ?? ''}
                          style={{ ...field, minWidth: 160 }}
                        />
                        <Button type="submit" tone="quiet">
                          Сохранить
                        </Button>
                      </form>
                    )}
                    {user.expertProfile !== null && user.expertProfile.ndaSignedAt === null ? (
                      <div style={{ fontSize: 13, color: 'var(--pd-err-ink)', marginTop: 4 }}>
                        без договора доступ к материалам клиента не выдаётся
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </Shell>
  );
}
