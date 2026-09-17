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
  Text,
  Tile,
  Tiles,
  formatDate,
  type StageStateKey,
} from '../../../components/cabinet/ui';
import { MONO, SANS } from '../../../components/cabinet/tokens';
import { can } from '../../../lib/cabinet/access';
import { formatAmount, formatPlain } from '../../../lib/cabinet/money';
import { leadQueue, serviceTypes, trafficLight } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
import { OVERHEAD_PERCENT, activeWorks, practiceSummary } from '../../../lib/cabinet/summary';
import { moderateLead } from '../actions';

export const dynamic = 'force-dynamic';

const cell: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--pd-divider)',
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--pd-ink-secondary)',
  textAlign: 'left',
  verticalAlign: 'top',
};

const num: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const head: React.CSSProperties = {
  ...cell,
  fontWeight: 500,
  color: 'var(--pd-ink)',
  background: 'var(--pd-surface-quiet)',
  whiteSpace: 'nowrap',
};

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
                  <th style={head} scope="col">Работа</th>
                  <th style={head} scope="col">Этап</th>
                  <th style={head} scope="col">Срок</th>
                  <th style={{ ...head, textAlign: 'right' }} scope="col">Договор, ₽</th>
                  <th style={{ ...head, textAlign: 'right' }} scope="col">Оплачено, ₽</th>
                  <th style={{ ...head, textAlign: 'right' }} scope="col">Остаток, ₽</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr key={work.code}>
                    <td style={cell}>
                      <a href={`/cabinet/projects/${work.code}`}>{work.title}</a>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--pd-ink-muted)' }}>
                        {work.code} · {work.client}
                      </div>
                    </td>
                    <td style={cell}>
                      {work.stage ?? '—'}
                      {work.stageState === null ? null : (
                        <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                          {STAGE_STATE_LABEL[work.stageState as StageStateKey]}
                        </div>
                      )}
                    </td>
                    <td style={cell}>{formatDate(work.dueOn) ?? '—'}</td>
                    <td style={num}>{formatPlain(work.contracted)}</td>
                    <td style={num}>{formatPlain(work.received)}</td>
                    <td style={{ ...num, color: work.outstanding > 0n ? 'var(--pd-ink)' : undefined }}>
                      {work.outstanding > 0n ? formatPlain(work.outstanding) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {light.overdue.length + light.stalled.length === 0 ? null : (
            <Text muted size={14} style={{ marginTop: 12 }}>
              Требуют вмешательства: просрочено этапов — {light.overdue.length}, ждут клиента дольше
              двух недель — {light.stalled.length}.{' '}
              <a href="/cabinet/manage/registry">Реестры</a>
            </Text>
          )}
        </section>
      )}

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
                {lead.consentGiven ? <Chip tone="ok">согласие получено</Chip> : null}
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
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Тип сопровождения</span>
                    <select
                      name="serviceTypeId"
                      required
                      style={{
                        minHeight: 44,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--pd-edge-neutral)',
                        background: 'var(--pd-ink-inverse)',
                        // Список выбора сам по себе не сжимается ниже своего
                        // самого длинного варианта: ширину задаём явно.
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
