import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Heading,
  Mono,
  STAGE_STATE_LABEL,
  Select,
  Text,
  Tile,
  Tiles,
  formatDate,
  type StageStateKey,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
} from '../../../components/cabinet/ui';
import { MONO, SANS } from '../../../components/cabinet/tokens';
import { can } from '../../../lib/cabinet/access';
import { formatAmount, formatPlain } from '../../../lib/cabinet/money';
import { unreadInbox } from '../../../lib/cabinet/messages';
import { leadQueue, serviceTypes, trafficLight } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
import { OVERHEAD_PERCENT, activeWorks, practiceSummary } from '../../../lib/cabinet/summary';
import { moderateLead } from '../actions';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  landing: 'Посадочная',
  postgrad: 'Аспирантам',
  students: 'Студентам',
  business: 'Бизнесу',
  cabinet: 'Из кабинета',
};

export default async function ManageQueue() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_MODERATE')) redirect('/cabinet/projects');

  const [leads, types, light] = await Promise.all([
    leadQueue(actor),
    serviceTypes(),
    trafficLight(actor),
  ]);

  // Сводка — это деньги практики, и её видит только тот, кому открыта маржа.
  const summary = can(actor, 'MARGIN_VIEW') ? await practiceSummary(actor) : null;
  const works = summary === null ? [] : await activeWorks(actor);
  const unread = await unreadInbox(actor);

  // «Требует внимания» — то, что нельзя оставить как есть: сорванный срок,
  // работа, которая ждёт клиента дольше двух недель, и непрочитанное
  // сообщение. У менеджера это главный экран целиком, у руководителя —
  // раздел под сводкой (решение Р-149).
  const attention = [
    ...light.overdue.map((stage) => ({
      key: `overdue-${stage.id}`,
      what: 'Сорван срок этапа',
      detail: `${stage.title} · ${stage.project.code} · ${stage.project.client.fullName}`,
      when: stage.dueOn === null ? null : `срок ${formatDate(stage.dueOn)}`,
      href: `/cabinet/stages/${stage.id}`,
    })),
    ...light.stalled.map((stage) => ({
      key: `stalled-${stage.id}`,
      what: 'Ждёт клиента дольше двух недель',
      detail: `${stage.title} · ${stage.project.code} · ${stage.project.client.fullName}`,
      when:
        stage.awaitingClientSince === null
          ? null
          : `с ${formatDate(stage.awaitingClientSince)}`,
      href: `/cabinet/stages/${stage.id}`,
    })),
    ...unread.map((row) => ({
      key: `unread-${row.code}`,
      what: `Непрочитанных сообщений: ${row.count}`,
      detail: `${row.title} · ${row.code}`,
      when: null,
      href: `/cabinet/projects/${row.code}/messages`,
    })),
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage">
      {summary === null ? null : (
        <section style={{ marginBottom: 36 }}>
          <Heading level={1} style={{ margin: '0 0 20px' }}>Практика</Heading>
          <Tiles>
            <Tile label="Заказов" value={String(summary.orders)} note={`${summary.active} в работе`} />
            <Tile label="Выручка" value={formatAmount(summary.received)} note="получено" />
            <Tile
              label="Прибыль"
              value={formatAmount(summary.profit)}
              note={`выручка минус ${OVERHEAD_PERCENT} % расходов`}
            />
            <Tile label="К получению" value={formatAmount(summary.outstanding)} note="не оплачено" />
          </Tiles>
        </section>
      )}

      {works.length === 0 ? null : (
        <section style={{ marginBottom: 36 }}>
          <Heading level={2} style={{ marginBottom: 12 }}>Сейчас в работе</Heading>
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Работа</th>
                  <th style={TABLE_HEAD} scope="col">Этап</th>
                  <th style={TABLE_HEAD} scope="col">Срок</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Договор, ₽</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Оплачено, ₽</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Остаток, ₽</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr key={work.code}>
                    <td style={TABLE_CELL}>
                      <a href={`/cabinet/projects/${work.code}`}>{work.title}</a>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--pd-ink-muted)' }}>
                        {work.code} · {work.client}
                      </div>
                    </td>
                    <td style={TABLE_CELL}>
                      {work.stage ?? '—'}
                      {work.stageState === null ? null : (
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                          {STAGE_STATE_LABEL[work.stageState as StageStateKey]}
                        </div>
                      )}
                    </td>
                    <td style={TABLE_CELL}>{formatDate(work.dueOn) ?? '—'}</td>
                    <td style={TABLE_NUM}>{formatPlain(work.contracted)}</td>
                    <td style={TABLE_NUM}>{formatPlain(work.received)}</td>
                    <td style={{ ...TABLE_NUM, color: work.outstanding > 0n ? 'var(--pd-ink)' : undefined }}>
                      {work.outstanding > 0n ? formatPlain(work.outstanding) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section style={{ marginBottom: 36 }}>
        {summary === null ? (
          <Heading level={1} style={{ margin: '0 0 20px' }}>Требует внимания</Heading>
        ) : (
          <Heading level={2} style={{ marginBottom: 12 }}>Требует внимания</Heading>
        )}
        {attention.length === 0 ? (
          <Card>
            <Text muted>Сейчас ничего не требует вмешательства.</Text>
          </Card>
        ) : (
          <Card>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {attention.map((row) => (
                <li
                  key={row.key}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    borderBottom: '1px solid var(--pd-divider)',
                    paddingBottom: 14,
                  }}
                >
                  <div style={{ flex: '1 1 420px', minWidth: 0 }}>
                    <Text size={15}>
                      <strong style={{ fontWeight: 600 }}>{row.what}</strong>
                    </Text>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {row.detail}
                      {row.when === null ? '' : ` · ${row.when}`}
                    </Text>
                  </div>
                  <a className="cab-mark" href={row.href}>
                    Открыть
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Heading level={2} style={{ marginBottom: 12 }}>Заявки на рассмотрении</Heading>

      {leads.length === 0 ? (
        <Empty title="Новых заявок нет" />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 20 }}>
          {leads.map((lead) => (
            <Card as="li" key={lead.id}>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <Chip tone="accent">{SOURCE_LABEL[lead.source] ?? lead.source}</Chip>
                <Chip mono>{formatDate(lead.createdAt)}</Chip>
                {lead.consentGiven ? <Chip>согласие получено</Chip> : null}
              </div>

              <Heading level={2} style={{ marginBottom: 8 }}>
                {lead.name ?? 'Без имени'}
              </Heading>
              <Text size={14} style={{ marginBottom: 4 }}>
                {lead.contactKind === 'email' ? 'Почта' : 'Телефон'}: {lead.contact}
              </Text>
              {lead.topic === null ? null : (
                <Text size={14} style={{ marginBottom: 4 }}>
                  Тема: {lead.topic}
                </Text>
              )}
              {lead.message === null ? null : (
                <Text muted size={14} style={{ marginBottom: 4 }}>
                  {lead.message}
                </Text>
              )}

              <div
                className="cab-two"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
                  gap: 24,
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid var(--pd-divider)',
                  alignItems: 'start',
                }}
              >
                {/* minmax(0,1fr): колонка по содержимому растягивалась под самый
                    длинный вариант в списке типов, и на экране уже 420 px форма
                    вылезала за край страницы (решение Р-130). */}
                <form
                  action={moderateLead}
                  style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}
                >
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <Field
                    label="Название проекта"
                    name="title"
                    required
                    defaultValue={lead.topic ?? ''}
                    placeholder="Сопровождение кандидатской диссертации"
                  />
                  <Select label="Тип сопровождения" name="serviceTypeId" required>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" name="applyTemplate" style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 14 }}>Применить шаблон этапов этого типа</span>
                  </label>
                  <div>
                    <Button>Одобрить и создать проект</Button>
                  </div>
                </form>

                <form
                  action={moderateLead}
                  style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}
                >
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <Field
                    label="Причина отказа"
                    name="reason"
                    required
                    multiline
                    hint="Причину видит заявитель, поэтому она пишется человеческим языком."
                  />
                  <div>
                    <Button tone="quiet">Отклонить</Button>
                  </div>
                </form>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </Shell>
  );
}
