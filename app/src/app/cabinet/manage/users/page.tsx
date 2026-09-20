import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Notice,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  Text,
  formatDate,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { ROLE_LABEL, STATUS_LABEL, listUsers, type Role } from '../../../../lib/cabinet/admin';
import { currentActor } from '../../../../lib/cabinet/session';
import { changeUserRole, changeUserStatus, inviteUser, updateExpertNda } from '../../actions';

export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['CLIENT', 'EXPERT', 'MANAGER', 'HEAD'];

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
      <ScreenHead
        title="Пользователи"
        note="Роль назначается здесь и нигде больше: она не приходит с формы входа и не меняется самим пользователем. При смене роли и при приостановке доступа все сессии отзываются."
      />

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
      </Card>

      <TableCard label="Пользователи кабинета">
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
                      <Form action={changeUserRole} inline>
                        <input type="hidden" name="userId" value={user.id} />
                        <Select
                          label={`Роль: ${user.fullName}`}
                          labelHidden
                          name="role"
                          scope={user.id}
                          defaultValue={user.role}
                          minWidth={150}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </Select>
                        <Button tone="quiet">Сменить</Button>
                      </Form>
                    )}
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
                    {self || erased ? null : (
                      <Form action={changeUserStatus} inline style={{ marginTop: 8 }}>
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
                      <>
                        {/* Сохранённая дата стоит русским написанием: в самом
                            поле её формат задаёт браузер по настройкам
                            системы, и «08/12/2025» читается двояко
                            (решение Р-179). */}
                        {user.expertProfile.ndaSignedAt === null ? null : (
                          <div style={{ marginBottom: 8 }}>
                            <Chip>подписан {formatDate(user.expertProfile.ndaSignedAt)}</Chip>
                          </div>
                        )}
                      <Form action={updateExpertNda} inline>
                        <input type="hidden" name="userId" value={user.id} />
                        <Field
                          label={`Дата подписания договора поручения: ${user.fullName}`}
                          labelHidden
                          name="signedOn"
                          type="date"
                          scope={user.id}
                          defaultValue={
                            user.expertProfile.ndaSignedAt?.toISOString().slice(0, 10) ?? ''
                          }
                          minWidth={160}
                        />
                        <Button tone="quiet">Сохранить</Button>
                      </Form>
                      </>
                    )}
                    {user.expertProfile !== null && user.expertProfile.ndaSignedAt === null ? (
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-secondary)', marginTop: 4 }}>
                        без договора доступ к материалам клиента не выдаётся
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
    </Shell>
  );
}
