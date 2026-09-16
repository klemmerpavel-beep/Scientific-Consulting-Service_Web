import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Card, Chip, Heading, Mono, Text, formatDate } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { flaggedMessages } from '../../../../lib/cabinet/messages';
import { clientRegistry, expertRegistry } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const cell: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--pd-divider)',
  fontFamily: SANS,
  fontSize: 14,
  color: 'var(--pd-ink-secondary)',
  textAlign: 'left',
  verticalAlign: 'top',
};

const head: React.CSSProperties = {
  ...cell,
  fontWeight: 500,
  color: 'var(--pd-ink)',
  background: 'var(--pd-surface-quiet)',
  whiteSpace: 'nowrap',
};

export default async function RegistryScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REGISTRY_VIEW')) redirect('/cabinet/projects');

  const [clients, experts, flagged] = await Promise.all([
    clientRegistry(actor),
    expertRegistry(actor),
    flaggedMessages(actor),
  ]);

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <Mono>Реестры</Mono>
      <Heading level={1} style={{ margin: '12px 0 24px' }}>
        Клиенты и эксперты
      </Heading>

      <section style={{ marginBottom: 32 }}>
        <Mono>Клиенты</Mono>
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Клиент</th>
                <th style={head}>Вуз и специальность</th>
                {'email' in (clients[0] ?? {}) ? <th style={head}>Контакты</th> : null}
                <th style={head}>Проектов</th>
                <th style={head}>Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td style={cell} colSpan={5}>
                    Клиентов пока нет.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td style={cell}>{client.fullName}</td>
                    <td style={cell}>
                      {[client.university, client.speciality].filter(Boolean).join(' · ') || '—'}
                    </td>
                    {'email' in client ? (
                      <td style={cell}>
                        {client.email ?? '—'}
                        {client.phone === null || client.phone === undefined ? null : (
                          <>
                            <br />
                            {client.phone}
                          </>
                        )}
                      </td>
                    ) : null}
                    <td style={cell}>
                      {client.projects}
                      {client.active > 0 ? ` · ${client.active} в работе` : ''}
                    </td>
                    <td style={cell}>{formatDate(client.lastLoginAt) ?? 'не входил'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section style={{ marginBottom: 32 }}>
        <Mono>Эксперты</Mono>
        <Card style={{ marginTop: 12, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Эксперт</th>
                <th style={head}>Специализация</th>
                <th style={head}>Договор поручения</th>
                <th style={head}>Загрузка</th>
              </tr>
            </thead>
            <tbody>
              {experts.length === 0 ? (
                <tr>
                  <td style={cell} colSpan={4}>
                    Экспертов пока нет.
                  </td>
                </tr>
              ) : (
                experts.map((expert) => (
                  <tr key={expert.id}>
                    <td style={cell}>
                      {expert.fullName}
                      {expert.degree === null ? '' : ` · ${expert.degree}`}
                    </td>
                    <td style={cell}>{expert.specialization ?? '—'}</td>
                    <td style={cell}>
                      {expert.ndaSignedAt === null ? (
                        <Chip tone="warn">не подписан</Chip>
                      ) : (
                        <Chip tone="ok">{formatDate(expert.ndaSignedAt)}</Chip>
                      )}
                    </td>
                    <td style={cell}>
                      {expert.active} в работе из {expert.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
        <Text muted size={13} style={{ marginTop: 10 }}>
          Без подписанного договора поручения обработки персональных данных эксперт не получает
          доступа к материалам клиента, даже будучи назначенным на проект.
        </Text>
      </section>

      <section>
        <Mono>Сообщения с признаком передачи контактов</Mono>
        <Card style={{ marginTop: 12 }}>
          {flagged.length === 0 ? (
            <Text muted>Таких сообщений нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {flagged.map((message) => (
                <li
                  key={message.id}
                  style={{ borderBottom: '1px solid var(--pd-divider)', paddingBottom: 14 }}
                >
                  <Text size={14}>{message.body}</Text>
                  <Text muted size={13} style={{ marginTop: 4 }}>
                    {message.author.fullName} · {message.project.code} ·{' '}
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
      </section>
    </Shell>
  );
}
