import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Mono,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  Tabs,
  Text,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  auditEvents,
  fileAccessEvents,
  formatMoment,
  journalActions,
  journalActors,
} from '../../../../lib/cabinet/journals';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const FILE_ACTION_LABEL: Record<string, string> = {
  UPLOAD: 'загрузка',
  PRESIGN: 'выдача ссылки',
  DOWNLOAD: 'скачивание',
  PURGE: 'изъятие',
};

function date(value: string | undefined): Date | null {
  if (value === undefined || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function AuditScreen({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    from?: string;
    to?: string;
    actorId?: string;
    action?: string;
    projectCode?: string;
  }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Журналы читает руководитель: в них видны действия всех и по всем проектам.
  if (!can(actor, 'AUDIT_VIEW')) redirect('/cabinet/projects');

  const query = await searchParams;
  const files = query.kind === 'files';
  const filter = {
    from: date(query.from),
    to: date(query.to),
    actorId: query.actorId ?? null,
    action: query.action ?? null,
    projectCode: query.projectCode ?? null,
  };

  const [actions, actors] = await Promise.all([journalActions(actor), journalActors(actor)]);
  const events = files ? [] : await auditEvents(actor, filter);
  const accesses = files ? await fileAccessEvents(actor, filter) : [];

  const exportHref = `/cabinet/manage/audit/export?${new URLSearchParams({
    kind: files ? 'files' : 'actions',
    from: query.from ?? '',
    to: query.to ?? '',
    actorId: query.actorId ?? '',
    action: query.action ?? '',
    projectCode: query.projectCode ?? '',
  }).toString()}`;

  return (
    <Shell actor={actor} current="/cabinet/manage/audit">
      <Mono>Журналы</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {files ? 'Доступ к файлам' : 'Журнал действий'}
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        {files
          ? 'Каждая выдача файла клиента отражена строкой: кто, что и когда получил. Журнал ведётся отдельно от журнала действий — он растёт быстрее и нужен при разборе утечки.'
          : 'Кто и что изменил. Действующее лицо хранится идентификатором, содержимое — изменившимися полями: персональные данные сверх необходимого в журнал не пишутся.'}
      </Text>

      <Tabs
        label="Виды журналов"
        items={[
          { href: '/cabinet/manage/audit', label: 'Действия', active: !files },
          { href: '/cabinet/manage/audit?kind=files', label: 'Доступ к файлам', active: files },
        ]}
      />

      <Card style={{ marginBottom: 24 }}>
        <Form method="get">
          {files ? <input type="hidden" name="kind" value="files" /> : null}
          <FormRow>
            <Field label="С даты" name="from" type="date" defaultValue={query.from ?? ''} />
            <Field label="По дату" name="to" type="date" defaultValue={query.to ?? ''} />
            <Select label="Действующее лицо" name="actorId" defaultValue={query.actorId ?? ''}>
              <option value="">все</option>
              {actors.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
            <Select label="Действие" name="action" defaultValue={query.action ?? ''}>
              <option value="">любое</option>
              {(files ? Object.keys(FILE_ACTION_LABEL) : actions).map((value) => (
                <option key={value} value={value}>
                  {files ? FILE_ACTION_LABEL[value] : value}
                </option>
              ))}
            </Select>
            <Field
              label="Код проекта"
              name="projectCode"
              defaultValue={query.projectCode ?? ''}
              placeholder="PD-2026-001"
            />
          </FormRow>
          <FormActions>
            <Button>Показать</Button>
            <ButtonLink href={exportHref}>Выгрузить CSV</ButtonLink>
          </FormActions>
        </Form>
      </Card>

      {files ? (
        accesses.length === 0 ? (
          <Empty title="Записей нет">За выбранный период файлы не выдавались.</Empty>
        ) : (
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Когда</th>
                  <th style={TABLE_HEAD} scope="col">Кто</th>
                  <th style={TABLE_HEAD} scope="col">Действие</th>
                  <th style={TABLE_HEAD} scope="col">Проект</th>
                  <th style={TABLE_HEAD} scope="col">Файл</th>
                  <th style={TABLE_HEAD} scope="col">Адрес</th>
                </tr>
              </thead>
              <tbody>
                {accesses.map((event) => (
                  <tr key={event.id}>
                    <td style={TABLE_CELL}>{formatMoment(event.occurredAt)}</td>
                    <td style={TABLE_CELL}>{event.user?.fullName ?? '—'}</td>
                    <td style={TABLE_CELL}>
                      <Chip tone={event.action === 'PURGE' ? 'accent' : 'neutral'}>
                        {FILE_ACTION_LABEL[event.action] ?? event.action}
                      </Chip>
                    </td>
                    <td style={TABLE_CELL}>{event.version.material.project.code}</td>
                    <td style={TABLE_CELL}>
                      {event.version.material.title}
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        версия {event.version.number} · {event.version.originalName}
                      </div>
                    </td>
                    <td style={TABLE_CELL}>{event.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : events.length === 0 ? (
        <Empty title="Записей нет">За выбранный период действий не совершалось.</Empty>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Когда</th>
                <th style={TABLE_HEAD} scope="col">Кто</th>
                <th style={TABLE_HEAD} scope="col">Действие</th>
                <th style={TABLE_HEAD} scope="col">Объект</th>
                <th style={TABLE_HEAD} scope="col">Подробности</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td style={TABLE_CELL}>{formatMoment(event.occurredAt)}</td>
                  <td style={TABLE_CELL}>
                    {event.actor?.fullName ?? 'система'}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{event.actorRole ?? ''}</div>
                  </td>
                  <td style={TABLE_CELL}>{event.action}</td>
                  <td style={TABLE_CELL}>
                    {event.objectType}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>{event.objectId ?? ''}</div>
                  </td>
                  <td style={{ ...TABLE_CELL, maxWidth: 320, wordBreak: 'break-word' }}>
                    {event.payload === null ? '—' : JSON.stringify(event.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Text muted size={13} style={{ marginTop: 12 }}>
        Показано не более 200 записей. Для разбора за период пользуйтесь выгрузкой.
      </Text>
    </Shell>
  );
}
